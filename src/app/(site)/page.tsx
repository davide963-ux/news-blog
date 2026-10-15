import type { Metadata } from 'next';
import Link from 'next/link';
import { getHome, getSiteConfig } from '@/lib/queries';
import { GridCard, LeadCard, ListCard, SectionHeader, StackCard, TrendingList } from '@/components/site/cards';
import { abs } from '@/lib/seo';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const site = await getSiteConfig();
  return { title: { absolute: `${site.name} — ${site.tagline}` }, description: site.description, alternates: { canonical: abs('/') }, openGraph: { title: site.name, description: site.description, url: abs('/') } };
}

export default async function HomePage() {
  const [home, site] = await Promise.all([getHome(), getSiteConfig()]);
  const jsonLd = { '@context': 'https://schema.org', '@type': 'WebSite', name: site.name, url: abs('/'), potentialAction: { '@type': 'SearchAction', target: abs('/search?q={query}'), 'query-input': 'required name=query' } };

  if (home.empty) {
    return (
      <main className="mx-auto max-w-page px-4 py-24 text-center">
        <p className="kicker">Newsroom starting up</p>
        <h1 className="headline mt-3 text-4xl">No stories have been published yet</h1>
        <p className="mx-auto mt-4 max-w-xl text-muted">The monitoring system checks the configured news sources every few minutes. As soon as it detects and verifies new reports, they will appear here automatically.</p>
      </main>
    );
  }
  return (
    <main className="mx-auto max-w-page px-4 pb-4 pt-8">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <h1 className="sr-only">{site.name} — latest news</h1>
      <div className="grid gap-8 lg:grid-cols-12 lg:gap-10">
        <div className="lg:col-span-8">{home.lead && <LeadCard c={home.lead} />}</div>
        <aside aria-label="Top stories" className="lg:col-span-4 lg:border-l lg:border-line lg:pl-8">
          <p className="kicker mb-4 border-b border-line pb-2">Top stories</p>
          <div className="divide-y divide-line">{home.secondary.map((c) => <StackCard key={c.id} c={c} />)}</div>
        </aside>
      </div>

      <div className="mt-14 grid gap-10 lg:grid-cols-12">
        {home.latest.length > 0 && (
          <section aria-labelledby="latest-h" className="lg:col-span-8">
            <div className="mb-5 border-b-2 border-ink pb-2"><h2 id="latest-h" className="font-serif text-2xl font-black">Latest news</h2></div>
            <div className="divide-y divide-line">{home.latest.map((c) => <ListCard key={c.id} c={c} />)}</div>
          </section>
        )}
        <aside className={`space-y-8 ${home.latest.length > 0 ? 'lg:col-span-4' : 'lg:col-span-12'}`}><div className="lg:sticky lg:top-20"><TrendingList items={home.trending} /></div></aside>
      </div>

      {home.sections.map(({ category, items }) => (
        <section key={category.slug} className="mt-14" aria-label={category.name}>
          <SectionHeader title={category.name} href={`/category/${category.slug}`} />
          <div className="grid gap-x-6 gap-y-8 sm:grid-cols-2 lg:grid-cols-4">{items.map((c) => <GridCard key={c.id} c={c} />)}</div>
        </section>
      ))}
      <p className="mt-14 text-center text-xs text-muted"><Link className="link-hover" href="/about">How we work, and how AI is used in our reporting →</Link></p>
    </main>
  );
}
