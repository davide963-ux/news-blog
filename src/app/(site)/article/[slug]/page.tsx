import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { getArticlePage, getSiteConfig, getTrending } from '@/lib/queries';
import { FallbackArt } from '@/components/site/article-image';
import { GridCard, TrendingList } from '@/components/site/cards';
import { ViewBeacon } from '@/components/site/view-beacon';
import { abs, absImage, articleJsonLd, breadcrumbJsonLd } from '@/lib/seo';
import { formatDateTime, hostOf } from '@/lib/utils';

export const dynamic = 'force-dynamic';
type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const data = await getArticlePage(slug);
  if (!data) return { title: 'Story not found', robots: { index: false } };
  const a = data.article;
  const url = abs(`/article/${a.slug}`);
  const image = absImage(a.imageUrl) ?? abs(`/article/${a.slug}/opengraph-image`);
  return {
    title: a.seoTitle, description: a.metaDescription, keywords: a.tags,
    alternates: { canonical: url },
    openGraph: { type: 'article', url, title: a.title, description: a.metaDescription, publishedTime: a.publishedAt, modifiedTime: a.updatedAt, section: a.category.name, tags: a.tags, images: [{ url: image, alt: a.imageAlt ?? a.title }] },
    twitter: { card: 'summary_large_image', title: a.title, description: a.metaDescription, images: [image] },
  };
}

export default async function ArticlePage({ params }: Props) {
  const { slug } = await params;
  const [data, site, trending] = await Promise.all([getArticlePage(slug), getSiteConfig(), getTrending(5)]);
  if (!data) notFound();
  const { article: a, related } = data;
  const updated = a.updatedAt !== a.publishedAt && new Date(a.updatedAt).getTime() - new Date(a.publishedAt).getTime() > 60_000;
  const crumbs = [{ name: 'Home', path: '/' }, { name: a.category.name, path: `/category/${a.category.slug}` }, { name: a.title, path: `/article/${a.slug}` }];

  return (
    <main className="mx-auto max-w-page px-4 py-8">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify([articleJsonLd(a, site), breadcrumbJsonLd(crumbs)]) }} />
      <ViewBeacon slug={a.slug} />
      <div className="grid gap-12 lg:grid-cols-12">
        <article className="lg:col-span-8" itemScope itemType="https://schema.org/NewsArticle">
          <nav aria-label="Breadcrumb" className="text-xs text-muted">
            <ol className="flex flex-wrap gap-2"><li><Link href="/" className="hover:underline">Home</Link></li><li aria-hidden>/</li><li><Link href={`/category/${a.category.slug}`} className="hover:underline">{a.category.name}</Link></li></ol>
          </nav>
          <header className="mt-4">
            <div className="flex items-center gap-2">
              {a.isBreaking && <span className="rounded-sm bg-accent px-1.5 py-0.5 text-[0.65rem] font-black uppercase tracking-widest text-accent-ink">Breaking</span>}
              <Link href={`/category/${a.category.slug}`} className="kicker hover:underline">{a.category.name}</Link>
            </div>
            <h1 className="headline mt-3 text-[2rem] sm:text-5xl" itemProp="headline">{a.title}</h1>
            {a.dek && <p className="mt-4 font-serif text-xl leading-snug text-ink/75 sm:text-2xl">{a.dek}</p>}
            <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-1 border-y border-line py-3 text-sm text-muted">
              <span><span className="font-semibold text-ink">{site.name} Newsroom</span> · AI-assisted</span>
              <span><time dateTime={a.publishedAt} itemProp="datePublished">{formatDateTime(a.publishedAt)}</time></span>
              {updated && <span>Updated <time dateTime={a.updatedAt} itemProp="dateModified">{formatDateTime(a.updatedAt)}</time></span>}
            </div>
          </header>

          <figure className="mt-6">
            <div className="aspect-[16/9] overflow-hidden bg-wash">
              {a.imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={a.imageUrl} alt={a.imageAlt ?? ''} className="h-full w-full object-cover" width={1600} height={900} fetchPriority="high" decoding="async" itemProp="image" />
              ) : <FallbackArt category={a.category.slug} />}
            </div>
            {(a.imageCredit || a.imageIsAi || !a.imageUrl) && (
              <figcaption className="mt-2 text-xs text-muted">
                {a.imageIsAi && <strong className="mr-1 text-ink">AI-generated illustration.</strong>}
                {!a.imageUrl && 'Section artwork — no licensed image is available for this story. '}
                {a.imageCredit && (a.imageCreditUrl ? <a href={a.imageCreditUrl} rel="noopener noreferrer nofollow" target="_blank" className="underline">{a.imageCredit}</a> : a.imageCredit)}
              </figcaption>
            )}
          </figure>

          <div className="prose prose-lg mx-auto mt-8 max-w-read dark:prose-invert prose-p:text-ink" itemProp="articleBody" dangerouslySetInnerHTML={{ __html: a.bodyHtml }} />

          <div className="mx-auto mt-10 max-w-read space-y-6">
            {a.corrections.length > 0 && (
              <section aria-labelledby="corr-h" className="rounded-md border-l-4 border-accent bg-wash p-4">
                <h2 id="corr-h" className="kicker">Corrections &amp; updates</h2>
                <ul className="mt-2 space-y-2 text-sm">{a.corrections.map((c, i) => <li key={i}><time className="font-semibold" dateTime={c.at}>{formatDateTime(c.at)}:</time> {c.text}</li>)}</ul>
              </section>
            )}
            <section aria-labelledby="src-h" className="panel p-4">
              <h2 id="src-h" className="kicker">Sources</h2>
              <p className="mt-1 text-sm text-muted">This report is based on the following original reporting. Links open the publishers&apos; own pages.</p>
              <ul className="mt-3 space-y-2 text-sm">
                {a.sources.map((s) => (
                  <li key={s.url}>
                    <a href={s.url} target="_blank" rel="noopener noreferrer" className="font-semibold text-accent underline underline-offset-2">{s.name}: {s.title}</a>
                    <span className="text-muted"> ({hostOf(s.url)}{s.publishedAt ? `, published ${formatDateTime(s.publishedAt)}` : ''})</span>
                  </li>
                ))}
              </ul>
            </section>
            <p className="text-xs leading-relaxed text-muted">{site.aiDisclosure} <Link href="/about" className="underline">Editorial policy</Link>.</p>
            {a.tags.length > 0 && (
              <ul className="flex flex-wrap gap-2" aria-label="Topics">{a.tags.map((t) => <li key={t}><Link href={`/search?q=${encodeURIComponent(t)}`} className="rounded-full border border-line px-3 py-1 text-xs font-semibold text-muted hover:border-accent hover:text-accent">{t}</Link></li>)}</ul>
            )}
          </div>
        </article>

        <aside className="lg:col-span-4"><div className="space-y-8 lg:sticky lg:top-20"><TrendingList items={trending.filter((t) => t.slug !== a.slug)} /></div></aside>
      </div>

      {related.length > 0 && (
        <section className="mt-14 border-t-2 border-ink pt-6" aria-labelledby="rel-h">
          <h2 id="rel-h" className="mb-6 font-serif text-2xl font-black">Related stories</h2>
          <div className="grid gap-x-6 gap-y-8 sm:grid-cols-2 lg:grid-cols-4">{related.map((c) => <GridCard key={c.id} c={c} />)}</div>
        </section>
      )}
    </main>
  );
}
