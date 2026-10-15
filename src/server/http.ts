import { promises as dns } from 'node:dns';
import net from 'node:net';
import robotsParser from 'robots-parser';
import { env } from '@/lib/env';
import { sleep } from '@/lib/utils';

export class FetchError extends Error {
  constructor(message: string, public status?: number, public retryable = true) { super(message); }
}

export const USER_AGENT = () => `NewsBlogBot/1.0 (+${env.appUrl}/about; ${env.botContact})`;

function isPrivateIp(ip: string): boolean {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split('.').map(Number);
    return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224;
  }
  const v = ip.toLowerCase();
  return v === '::1' || v === '::' || v.startsWith('fc') || v.startsWith('fd') || v.startsWith('fe80') || v.startsWith('::ffff:127.') || v.startsWith('::ffff:10.') || v.startsWith('::ffff:192.168.');
}

/** SSRF guard: only public http(s) hosts. */
export async function assertPublicUrl(raw: string): Promise<URL> {
  let u: URL;
  try { u = new URL(raw); } catch { throw new FetchError(`Invalid URL: ${raw}`, undefined, false); }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') throw new FetchError(`Unsupported protocol ${u.protocol}`, undefined, false);
  if (u.username || u.password) throw new FetchError('Credentials in URL are not allowed', undefined, false);
  if (process.env.ALLOW_PRIVATE_FETCH === '1') return u; // tests only
  const host = u.hostname.replace(/^\[|\]$/g, '');
  if (host === 'localhost' || host.endsWith('.local') || host.endsWith('.internal')) throw new FetchError('Blocked host', undefined, false);
  if (net.isIP(host)) { if (isPrivateIp(host)) throw new FetchError('Blocked private address', undefined, false); return u; }
  try {
    const addrs = await dns.lookup(host, { all: true });
    if (!addrs.length || addrs.some((a) => isPrivateIp(a.address))) throw new FetchError('Host resolves to a private address', undefined, false);
  } catch (e) {
    if (e instanceof FetchError) throw e;
    throw new FetchError(`DNS lookup failed for ${host}`, undefined, true);
  }
  return u;
}

export interface FetchResult { status: number; url: string; headers: Headers; body: Buffer; contentType: string }

export async function safeFetch(url: string, opts: { headers?: Record<string, string>; timeoutMs?: number; maxBytes?: number; accept?: string; allowNotModified?: boolean } = {}): Promise<FetchResult> {
  let current = url;
  for (let hop = 0; hop < 5; hop++) {
    await assertPublicUrl(current);
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), opts.timeoutMs ?? 15_000);
    let res: Response;
    try {
      res = await fetch(current, {
        redirect: 'manual',
        signal: ctl.signal,
        headers: { 'user-agent': USER_AGENT(), accept: opts.accept ?? '*/*', 'accept-language': 'en', ...opts.headers },
      });
    } catch (e) {
      throw new FetchError(`Network error fetching ${current}: ${(e as Error).name === 'AbortError' ? 'timeout' : (e as Error).message}`);
    } finally { clearTimeout(timer); }

    if (res.status >= 300 && res.status < 400 && res.headers.get('location')) {
      current = new URL(res.headers.get('location')!, current).toString();
      continue;
    }
    if (res.status === 304 && opts.allowNotModified) return { status: 304, url: current, headers: res.headers, body: Buffer.alloc(0), contentType: '' };
    if (res.status === 429 || res.status >= 500) throw new FetchError(`HTTP ${res.status} from ${current}`, res.status, true);
    if (res.status >= 400) throw new FetchError(`HTTP ${res.status} from ${current}`, res.status, false);

    const max = opts.maxBytes ?? 3_000_000;
    const declared = Number(res.headers.get('content-length') ?? 0);
    if (declared > max) throw new FetchError(`Response too large (${declared} bytes)`, res.status, false);
    const reader = res.body?.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    if (reader) {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        total += value.length;
        if (total > max) { await reader.cancel(); throw new FetchError('Response exceeded size limit', res.status, false); }
        chunks.push(value);
      }
    }
    return { status: res.status, url: current, headers: res.headers, body: Buffer.concat(chunks), contentType: res.headers.get('content-type') ?? '' };
  }
  throw new FetchError('Too many redirects', undefined, false);
}

/* ---------------- robots.txt ---------------- */
type Robots = ReturnType<typeof robotsParser>;
const robotsCache = new Map<string, { at: number; robots: Robots | null; unreachable: boolean }>();

export async function robotsFor(url: string): Promise<{ robots: Robots | null; unreachable: boolean }> {
  const u = new URL(url);
  const origin = u.origin;
  const hit = robotsCache.get(origin);
  if (hit && Date.now() - hit.at < 3_600_000) return hit;
  let entry: { at: number; robots: Robots | null; unreachable: boolean };
  try {
    const r = await safeFetch(`${origin}/robots.txt`, { timeoutMs: 8000, maxBytes: 500_000 });
    entry = { at: Date.now(), robots: robotsParser(`${origin}/robots.txt`, r.body.toString('utf8')), unreachable: false };
  } catch (e) {
    const status = e instanceof FetchError ? e.status : undefined;
    // 4xx => no robots file => everything allowed. Network/5xx => be conservative.
    entry = status && status >= 400 && status < 500 ? { at: Date.now(), robots: null, unreachable: false } : { at: Date.now(), robots: null, unreachable: true };
  }
  robotsCache.set(origin, entry);
  return entry;
}

export async function isAllowedByRobots(url: string): Promise<{ allowed: boolean; crawlDelay?: number; reason?: string }> {
  const { robots, unreachable } = await robotsFor(url);
  if (unreachable) return { allowed: false, reason: 'robots.txt unreachable (server error/timeout)' };
  if (!robots) return { allowed: true };
  const ua = 'NewsBlogBot';
  const allowed = robots.isAllowed(url, ua);
  if (allowed === false) return { allowed: false, reason: 'Disallowed by robots.txt' };
  return { allowed: true, crawlDelay: robots.getCrawlDelay(ua) };
}

/* Polite per-host spacing within one invocation. */
const lastHit = new Map<string, number>();
export async function politeWait(url: string, minGapMs = 1000) {
  const host = new URL(url).host;
  const wait = (lastHit.get(host) ?? 0) + minGapMs - Date.now();
  lastHit.set(host, Math.max(Date.now(), (lastHit.get(host) ?? 0) + minGapMs));
  if (wait > 0) await sleep(Math.min(wait, 10_000));
}
