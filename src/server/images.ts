import type { Source } from '@prisma/client';
import { db } from '@/lib/db';
import { env } from '@/lib/env';
import { resolveAiKey, type Settings } from '@/lib/settings';
import { logger, errMsg } from '@/lib/logger';
import { safeFetch } from './http';
import { storeImage } from './storage';
import { hostOf } from '@/lib/utils';

export interface ChosenImage {
  kind: 'SOURCE_LICENSED' | 'STOCK' | 'AI_ILLUSTRATION' | 'FALLBACK';
  url?: string;
  smallUrl?: string;
  alt: string;
  credit?: string;
  creditUrl?: string;
  isAi: boolean;
}

interface Ctx {
  settings: Settings;
  title: string;
  riskLevel: number;
  searchQuery: string;
  altText: string;
  illustrationPrompt: string;
  source?: Pick<Source, 'allowImageReuse' | 'imageLicenseNote' | 'name' | 'siteUrl'> | null;
  sourceImageUrl?: string | null;
  itemId?: string;
}

async function recentlyUsed(): Promise<Set<string>> {
  const rows = await db.article.findMany({ where: { createdAt: { gte: new Date(Date.now() - 14 * 86400_000) }, imageUrl: { not: null } }, select: { imageUrl: true } });
  return new Set(rows.map((r) => r.imageUrl!));
}

async function trySourceImage(c: Ctx): Promise<ChosenImage | null> {
  // Policy: never reuse source images unless the admin has declared them licensed for reuse.
  if (!c.settings.images.useLicensedSourceImages || !c.source?.allowImageReuse || !c.sourceImageUrl) return null;
  const res = await safeFetch(c.sourceImageUrl, { maxBytes: 8_000_000, accept: 'image/*', timeoutMs: 20_000 });
  if (!res.contentType.startsWith('image/')) return null;
  const stored = await storeImage(res.body);
  return {
    kind: 'SOURCE_LICENSED', url: stored.url, smallUrl: stored.smallUrl,
    alt: c.altText || c.title,
    credit: `Image: ${c.source.name}${c.source.imageLicenseNote ? ` (${c.source.imageLicenseNote})` : ''}`,
    creditUrl: c.source.siteUrl, isAi: false,
  };
}

async function tryStock(c: Ctx): Promise<ChosenImage | null> {
  const provider = c.settings.images.stockProvider;
  const q = c.searchQuery.trim();
  if (provider === 'none' || !q) return null;
  const used = await recentlyUsed();
  if (provider === 'pexels' && env.pexelsKey) {
    const res = await safeFetch(`https://api.pexels.com/v1/search?query=${encodeURIComponent(q)}&orientation=landscape&per_page=10&size=large`, { headers: { authorization: env.pexelsKey }, accept: 'application/json' });
    const j = JSON.parse(res.body.toString('utf8')) as { photos?: Array<{ url: string; photographer: string; photographer_url: string; alt?: string; src: { large2x: string; medium: string } }> };
    const p = (j.photos ?? []).find((x) => !used.has(x.src.large2x));
    if (!p) return null;
    return { kind: 'STOCK', url: p.src.large2x, smallUrl: p.src.medium, alt: p.alt || c.altText || q, credit: `Illustrative photo: ${p.photographer} / Pexels`, creditUrl: p.url, isAi: false };
  }
  if (provider === 'unsplash' && env.unsplashKey) {
    const res = await safeFetch(`https://api.unsplash.com/search/photos?query=${encodeURIComponent(q)}&orientation=landscape&per_page=10`, { headers: { authorization: `Client-ID ${env.unsplashKey}`, 'accept-version': 'v1' }, accept: 'application/json' });
    const j = JSON.parse(res.body.toString('utf8')) as { results?: Array<{ alt_description?: string; urls: { regular: string; small: string }; user: { name: string; links: { html: string } }; links: { html: string; download_location: string } }> };
    const p = (j.results ?? []).find((x) => !used.has(x.urls.regular));
    if (!p) return null;
    // Unsplash API guideline: register the download when the photo is used.
    safeFetch(p.links.download_location, { headers: { authorization: `Client-ID ${env.unsplashKey}` } }).catch(() => undefined);
    return { kind: 'STOCK', url: p.urls.regular, smallUrl: p.urls.small, alt: p.alt_description || c.altText || q, credit: `Illustrative photo: ${p.user.name} / Unsplash`, creditUrl: `${p.user.links.html}?utm_source=news&utm_medium=referral`, isAi: false };
  }
  return null;
}

async function tryAiIllustration(c: Ctx): Promise<ChosenImage | null> {
  if (c.settings.images.aiIllustrations === 'off' || c.riskLevel > 0) return null; // never for sensitive/breaking news
  const key = process.env.OPENAI_API_KEY || (c.settings.ai.provider !== 'anthropic' ? resolveAiKey(c.settings) : '');
  if (!key) return null;
  const base = (c.settings.images.aiImageBaseUrl || 'https://api.openai.com/v1').replace(/\/+$/, '');
  const prompt = `Editorial illustration for a news article. Concept: ${c.illustrationPrompt || c.title}. Style: abstract, symbolic, flat vector / painterly, muted professional palette. Strict constraints: NOT a photograph, no photorealism, no text or lettering, no logos, no real or recognisable people, no depiction of specific real events.`;
  const t0 = Date.now();
  const res = await fetch(`${base}/images/generations`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` }, body: JSON.stringify({ model: c.settings.images.aiImageModel, prompt, size: '1536x1024', n: 1 }) });
  const ok = res.ok;
  await db.generationRun.create({ data: { itemId: c.itemId, kind: 'image', provider: 'openai', model: c.settings.images.aiImageModel, durationMs: Date.now() - t0, ok, error: ok ? undefined : `HTTP ${res.status}` } }).catch(() => undefined);
  if (!ok) return null;
  const j = (await res.json()) as { data?: Array<{ b64_json?: string; url?: string }> };
  const d = j.data?.[0];
  let buf: Buffer | null = null;
  if (d?.b64_json) buf = Buffer.from(d.b64_json, 'base64');
  else if (d?.url) buf = (await safeFetch(d.url, { maxBytes: 12_000_000 })).body;
  if (!buf) return null;
  const stored = await storeImage(buf);
  return { kind: 'AI_ILLUSTRATION', url: stored.url, smallUrl: stored.smallUrl, alt: `Illustration: ${c.altText || c.title}`, credit: 'AI-generated editorial illustration — not a photograph', isAi: true };
}

/** Selection order: licensed source image → licensed stock photo → AI illustration (if enabled) → on-site fallback. */
export async function chooseImage(c: Ctx): Promise<ChosenImage> {
  for (const step of [trySourceImage, tryStock, tryAiIllustration]) {
    try {
      const r = await step(c);
      if (r) return r;
    } catch (e) {
      await logger.warn('images', `${step.name} failed: ${errMsg(e)}`, { host: hostOf(c.sourceImageUrl ?? '') });
    }
  }
  return { kind: 'FALLBACK', alt: c.altText || c.title, isAi: false };
}
