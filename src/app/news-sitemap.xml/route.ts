import { getSitemapArticles, getSiteConfig } from '@/lib/queries';
import { abs, xmlEscape } from '@/lib/seo';

export const dynamic = 'force-dynamic';

/** Google News sitemap: only articles published in the last 48 hours (the eligibility window). */
export async function GET() {
  const [articles, site] = await Promise.all([getSitemapArticles().catch(() => []), getSiteConfig()]);
  const cutoff = Date.now() - 48 * 3600_000;
  const items = articles.filter((a) => new Date(a.publishedAt).getTime() >= cutoff).slice(0, 1000);
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:news="http://www.google.com/schemas/sitemap-news/0.9">
${items.map((a) => `  <url>
    <loc>${xmlEscape(abs(`/article/${a.slug}`))}</loc>
    <news:news>
      <news:publication><news:name>${xmlEscape(site.name)}</news:name><news:language>en</news:language></news:publication>
      <news:publication_date>${new Date(a.publishedAt).toISOString()}</news:publication_date>
      <news:title>${xmlEscape(a.title)}</news:title>
    </news:news>
  </url>`).join('\n')}
</urlset>`;
  return new Response(xml, { headers: { 'content-type': 'application/xml; charset=utf-8', 'cache-control': 'public, s-maxage=300, stale-while-revalidate=600' } });
}
