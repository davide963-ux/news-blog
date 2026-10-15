import Link from 'next/link';
import type { Card } from '@/lib/queries';
import { timeAgo } from '@/lib/utils';
import { ArticleImage } from './article-image';

const Meta = ({ c, showCat = true }: { c: Card; showCat?: boolean }) => (
  <p className="mt-2 flex flex-wrap items-center gap-x-2 text-xs text-muted">
    {showCat && <Link href={`/category/${c.categorySlug}`} className="kicker hover:underline">{c.categoryName}</Link>}
    <time dateTime={c.publishedAt}>{timeAgo(c.publishedAt)}</time>
  </p>
);

export function LeadCard({ c }: { c: Card }) {
  return (
    <article className="group">
      <Link href={`/article/${c.slug}`} className="block overflow-hidden"><ArticleImage card={c} priority sizes="(min-width:1024px) 780px, 100vw" className="transition duration-500 group-hover:scale-[1.015]" /></Link>
      <div className="mt-4">
        <div className="flex items-center gap-2">
          {c.isBreaking && <span className="rounded-sm bg-accent px-1.5 py-0.5 text-[0.65rem] font-black uppercase tracking-widest text-accent-ink">Breaking</span>}
          <Link href={`/category/${c.categorySlug}`} className="kicker hover:underline">{c.categoryName}</Link>
        </div>
        <h2 className="headline mt-2 text-[1.9rem] sm:text-4xl lg:text-[2.6rem]"><Link href={`/article/${c.slug}`} className="link-hover">{c.title}</Link></h2>
        <p className="mt-3 max-w-2xl font-serif text-lg leading-snug text-ink/80 sm:text-xl">{c.dek || c.summary}</p>
        <p className="mt-3 text-xs text-muted"><time dateTime={c.publishedAt}>{timeAgo(c.publishedAt)}</time>{c.sourceName && <> · Based on reporting by {c.sourceName}</>}</p>
      </div>
    </article>
  );
}

export function StackCard({ c }: { c: Card }) {
  return (
    <article className="group flex gap-3 py-4 first:pt-0 last:pb-0">
      <div className="min-w-0 flex-1">
        <Link href={`/category/${c.categorySlug}`} className="kicker hover:underline">{c.categoryName}</Link>
        <h3 className="headline mt-1 text-lg"><Link href={`/article/${c.slug}`} className="link-hover">{c.title}</Link></h3>
        <p className="mt-1 text-xs text-muted"><time dateTime={c.publishedAt}>{timeAgo(c.publishedAt)}</time></p>
      </div>
      <Link href={`/article/${c.slug}`} tabIndex={-1} aria-hidden className="w-24 shrink-0 self-start sm:w-28"><ArticleImage card={c} small sizes="112px" /></Link>
    </article>
  );
}

export function GridCard({ c }: { c: Card }) {
  return (
    <article className="group">
      <Link href={`/article/${c.slug}`} tabIndex={-1} aria-hidden className="block overflow-hidden"><ArticleImage card={c} small sizes="(min-width:1024px) 290px, (min-width:640px) 45vw, 100vw" className="transition duration-500 group-hover:scale-[1.03]" /></Link>
      <Meta c={c} />
      <h3 className="headline mt-1.5 text-xl"><Link href={`/article/${c.slug}`} className="link-hover">{c.title}</Link></h3>
      <p className="mt-2 line-clamp-3 text-sm leading-relaxed text-muted">{c.summary}</p>
    </article>
  );
}

export function ListCard({ c }: { c: Card }) {
  return (
    <article className="group grid gap-4 py-6 first:pt-0 sm:grid-cols-[minmax(0,15rem)_1fr]">
      <Link href={`/article/${c.slug}`} tabIndex={-1} aria-hidden className="block overflow-hidden"><ArticleImage card={c} small sizes="(min-width:640px) 240px, 100vw" className="transition duration-500 group-hover:scale-[1.03]" /></Link>
      <div>
        <Meta c={c} />
        <h3 className="headline mt-1.5 text-[1.45rem]"><Link href={`/article/${c.slug}`} className="link-hover">{c.title}</Link></h3>
        <p className="mt-2 line-clamp-3 font-serif text-[1.02rem] leading-snug text-ink/75">{c.excerpt}</p>
      </div>
    </article>
  );
}

export function TrendingList({ items, title = 'Trending' }: { items: Card[]; title?: string }) {
  if (!items.length) return null;
  return (
    <section aria-labelledby="trending-h" className="panel p-5">
      <h2 id="trending-h" className="mb-1 border-b-2 border-ink pb-2 font-serif text-xl font-black">{title}</h2>
      <ol className="divide-y divide-line">
        {items.map((c, i) => (
          <li key={c.id} className="flex gap-3 py-3.5">
            <span aria-hidden className="w-7 shrink-0 font-serif text-3xl font-black leading-none text-accent/80">{i + 1}</span>
            <div className="min-w-0">
              <Link href={`/article/${c.slug}`} className="font-serif text-[1.02rem] font-bold leading-snug link-hover">{c.title}</Link>
              <p className="mt-1 text-xs text-muted">{c.categoryName} · {timeAgo(c.publishedAt)}</p>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}

export function SectionHeader({ title, href }: { title: string; href?: string }) {
  return (
    <div className="mb-5 flex items-end justify-between border-b-2 border-ink pb-2">
      <h2 className="font-serif text-2xl font-black">{href ? <Link href={href} className="link-hover">{title}</Link> : title}</h2>
      {href && <Link href={href} className="text-xs font-bold uppercase tracking-wider text-accent hover:underline">More {title} →</Link>}
    </div>
  );
}

export function Pagination({ page, pages, base }: { page: number; pages: number; base: string }) {
  if (pages <= 1) return null;
  const href = (p: number) => `${base}${base.includes('?') ? '&' : '?'}page=${p}`;
  return (
    <nav aria-label="Pagination" className="mt-10 flex items-center justify-between border-t border-line pt-5 text-sm font-semibold">
      {page > 1 ? <Link className="btn" href={href(page - 1)} rel="prev">← Newer</Link> : <span />}
      <span className="text-muted">Page {page} of {pages}</span>
      {page < pages ? <Link className="btn" href={href(page + 1)} rel="next">Older →</Link> : <span />}
    </nav>
  );
}
