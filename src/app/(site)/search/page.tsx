import type { Metadata } from 'next';
import { searchArticles, getTrending } from '@/lib/queries';
import { ListCard, Pagination, TrendingList } from '@/components/site/cards';
import { clientIp, rateLimit } from '@/lib/rate-limit';
import { headers } from 'next/headers';

export const dynamic = 'force-dynamic';
type Props = { searchParams: Promise<{ q?: string; page?: string }> };

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const { q } = await searchParams;
  return { title: q ? `Search: ${q.slice(0, 60)}` : 'Search', robots: { index: false, follow: true } };
}

export default async function SearchPage({ searchParams }: Props) {
  const { q = '', page: p } = await searchParams;
  const page = Math.max(1, Math.min(100, parseInt(p ?? '1', 10) || 1));
  const rl = q ? await rateLimit(`search:${clientIp(await headers())}`, 60, 60) : { ok: true };
  const [res, trending] = await Promise.all([rl.ok ? searchArticles(q, page) : Promise.resolve(null), getTrending(5)]);
  return (
    <main className="mx-auto max-w-page px-4 py-8">
      <header className="border-b-2 border-ink pb-4"><h1 className="headline text-4xl">Search</h1></header>
      <form action="/search" role="search" className="mt-6 flex gap-2">
        <label htmlFor="sq" className="sr-only">Search query</label>
        <input id="sq" name="q" type="search" defaultValue={q} placeholder="Search stories, topics, names…" className="input !py-3 !text-base" autoFocus={!q} />
        <button className="btn btn-primary shrink-0 !px-6">Search</button>
      </form>
      <div className="mt-8 grid gap-10 lg:grid-cols-12">
        <div className="lg:col-span-8">
          {!rl.ok && <p className="text-muted">Too many searches — please wait a moment.</p>}
          {res && q && <p className="mb-5 text-sm text-muted" role="status">{res.total} result{res.total === 1 ? '' : 's'} for “{q}”</p>}
          <div className="divide-y divide-line">{res?.items.map((c) => <ListCard key={c.id} c={c} />)}</div>
          {res && q && res.items.length === 0 && <p className="py-10 text-center text-muted">Nothing matched. Try fewer or different words.</p>}
          {res && <Pagination page={page} pages={res.pages} base={`/search?q=${encodeURIComponent(q)}`} />}
        </div>
        <aside className="lg:col-span-4"><TrendingList items={trending} /></aside>
      </div>
    </main>
  );
}
