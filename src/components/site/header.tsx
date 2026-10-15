import Link from 'next/link';
import { getBreaking, getCategories, getSiteConfig } from '@/lib/queries';
import { NavLinks } from './nav-links';
import { ThemeToggle } from './theme';
import { timeAgo } from '@/lib/utils';

export async function Header() {
  const [site, categories, breaking] = await Promise.all([getSiteConfig(), getCategories(), getBreaking().catch(() => [])]);
  const today = new Intl.DateTimeFormat('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date());
  return (
    <header className="bg-paper">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:rounded focus:bg-accent focus:px-3 focus:py-2 focus:text-accent-ink">Skip to content</a>
      <div className="border-b border-line">
        <div className="mx-auto flex max-w-page items-center justify-between px-4 py-1.5 text-xs text-muted">
          <span className="hidden sm:block">{today}</span>
          <span className="sm:hidden">{today.split(' ').slice(0, 3).join(' ')}</span>
          <div className="flex items-center gap-3">
            <Link href="/about" className="hover:text-ink">About &amp; policy</Link>
            <Link href="/rss.xml" className="hidden hover:text-ink sm:block">RSS</Link>
            <ThemeToggle />
          </div>
        </div>
      </div>
      <div className="mx-auto max-w-page px-4 py-5 text-center md:py-7">
        <Link href="/" className="inline-block">
          <span className="block font-serif text-[2.1rem] font-black leading-none tracking-tight text-ink sm:text-5xl md:text-6xl">{site.name}</span>
        </Link>
        <p className="mt-2 text-[0.7rem] font-semibold uppercase tracking-[0.22em] text-muted">{site.tagline}</p>
      </div>
      <div className="sticky top-0 z-40 border-y-2 border-ink bg-paper/95 backdrop-blur supports-[backdrop-filter]:bg-paper/85">
        <nav aria-label="Sections" className="mx-auto flex max-w-page items-center justify-between gap-3 px-4">
          <NavLinks categories={categories} />
          <form action="/search" role="search" className="hidden shrink-0 md:block">
            <label htmlFor="q" className="sr-only">Search news</label>
            <input id="q" name="q" type="search" placeholder="Search" className="w-40 rounded-full border border-line bg-card px-3.5 py-1.5 text-sm transition-all focus:w-56 focus:border-accent" />
          </form>
          <Link href="/search" aria-label="Search" className="shrink-0 rounded-full p-2 text-ink hover:bg-wash md:hidden">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
          </Link>
        </nav>
      </div>
      {breaking[0] && (
        <div className="border-b border-line bg-accent/10">
          <div className="mx-auto flex max-w-page items-center gap-3 px-4 py-2 text-sm">
            <span className="shrink-0 rounded-sm bg-accent px-2 py-0.5 text-[0.65rem] font-black uppercase tracking-widest text-accent-ink">Breaking</span>
            <Link href={`/article/${breaking[0].slug}`} className="truncate font-semibold hover:underline">{breaking[0].title}</Link>
            <span className="hidden shrink-0 text-xs text-muted sm:block">{timeAgo(breaking[0].publishedAt)}{breaking.length > 1 ? ` · +${breaking.length - 1} more` : ''}</span>
          </div>
        </div>
      )}
    </header>
  );
}
