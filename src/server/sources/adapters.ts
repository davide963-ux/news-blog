import * as cheerio from 'cheerio';
import type { Source } from '@prisma/client';
import { decrypt } from '@/lib/crypto';
import { safeFetch, isAllowedByRobots, FetchError, politeWait } from '../http';
import { parseFeed } from './rss';
import { cleanText } from '../text';
import type { FeedResult, HtmlListConfig, JsonApiConfig, RawItem } from './types';

function sourceHeaders(source: Source): Record<string, string> {
  if (!source.headersEnc) return {};
  try { return JSON.parse(decrypt(source.headersEnc)) as Record<string, string>; } catch { return {}; }
}

function absolute(href: string | undefined, base: string): string | undefined {
  if (!href) return undefined;
  try { return new URL(href, base).toString(); } catch { return undefined; }
}

function getPath(obj: unknown, path?: string): unknown {
  if (!path) return undefined;
  return path.split('.').reduce<unknown>((acc, k) => {
    if (acc == null) return undefined;
    if (Array.isArray(acc) && /^\d+$/.test(k)) return acc[Number(k)];
    return (acc as Record<string, unknown>)[k];
  }, obj);
}

async function fetchRss(source: Source): Promise<FeedResult> {
  const headers: Record<string, string> = { ...sourceHeaders(source) };
  if (source.etag) headers['if-none-match'] = source.etag;
  if (source.lastModified) headers['if-modified-since'] = source.lastModified;
  const res = await safeFetch(source.feedUrl, { headers, accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml;q=0.9, */*;q=0.5', allowNotModified: true, maxBytes: 5_000_000 });
  if (res.status === 304) return { items: [], notModified: true, etag: source.etag, lastModified: source.lastModified };
  const items = parseFeed(res.body.toString('utf8'));
  return { items, etag: res.headers.get('etag'), lastModified: res.headers.get('last-modified') };
}

async function fetchHtmlList(source: Source): Promise<FeedResult> {
  const cfg = source.config as unknown as HtmlListConfig | null;
  if (!cfg?.itemSelector) throw new FetchError('HTML_LIST source requires config.itemSelector', undefined, false);
  if (source.respectRobots) {
    const r = await isAllowedByRobots(source.feedUrl);
    if (!r.allowed) throw new FetchError(r.reason ?? 'Blocked by robots.txt', undefined, false);
  }
  const res = await safeFetch(source.feedUrl, { headers: sourceHeaders(source), accept: 'text/html' });
  const $ = cheerio.load(res.body.toString('utf8'));
  const items: RawItem[] = [];
  $(cfg.itemSelector).each((_, el) => {
    const node = $(el);
    const linkEl = cfg.linkSelector ? node.find(cfg.linkSelector).first() : node.is('a') ? node : node.find('a').first();
    const url = absolute(linkEl.attr('href'), res.url);
    const title = cleanText((cfg.titleSelector ? node.find(cfg.titleSelector).first().text() : linkEl.text()) || '');
    if (!url || !title) return;
    const dateEl = cfg.dateSelector ? node.find(cfg.dateSelector).first() : null;
    const dateRaw = dateEl ? (cfg.dateAttr ? dateEl.attr(cfg.dateAttr) : dateEl.attr('datetime') ?? dateEl.text()) : undefined;
    const d = dateRaw ? new Date(dateRaw) : undefined;
    items.push({
      url,
      title,
      summary: cfg.summarySelector ? cleanText(node.find(cfg.summarySelector).first().text()) || undefined : undefined,
      imageUrl: cfg.imageSelector ? absolute(node.find(cfg.imageSelector).first().attr('src'), res.url) : undefined,
      publishedAt: d && !Number.isNaN(d.getTime()) ? d : undefined,
    });
  });
  return { items };
}

async function fetchJsonApi(source: Source): Promise<FeedResult> {
  const cfg = source.config as unknown as JsonApiConfig | null;
  if (!cfg?.itemsPath || !cfg.urlPath || !cfg.titlePath) throw new FetchError('JSON_API source requires itemsPath, urlPath and titlePath', undefined, false);
  const res = await safeFetch(source.feedUrl, { headers: sourceHeaders(source), accept: 'application/json' });
  const json = JSON.parse(res.body.toString('utf8'));
  const list = getPath(json, cfg.itemsPath);
  if (!Array.isArray(list)) throw new FetchError(`itemsPath "${cfg.itemsPath}" did not resolve to an array`, undefined, false);
  const items: RawItem[] = [];
  for (const row of list) {
    const url = String(getPath(row, cfg.urlPath) ?? '');
    const title = cleanText(String(getPath(row, cfg.titlePath) ?? ''));
    if (!url || !title) continue;
    const date = cfg.datePath ? new Date(String(getPath(row, cfg.datePath))) : undefined;
    const content = cfg.contentPath ? String(getPath(row, cfg.contentPath) ?? '') : '';
    items.push({
      url,
      title,
      guid: cfg.idPath ? String(getPath(row, cfg.idPath) ?? '') || undefined : undefined,
      summary: cfg.summaryPath ? cleanText(String(getPath(row, cfg.summaryPath) ?? '')) || undefined : undefined,
      contentText: content ? cleanText(content.replace(/<[^>]+>/g, ' ')) : undefined,
      imageUrl: cfg.imagePath ? String(getPath(row, cfg.imagePath) ?? '') || undefined : undefined,
      author: cfg.authorPath ? String(getPath(row, cfg.authorPath) ?? '') || undefined : undefined,
      publishedAt: date && !Number.isNaN(date.getTime()) ? date : undefined,
    });
  }
  return { items };
}

export async function fetchSource(source: Source): Promise<FeedResult> {
  await politeWait(source.feedUrl, 500);
  switch (source.type) {
    case 'RSS': return fetchRss(source);
    case 'HTML_LIST': return fetchHtmlList(source);
    case 'JSON_API': return fetchJsonApi(source);
  }
}

export { sourceHeaders };
