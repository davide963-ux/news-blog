import type { Source } from '@prisma/client';
import { Check, Field } from './ui';

const CONFIG_HINT = `RSS: leave empty.
HTML_LIST: {"itemSelector":"article.card","linkSelector":"a","titleSelector":"h2","dateSelector":"time","dateAttr":"datetime","summarySelector":"p"}
JSON_API: {"itemsPath":"response.results","urlPath":"webUrl","titlePath":"webTitle","datePath":"webPublicationDate","contentPath":"fields.bodyText","idPath":"id"}`;

export function SourceForm({ source, categories, action, submitLabel }: { source?: Source; categories: { slug: string; name: string }[]; action: (f: FormData) => void; submitLabel: string }) {
  const s = source;
  return (
    <form action={action} className="space-y-6">
      {s && <input type="hidden" name="id" value={s.id} />}
      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Name"><input name="name" required defaultValue={s?.name} className="input" placeholder="Example Wire" /></Field>
        <Field label="Website URL"><input name="siteUrl" type="url" required defaultValue={s?.siteUrl} className="input" placeholder="https://example.com" /></Field>
        <Field label="Source type" hint="Prefer RSS/Atom or an official API. Use HTML_LIST only where the site permits automated access.">
          <select name="type" defaultValue={s?.type ?? 'RSS'} className="input"><option value="RSS">RSS / Atom feed</option><option value="JSON_API">JSON API</option><option value="HTML_LIST">HTML listing page</option></select>
        </Field>
        <Field label="Feed / API / listing URL"><input name="feedUrl" type="url" required defaultValue={s?.feedUrl} className="input" placeholder="https://example.com/rss.xml" /></Field>
        <Field label="Default category" hint="Used when the AI cannot decide."><select name="defaultCategory" defaultValue={s?.defaultCategory ?? ''} className="input"><option value="">— none —</option>{categories.map((c) => <option key={c.slug} value={c.slug}>{c.name}</option>)}</select></Field>
        <Field label="Trust level" hint="Informational weighting for reviewers."><select name="trustLevel" defaultValue={s?.trustLevel ?? 2} className="input"><option value="1">1 – low</option><option value="2">2 – medium</option><option value="3">3 – high</option></select></Field>
        <Field label="Content retrieval" hint="FEED_ONLY uses just what the feed provides. FULL_PAGE also fetches the article page (robots.txt permitting) when the feed text is short."><select name="fetchMode" defaultValue={s?.fetchMode ?? 'FEED_ONLY'} className="input"><option value="FEED_ONLY">Feed only (safest)</option><option value="FULL_PAGE">Feed + article page</option></select></Field>
        <Field label="Check every (minutes, min 5)"><input name="checkIntervalMinutes" type="number" min={5} max={1440} defaultValue={s?.checkIntervalMinutes ?? 5} className="input" /></Field>
        <Field label="Max new items per check"><input name="maxItemsPerRun" type="number" min={1} max={50} defaultValue={s?.maxItemsPerRun ?? 10} className="input" /></Field>
        <Field label="Ignore items older than (hours)"><input name="maxAgeHours" type="number" min={1} max={720} defaultValue={s?.maxAgeHours ?? 48} className="input" /></Field>
      </div>
      <details className="panel p-4" open={!!s?.config || !!s?.headersEnc}>
        <summary className="cursor-pointer text-sm font-bold">Advanced: parsing config &amp; request headers</summary>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <Field label="Config (JSON)" hint={CONFIG_HINT}><textarea name="config" rows={6} defaultValue={s?.config ? JSON.stringify(s.config, null, 2) : ''} className="input font-mono text-xs" /></Field>
          <div className="space-y-3">
            <Field label="Request headers (one per line, e.g. api-key: …)" hint={s?.headersEnc ? 'Stored encrypted. Leave blank to keep the current value.' : 'Stored encrypted (AES-256-GCM).'}><textarea name="headers" rows={4} className="input font-mono text-xs" autoComplete="off" placeholder="api-key: xxxxxxxx" /></Field>
            {s?.headersEnc && <Check name="clearHeaders" label="Remove stored headers" />}
          </div>
        </div>
      </details>
      <fieldset className="panel space-y-3 p-4">
        <legend className="px-1 text-sm font-bold">Compliance</legend>
        <Check name="respectRobots" label="Respect robots.txt" defaultChecked={s?.respectRobots ?? true} hint="Strongly recommended. Disabling should only be done for APIs/feeds you are licensed to use." />
        <Check name="termsAcknowledged" label="I have confirmed this source’s terms / licence permit automated monitoring and AI-assisted reporting" defaultChecked={s?.termsAcknowledged ?? false} hint="Required: monitoring is paused for a source until this is ticked. Rewording alone does not remove copyright or terms-of-service obligations." />
        <Check name="allowImageReuse" label="This source’s images are licensed for reuse on this site" defaultChecked={s?.allowImageReuse ?? false} hint="Off by default: source images are never copied unless you declare a licence." />
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Image licence / credit line"><input name="imageLicenseNote" defaultValue={s?.imageLicenseNote ?? ''} className="input" placeholder="CC BY 4.0" /></Field>
          <Field label="Licence / terms note (internal)"><input name="licenseNote" defaultValue={s?.licenseNote ?? ''} className="input" placeholder="API terms accepted 2026-01-02" /></Field>
        </div>
      </fieldset>
      <Check name="enabled" label="Enabled" defaultChecked={s?.enabled ?? true} />
      <button className="btn btn-primary">{submitLabel}</button>
    </form>
  );
}
