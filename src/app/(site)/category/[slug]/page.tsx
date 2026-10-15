import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { getCategoryPage, getTrending } from '@/lib/queries';
import { GridCard, LeadCard, Pagination, TrendingList } from '@/components/site/cards';
import { abs, breadcrumbJsonLd } from '@/lib/seo';

export const dynamic = 'force-dynamic';
type Props = { params: Promise<{ slug: string }>; searchParams: Promise<{ page?: string }> };
const pageNo = (p?: string) => Math.max(1, Math.min(500, parseInt(p ?? '1', 10) || 1));

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const [{ slug }, sp] = await Promise.all([params, searchParams]);
  const page = pageNo(sp.page);
  const data = await getCategoryPage(slug, page);
  if (!data) return { title: 'Section not found', robots: { index: false } };
  const canonical = abs(`/category/${slug}${page > 1 ? `?page=${page}` : ''}`);
  const desc = data.category.description ?? `Latest ${data.category.name} news and analysis.`;
  return { title: `${data.category.name} News${page > 1 ? ` — Page ${page}` : ''}`, description: desc, alternates: { canonical }, openGraph: { title: `${data.category.name} News`, description: desc, url: canonical } };
}

export default async function CategoryPage({ params, searchParams }: Props) {
  const [{ slug }, sp] = await Promise.all([params, searchParams]);
  const page = pageNo(sp.page);
  const [data, trending] = await Promise.all([getCategoryPage(slug, page), getTrending(5)]);
  if (!data) notFound();
  const [lead, ...rest] = data.items;
  const crumbs = [{ name: 'Home', path: '/' }, { name: data.category.name, path: `/category/${slug}` }];
  return (
    <main className="mx-auto max-w-page px-4 py-8">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd(crumbs)) }} />
      <nav aria-label="Breadcrumb" className="text-xs text-muted"><ol className="flex gap-2"><li><Link href="/" className="hover:underline">Home</Link></li><li aria-hidden>/</li><li aria-current="page" className="text-ink">{data.category.name}</li></ol></nav>
      <header className="mb-8 mt-3 border-b-2 border-ink pb-4">
        <h1 className="headline text-4xl sm:text-5xl">{data.category.name}</h1>
        {data.category.description && <p className="mt-2 max-w-2xl text-muted">{data.category.description}</p>}
      </header>
      {!lead ? (
        <p className="py-16 text-center text-muted">No {data.category.name.toLowerCase()} stories have been published yet.</p>
      ) : (
        <div className="grid gap-10 lg:grid-cols-12">
          <div className="lg:col-span-8">
            {page === 1 && <LeadCard c={lead} />}
            <div className={`grid gap-x-6 gap-y-10 sm:grid-cols-2 ${page === 1 ? 'mt-10 border-t border-line pt-10' : ''}`}>
              {(page === 1 ? rest : data.items).map((c) => <GridCard key={c.id} c={c} />)}
            </div>
            <Pagination page={page} pages={data.pages} base={`/category/${slug}`} />
          </div>
          <aside className="lg:col-span-4"><div className="lg:sticky lg:top-20"><TrendingList items={trending} /></div></aside>
        </div>
      )}
    </main>
  );
}
