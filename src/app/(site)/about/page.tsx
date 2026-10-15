import type { Metadata } from 'next';
import { getSiteConfig } from '@/lib/queries';
import { abs } from '@/lib/seo';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'About, editorial policy & AI use', alternates: { canonical: abs('/about') } };

export default async function AboutPage() {
  const site = await getSiteConfig();
  return (
    <main className="mx-auto max-w-page px-4 py-10">
      <div className="prose prose-lg mx-auto max-w-read dark:prose-invert">
        <p className="kicker not-prose">About</p>
        <h1 className="headline !mt-2 text-4xl not-prose">{site.name}: editorial policy &amp; use of AI</h1>
        <p>{site.description}</p>
        <h2>How stories are produced</h2>
        <p>We monitor a limited set of publishers whose content we are permitted to process. When a publisher reports something new, our system extracts the reportable facts and uses an AI model to write an original news article. We do not copy a publisher&apos;s text: we report the underlying facts, in our own structure and words, and we <strong>always link to and name the original source</strong>.</p>
        <h2>Safeguards</h2>
        <ul>
          <li>Names, dates, figures and quotations in each draft are automatically checked against the source material; unsupported details block automatic publication.</li>
          <li>Text is compared with the source to prevent copying.</li>
          <li>Stories about politics, elections, crime and allegations, health, conflict and major breaking events are held for stronger verification — typically confirmation by at least two independent sources — or manual editorial review.</li>
          <li>Allegations, claims and speculation are attributed and are never stated as established fact.</li>
        </ul>
        <h2>Images</h2>
        <p>We only use images that are licensed for reuse. Where no suitable image exists we show neutral section artwork. Any AI-generated illustration is clearly labelled and is never presented as a photograph of a real event.</p>
        <h2 id="corrections">Corrections</h2>
        <p>If you spot an error, tell us{site.contactEmail ? <> at <a href={`mailto:${site.contactEmail}`}>{site.contactEmail}</a></> : null}. Corrections are published on the article itself with a timestamp.</p>
        <p className="text-sm text-muted">{site.aiDisclosure}</p>
      </div>
    </main>
  );
}
