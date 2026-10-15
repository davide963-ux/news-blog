import { ImageResponse } from 'next/og';
import { getArticlePage, getSiteConfig } from '@/lib/queries';

export const runtime = 'nodejs';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';
export const alt = 'Article card';

/** Text-only share card (never depicts a real event). Used when an article has no licensed image. */
export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const [data, site] = await Promise.all([getArticlePage(slug), getSiteConfig()]);
  const title = data?.article.title ?? site.name;
  const cat = data?.article.category.name ?? '';
  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', background: '#16161a', color: '#f5f2ea', padding: 64, fontFamily: 'Georgia, serif' }}>
        <div style={{ display: 'flex', fontSize: 28, letterSpacing: 6, textTransform: 'uppercase', color: '#f05a62', fontFamily: 'sans-serif', fontWeight: 700 }}>{cat}</div>
        <div style={{ display: 'flex', fontSize: title.length > 90 ? 56 : 68, fontWeight: 800, lineHeight: 1.12 }}>{title}</div>
        <div style={{ display: 'flex', fontSize: 34, fontWeight: 900, borderTop: '3px solid #f5f2ea', paddingTop: 20 }}>{site.name}</div>
      </div>
    ),
    size,
  );
}
