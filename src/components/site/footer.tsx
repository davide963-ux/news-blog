import Link from 'next/link';
import { getCategories, getSiteConfig } from '@/lib/queries';

export async function Footer() {
  const [site, categories] = await Promise.all([getSiteConfig(), getCategories()]);
  return (
    <footer className="mt-16 border-t-2 border-ink bg-wash">
      <div className="mx-auto grid max-w-page gap-10 px-4 py-12 md:grid-cols-12">
        <div className="md:col-span-5">
          <p className="font-serif text-2xl font-black">{site.name}</p>
          <p className="mt-2 max-w-md text-sm text-muted">{site.description}</p>
          <p className="mt-4 max-w-md text-xs leading-relaxed text-muted">{site.aiDisclosure}</p>
        </div>
        <nav aria-label="Footer sections" className="md:col-span-4">
          <p className="kicker mb-3">Sections</p>
          <ul className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
            {categories.map((c) => <li key={c.slug}><Link className="link-hover" href={`/category/${c.slug}`}>{c.name}</Link></li>)}
          </ul>
        </nav>
        <nav aria-label="About" className="md:col-span-3">
          <p className="kicker mb-3">About</p>
          <ul className="space-y-2 text-sm">
            <li><Link className="link-hover" href="/about">Editorial policy &amp; AI use</Link></li>
            <li><Link className="link-hover" href="/about#corrections">Corrections</Link></li>
            <li><Link className="link-hover" href="/rss.xml">RSS feed</Link></li>
            <li><Link className="link-hover" href="/sitemap.xml">Sitemap</Link></li>
            {site.contactEmail && <li><a className="link-hover" href={`mailto:${site.contactEmail}`}>Contact</a></li>}
          </ul>
        </nav>
      </div>
      <div className="border-t border-line py-4 text-center text-xs text-muted">© {new Date().getUTCFullYear()} {site.name}. Original source reporting remains the property of its publishers and is linked from each story.</div>
    </footer>
  );
}
