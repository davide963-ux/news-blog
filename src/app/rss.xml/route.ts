import { getFeedArticles, getSiteConfig } from '@/lib/queries';
import { abs, xmlEscape } from '@/lib/seo';

export const dynamic = 'force-dynamic';

export async function GET() {
  const [items, site] = await Promise.all([getFeedArticles(40).catch(() => []), getSiteConfig()]);
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom"><channel>
<title>${xmlEscape(site.name)}</title><link>${abs('/')}</link><description>${xmlEscape(site.description)}</description><language>en</language>
<atom:link href="${abs('/rss.xml')}" rel="self" type="application/rss+xml"/>
${items.map((a) => `<item><title>${xmlEscape(a.title)}</title><link>${abs(`/article/${a.slug}`)}</link><guid isPermaLink="true">${abs(`/article/${a.slug}`)}</guid><pubDate>${new Date(a.publishedAt).toUTCString()}</pubDate><category>${xmlEscape(a.category.name)}</category><description>${xmlEscape(a.excerpt)}</description></item>`).join('\n')}
</channel></rss>`;
  return new Response(xml, { headers: { 'content-type': 'application/rss+xml; charset=utf-8', 'cache-control': 'public, s-maxage=300, stale-while-revalidate=600' } });
}
