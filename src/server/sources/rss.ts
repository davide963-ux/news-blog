import { XMLParser } from 'fast-xml-parser';
import { htmlToText, cleanText } from '../text';
import type { FeedResult, RawItem } from './types';

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  textNodeName: '#text',
  processEntities: true,
  trimValues: true,
  parseTagValue: false,
});

const arr = <T>(v: T | T[] | undefined): T[] => (v === undefined || v === null ? [] : Array.isArray(v) ? v : [v]);
const txt = (v: unknown): string => {
  if (v == null) return '';
  if (typeof v === 'string') return v;
  if (typeof v === 'object') {
    const o = v as Record<string, unknown>;
    return txt(o['#text'] ?? o['__cdata'] ?? '');
  }
  return String(v);
};

function parseDate(v: unknown): Date | undefined {
  const s = txt(v);
  if (!s) return undefined;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

function imageFrom(it: Record<string, unknown>): string | undefined {
  for (const m of arr(it['media:content'] as never) as Record<string, unknown>[]) {
    const url = m?.['@_url'] as string | undefined;
    const type = (m?.['@_type'] as string | undefined) ?? '';
    const medium = (m?.['@_medium'] as string | undefined) ?? '';
    if (url && (medium === 'image' || type.startsWith('image') || /\.(jpe?g|png|webp)(\?|$)/i.test(url))) return url;
  }
  const thumb = arr(it['media:thumbnail'] as never)[0] as Record<string, unknown> | undefined;
  if (thumb?.['@_url']) return String(thumb['@_url']);
  const enc = arr(it['enclosure'] as never)[0] as Record<string, unknown> | undefined;
  if (enc?.['@_url'] && String(enc['@_type'] ?? '').startsWith('image')) return String(enc['@_url']);
  return undefined;
}

export function parseFeed(xml: string): RawItem[] {
  const doc = parser.parse(xml);
  const out: RawItem[] = [];

  // RSS 2.0 / RSS 1.0 (RDF)
  const channel = doc?.rss?.channel ?? doc?.['rdf:RDF']?.channel;
  const rssItems = arr(doc?.rss?.channel?.item ?? doc?.['rdf:RDF']?.item);
  if (channel || rssItems.length) {
    for (const it of rssItems as Record<string, unknown>[]) {
      const link = txt(it.link) || txt(it.guid);
      const title = cleanText(htmlToText(txt(it.title)));
      if (!link || !title) continue;
      const full = txt(it['content:encoded']);
      const desc = txt(it.description);
      out.push({
        url: link.trim(),
        guid: txt(it.guid) || undefined,
        title,
        summary: htmlToText(desc) || undefined,
        contentText: full ? htmlToText(full) : undefined,
        author: txt(it['dc:creator']) || txt(it.author) || undefined,
        imageUrl: imageFrom(it),
        publishedAt: parseDate(it.pubDate ?? it['dc:date']),
        meta: { categories: arr(it.category as never).map(txt).filter(Boolean) },
      });
    }
    return out;
  }

  // Atom
  const feed = doc?.feed;
  if (feed) {
    for (const e of arr(feed.entry) as Record<string, unknown>[]) {
      const links = arr(e.link as never) as Record<string, unknown>[];
      const alt = links.find((l) => !l['@_rel'] || l['@_rel'] === 'alternate') ?? links[0];
      const link = typeof alt === 'string' ? alt : String(alt?.['@_href'] ?? '');
      const title = cleanText(htmlToText(txt(e.title)));
      if (!link || !title) continue;
      const content = txt(e.content);
      out.push({
        url: link,
        guid: txt(e.id) || undefined,
        title,
        summary: htmlToText(txt(e.summary)) || undefined,
        contentText: content ? htmlToText(content) : undefined,
        author: txt((e.author as Record<string, unknown> | undefined)?.name) || undefined,
        imageUrl: imageFrom(e),
        publishedAt: parseDate(e.published ?? e.updated),
        meta: {},
      });
    }
  }
  return out;
}
