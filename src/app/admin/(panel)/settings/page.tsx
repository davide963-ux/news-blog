import { db } from '@/lib/db';
import { requireUser } from '@/lib/auth';
import { getSettings } from '@/lib/settings';
import { env } from '@/lib/env';
import { Badge, Check, Field, Flash, PageHeader } from '@/components/admin/ui';
import { saveApiKeyAction, saveCategoryAction, saveSettingsAction, testAiAction, testAlertAction } from '../../actions';

export const metadata = { title: 'Settings' };

function Section({ id, title, desc, children }: { id: string; title: string; desc?: string; children: React.ReactNode }) {
  return (
    <section id={id} className="panel scroll-mt-6 p-5">
      <h2 className="font-serif text-xl font-black">{title}</h2>
      {desc && <p className="mb-4 mt-1 text-sm text-muted">{desc}</p>}
      {children}
    </section>
  );
}
const Save = ({ section }: { section: string }) => (<><input type="hidden" name="section" value={section} /><button className="btn btn-primary mt-4">Save {section}</button></>);

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ ok?: string; err?: string }> }) {
  await requireUser('ADMIN');
  const sp = await searchParams;
  const [s, categories] = await Promise.all([getSettings(true), db.category.findMany({ orderBy: { sortOrder: 'asc' } })]);
  const envKey = !!(env.aiApiKeyEnv.generic || env.aiApiKeyEnv.anthropic || env.aiApiKeyEnv.openai);
  const nav = ['automation', 'ai', 'quality', 'sensitive', 'categories', 'images', 'alerts', 'site'];
  return (
    <>
      <PageHeader title="Settings" subtitle="All behaviour of the automated newsroom is configured here. Changes apply on the next tick." />
      <Flash ok={sp.ok} err={sp.err} />
      <nav aria-label="Settings sections" className="scrollbar-none -mx-1 mb-6 flex gap-2 overflow-x-auto px-1 pb-1">{nav.map((n) => <a key={n} href={`#${n}`} className="btn !py-1 !text-xs capitalize">{n}</a>)}</nav>
      <div className="max-w-4xl space-y-6">
        <Section id="automation" title="Automation" desc="Monitoring and publication controls.">
          <form action={saveSettingsAction}>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-3 md:col-span-2">
                <Check name="monitoringEnabled" label="Monitoring enabled" defaultChecked={s.automation.monitoringEnabled} hint="Master switch. When off, no sources are checked (queued jobs still finish)." />
                <Check name="autoPublish" label="Automatic publishing" defaultChecked={s.automation.autoPublish} hint="When off, every generated article waits in the review queue." />
              </div>
              <Field label="Default check interval (min, ≥5)" hint="Each source can override it. The scheduler ticks every 5 minutes."><input name="defaultIntervalMinutes" type="number" min={5} defaultValue={s.automation.defaultIntervalMinutes} className="input" /></Field>
              <Field label="Daily publication limit (0 = unlimited)"><input name="dailyPublishLimit" type="number" min={0} defaultValue={s.automation.dailyPublishLimit} className="input" /></Field>
              <Field label="Hourly publication limit (0 = unlimited)"><input name="hourlyPublishLimit" type="number" min={0} defaultValue={s.automation.hourlyPublishLimit} className="input" /></Field>
              <Field label="Parallel jobs per tick"><input name="jobsPerTickConcurrency" type="number" min={1} max={8} defaultValue={s.automation.jobsPerTickConcurrency} className="input" /></Field>
              <Field label="“Breaking” label lasts (minutes)"><input name="breakingWindowMinutes" type="number" min={15} defaultValue={s.automation.breakingWindowMinutes} className="input" /></Field>
              <Field label="Max generation attempts per story" hint="Extra attempts regenerate when validation finds fixable problems."><input name="maxGenerationAttempts" type="number" min={1} max={5} defaultValue={s.automation.maxGenerationAttempts} className="input" /></Field>
            </div>
            <Save section="automation" />
          </form>
        </Section>

        <Section id="ai" title="AI model, prompts & writing style" desc="Provider, models, editorial instructions and cost estimation.">
          <div className="mb-5 flex flex-wrap items-center gap-3 rounded-md bg-wash p-3 text-sm">
            <span>API key: {s.ai.apiKeyEnc ? <Badge tone="green">stored (encrypted)</Badge> : envKey ? <Badge tone="green">from environment</Badge> : <Badge tone="red">missing</Badge>}</span>
            <form action={testAiAction}><button className="btn !py-1">Test connection</button></form>
          </div>
          <form action={saveApiKeyAction} className="mb-6 flex flex-wrap items-end gap-3">
            <div className="min-w-64 flex-1"><label className="label" htmlFor="apiKey">Store an API key (optional — env vars are preferred)</label><input id="apiKey" name="apiKey" type="password" autoComplete="off" placeholder="sk-…" className="input" /></div>
            <button className="btn">Save key</button>
            {s.ai.apiKeyEnc && <button name="clear" value="true" className="btn !text-red-600" formNoValidate>Remove stored key</button>}
          </form>
          <form action={saveSettingsAction}>
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Provider"><select name="provider" defaultValue={s.ai.provider} className="input"><option value="anthropic">Anthropic (Claude)</option><option value="openai">OpenAI</option><option value="openai-compatible">OpenAI-compatible endpoint</option></select></Field>
              <Field label="Base URL (optional)" hint="Required for OpenAI-compatible providers, e.g. https://openrouter.ai/api/v1"><input name="baseUrl" defaultValue={s.ai.baseUrl} className="input" /></Field>
              <Field label="Writing model"><input name="model" defaultValue={s.ai.model} className="input" /></Field>
              <Field label="Verifier model (fact-check pass; cheaper is fine)"><input name="verifierModel" defaultValue={s.ai.verifierModel} className="input" /></Field>
              <Field label="Temperature"><input name="temperature" type="number" step="0.05" min={0} max={1.5} defaultValue={s.ai.temperature} className="input" /></Field>
              <Field label="Max output tokens"><input name="maxOutputTokens" type="number" min={500} defaultValue={s.ai.maxOutputTokens} className="input" /></Field>
              <div className="md:col-span-2"><Field label="Writing style guide"><textarea name="styleGuide" rows={4} defaultValue={s.ai.styleGuide} className="input" /></Field></div>
              <div className="md:col-span-2"><Field label="Additional editorial instructions (appended to the system prompt)" hint="The non-negotiable rules (facts only, originality, attribution, injection resistance) are built in and cannot be removed here."><textarea name="extraInstructions" rows={4} defaultValue={s.ai.extraInstructions} className="input" /></Field></div>
              <div className="md:col-span-2"><Check name="verifyWithAi" label="Independent AI fact-check pass" defaultChecked={s.ai.verifyWithAi} hint="A second model call compares the article to the source and flags unsupported claims." /></div>
              <Field label="Writing price $/M input tokens"><input name="inputPricePerMTok" type="number" step="0.01" min={0} defaultValue={s.ai.inputPricePerMTok} className="input" /></Field>
              <Field label="Writing price $/M output tokens"><input name="outputPricePerMTok" type="number" step="0.01" min={0} defaultValue={s.ai.outputPricePerMTok} className="input" /></Field>
              <Field label="Verifier price $/M input"><input name="verifierInputPricePerMTok" type="number" step="0.01" min={0} defaultValue={s.ai.verifierInputPricePerMTok} className="input" /></Field>
              <Field label="Verifier price $/M output"><input name="verifierOutputPricePerMTok" type="number" step="0.01" min={0} defaultValue={s.ai.verifierOutputPricePerMTok} className="input" /></Field>
            </div>
            <fieldset className="mt-5 rounded-md border border-line p-4">
              <legend className="px-1 text-sm font-bold">Semantic duplicate detection (embeddings, optional)</legend>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="md:col-span-2"><Check name="embEnabled" label="Use embeddings in addition to lexical matching" defaultChecked={s.ai.embeddings.enabled} hint="Needs an OpenAI-compatible embeddings endpoint (OPENAI_API_KEY)." /></div>
                <Field label="Embedding model"><input name="embModel" defaultValue={s.ai.embeddings.model} className="input" /></Field>
                <Field label="Embeddings base URL (optional)"><input name="embBaseUrl" defaultValue={s.ai.embeddings.baseUrl} className="input" /></Field>
                <Field label="Similarity threshold (0.5–0.99)"><input name="embThreshold" type="number" step="0.01" min={0.5} max={0.99} defaultValue={s.ai.embeddings.similarityThreshold} className="input" /></Field>
              </div>
            </fieldset>
            <Save section="ai" />
          </form>
        </Section>

        <Section id="quality" title="Quality gates" desc="Articles that fail any gate are not auto-published.">
          <form action={saveSettingsAction}>
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Minimum source text (characters)" hint="Shorter items are skipped (can be forced from Pipeline)."><input name="minSourceChars" type="number" min={0} defaultValue={s.quality.minSourceChars} className="input" /></Field>
              <Field label="Minimum article words"><input name="minWords" type="number" min={50} defaultValue={s.quality.minWords} className="input" /></Field>
              <Field label="Target maximum words"><input name="maxWords" type="number" min={150} defaultValue={s.quality.maxWords} className="input" /></Field>
              <Field label="Max verbatim run (words)" hint="Longest allowed phrase shared with the source outside quotes (figures/dates ignored)."><input name="maxVerbatimRunWords" type="number" min={4} defaultValue={s.quality.maxVerbatimRunWords} className="input" /></Field>
              <Field label="Max shared 5-gram ratio (0–1)"><input name="maxOverlapRatio" type="number" step="0.01" min={0.01} max={0.9} defaultValue={s.quality.maxOverlapRatio} className="input" /></Field>
              <Field label="Duplicate-story threshold (0.3–0.99)" hint="Lower merges more aggressively. Default 0.42."><input name="duplicateThreshold" type="number" step="0.01" min={0.3} max={0.99} defaultValue={s.quality.duplicateThreshold} className="input" /></Field>
              <Field label="Duplicate window (hours)"><input name="duplicateWindowHours" type="number" min={6} defaultValue={s.quality.duplicateWindowHours} className="input" /></Field>
              <Field label="Unsupported-name tolerance (0–1)"><input name="unsupportedNameRatio" type="number" step="0.01" min={0} max={1} defaultValue={s.quality.unsupportedNameRatio} className="input" /></Field>
              <div className="md:col-span-2"><Check name="requireAiVerification" label="Require the AI fact-check to succeed before auto-publishing" defaultChecked={s.quality.requireAiVerification} /></div>
            </div>
            <Save section="quality" />
          </form>
        </Section>

        <Section id="sensitive" title="Sensitive-news policy" desc="Politics, elections, crime/allegations, health, conflict and disasters are detected automatically (keywords, sensitive categories and the model’s own flag).">
          <form action={saveSettingsAction}>
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Policy"><select name="policy" defaultValue={s.sensitive.policy} className="input"><option value="corroborate">Auto-publish only when corroborated by independent sources</option><option value="review">Always send to manual review</option></select></Field>
              <Field label="Independent sources required"><input name="minIndependentSources" type="number" min={2} max={6} defaultValue={s.sensitive.minIndependentSources} className="input" /></Field>
              <div className="md:col-span-2"><Field label="Extra sensitive keywords (comma separated)"><input name="extraKeywords" defaultValue={s.sensitive.extraKeywords} className="input" placeholder="strike, recall, lawsuit" /></Field></div>
            </div>
            <Save section="sensitive" />
          </form>
        </Section>

        <Section id="categories" title="Category approval" desc="Choose automatic or manual approval per category.">
          <div className="divide-y divide-line">
            {categories.map((c) => (
              <form key={c.id} action={saveCategoryAction} className="flex flex-wrap items-center gap-x-6 gap-y-2 py-3">
                <input type="hidden" name="id" value={c.id} />
                <span className="w-32 font-semibold">{c.name}</span>
                <Check name="autoPublish" label="Auto-publish" defaultChecked={c.autoPublish} />
                <Check name="sensitive" label="Sensitive" defaultChecked={c.sensitive} />
                <input name="description" defaultValue={c.description ?? ''} className="input !w-72 !py-1.5" aria-label={`${c.name} description`} placeholder="Section description (SEO)" />
                <button className="btn !py-1 !text-xs">Save</button>
              </form>
            ))}
          </div>
        </Section>

        <Section id="images" title="Images" desc="Source images are only used when the source is marked as licensed for reuse.">
          <form action={saveSettingsAction}>
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Stock photo provider" hint="Needs PEXELS_API_KEY or UNSPLASH_ACCESS_KEY."><select name="stockProvider" defaultValue={s.images.stockProvider} className="input"><option value="none">None</option><option value="pexels">Pexels</option><option value="unsplash">Unsplash</option></select></Field>
              <Field label="AI illustrations" hint="Used only when no licensed image exists, never for sensitive/breaking stories. Always labelled."><select name="aiIllustrations" defaultValue={s.images.aiIllustrations} className="input"><option value="off">Off</option><option value="fallback">Fallback only</option></select></Field>
              <Field label="Image model"><input name="aiImageModel" defaultValue={s.images.aiImageModel} className="input" /></Field>
              <Field label="Image API base URL (optional)"><input name="aiImageBaseUrl" defaultValue={s.images.aiImageBaseUrl} className="input" /></Field>
              <div className="md:col-span-2"><Check name="useLicensedSourceImages" label="Use source images when the source is marked as licensed" defaultChecked={s.images.useLicensedSourceImages} /></div>
            </div>
            <Save section="images" />
          </form>
        </Section>

        <Section id="alerts" title="Monitoring alerts" desc="Webhook (Slack, Discord or any JSON endpoint) for scheduler outages, failing sources and failed jobs.">
          <form action={saveSettingsAction}>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="md:col-span-2"><Field label="Webhook URL"><input name="webhookUrl" type="url" defaultValue={s.alerts.webhookUrl} className="input" /></Field></div>
              <Field label="Alert after N consecutive source failures"><input name="sourceFailureThreshold" type="number" min={1} defaultValue={s.alerts.sourceFailureThreshold} className="input" /></Field>
              <div className="pt-6"><Check name="notifyOnReviewQueue" label="Alert when ≥10 articles await review" defaultChecked={s.alerts.notifyOnReviewQueue} /></div>
            </div>
            <Save section="alerts" />
          </form>
          <form action={testAlertAction} className="mt-3"><button className="btn !text-xs">Send test alert</button></form>
        </Section>

        <Section id="site" title="Site identity" desc="Name, tagline and the AI-use disclosure shown on every article.">
          <form action={saveSettingsAction}>
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Site name"><input name="name" required defaultValue={s.site.name} className="input" /></Field>
              <Field label="Tagline"><input name="tagline" defaultValue={s.site.tagline} className="input" /></Field>
              <div className="md:col-span-2"><Field label="Description (SEO)"><textarea name="description" rows={2} defaultValue={s.site.description} className="input" /></Field></div>
              <Field label="Contact email"><input name="contactEmail" type="email" defaultValue={s.site.contactEmail} className="input" /></Field>
              <Field label="X/Twitter handle (e.g. @site)"><input name="twitterHandle" defaultValue={s.site.twitterHandle} className="input" /></Field>
              <div className="md:col-span-2"><Field label="AI-use disclosure"><textarea name="aiDisclosure" rows={3} defaultValue={s.site.aiDisclosure} className="input" /></Field></div>
            </div>
            <Save section="site" />
          </form>
        </Section>
      </div>
    </>
  );
}
