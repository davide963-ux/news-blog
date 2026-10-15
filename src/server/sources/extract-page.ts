import * as cheerio from 'cheerio';
import { safeFetch, isAllowedByRobots, politeWait, FetchError } from '../http';
import { cleanText } from '../text';

export interface PageContent {
  title?: string;
  text: string;
  author?: string;
  imageUrl?: string;
  publishedAt?: Date;
  language?: string;
  canonicalUrl?: string;
}

const NOISE = 'script,style,noscript,iframe,svg,form,nav,header,footer,aside,figure,figcaption,button,[role=navigation],[class*=share],[class*=social],[class*=related],[class*=newsletter],[class*=promo],[class*=advert],[class*=comment],[id*=comment],[class*=cookie],[class*=subscribe],[aria-hidden=true]';

function fromJsonLd($: cheerio.CheerioAPI): Partial<PageContent> {
  const out: Partial<PageContent> = {};
  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      const parsed = JSON.parse($(el).contents().text());
      const nodes: Record<string, unknown>[] = Array.isArray(parsed) ? parsed : parsed['@graph'] ? parsed['@graph'] : [parsed];
      for (const n of nodes) {
        const t = String(n['@type'] ?? '');
        if (!/(News)?Article|Report|BlogPosting/i.test(t)) continue;
        if (typeof n.articleBody === 'string' && n.articleBody.length > (out.text?.length ?? 0)) out.text = cleanText(n.articleBody);
        if (typeof n.headline === 'string') out.title ??= n.headline;
        if (typeof n.datePublished === 'string') { const d = new Date(n.datePublished); if (!Number.isNaN(d.getTime())) out.publishedAt ??= d; }
        const a = n.author as { name?: string } | { name?: string }[] | undefined;
        const name = Array.isArray(a) ? a[0]?.name : a?.name;
        if (name) out.author ??= name;
        const img = n.image as string | { url?: string } | (string | { url?: string })[] | undefined;
        const first = Array.isArray(img) ? img[0] : img;
        const iu = typeof first === 'string' ? first : first?.url;
        if (iu) out.imageUrl ??= iu;
      }
    } catch { /* ignore malformed JSON-LD */ }
  });
  return out;
}

/** Heuristic main-content extraction. Falls back to structured data when the DOM is unhelpful. */
export function extractFromHtml(html: string, pageUrl: string): PageContent {
  const $ = cheerio.load(html);
  const ld = fromJsonLd($);
  const meta = (p: string) => $(`meta[property="${p}"],meta[name="${p}"]`).attr('content');

  $(NOISE).remove();
  const candidates = ['[itemprop=articleBody]', 'article', '[class*=article-body]', '[class*=story-body]', '[class*=post-content]', '[class*=entry-content]', 'main', '[role=main]'];
  let best = '';
  for (const sel of candidates) {
    $(sel).each((_, el) => {
      const paras = $(el).find('p').map((__, p) => cleanText($(p).text())).get().filter((p) => p.length >= 40);
      const text = paras.join('\n\n');
      if (text.length > best.length) best = text;
    });
    if (best.length > 600) break;
  }
  if (best.length < 300) {
    const paras = $('p').map((_, p) => cleanText($(p).text())).get().filter((p) => p.length >= 60);
    if (paras.join('\n\n').length > best.length) best = paras.join('\n\n');
  }
  const text = (ld.text && ld.text.length > best.length * 0.8 ? ld.text : best).slice(0, 14_000);
  const published = ld.publishedAt ?? (meta('article:published_time') ? new Date(meta('article:published_time')!) : undefined);
  const img = ld.imageUrl ?? meta('og:image');
  let imageUrl: string | undefined;
  try { imageUrl = img ? new URL(img, pageUrl).toString() : undefined; } catch { /* ignore */ }
  return {
    title: cleanText(ld.title ?? meta('og:title') ?? $('h1').first().text() ?? '') || undefined,
    text,
    author: ld.author ?? meta('author') ?? undefined,
    imageUrl,
    publishedAt: published && !Number.isNaN(published.getTime()) ? published : undefined,
    language: $('html').attr('lang')?.slice(0, 2) || undefined,
    canonicalUrl: $('link[rel=canonical]').attr('href') || undefined,
  };
}

export async function fetchArticlePage(url: string, opts: { respectRobots: boolean; headers?: Record<string, string> }): Promise<PageContent> {
  if (opts.respectRobots) {
    const r = await isAllowedByRobots(url);
    if (!r.allowed) throw new FetchError(r.reason ?? 'Blocked by robots.txt', undefined, false);
    await politeWait(url, Math.max(1000, (r.crawlDelay ?? 0) * 1000));
  } else await politeWait(url, 1000);
  const res = await safeFetch(url, { headers: opts.headers, accept: 'text/html,application/xhtml+xml', maxBytes: 3_000_000 });
  if (!/html|xml/i.test(res.contentType)) throw new FetchError(`Unexpected content type ${res.contentType}`, res.status, false);
  return extractFromHtml(res.body.toString('utf8'), res.url);
}
