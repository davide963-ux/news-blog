import { notFound } from 'next/navigation';
import Link from 'next/link';
import { db } from '@/lib/db';
import { requireUser } from '@/lib/auth';
import { ConfirmButton } from '@/components/admin/confirm-button';
import { Badge, Check, Field, Flash, PageHeader, statusTone } from '@/components/admin/ui';
import { addCorrectionAction, deleteArticleAction, publishArticleAction, rejectArticleAction, saveArticleAction, unpublishArticleAction } from '../../../actions';
import { formatDateTime } from '@/lib/utils';
import type { ValidationReport } from '@/server/validate';

export const metadata = { title: 'Edit article' };
type Validation = { report?: ValidationReport; sensitivity?: { level: number; topics: string[] }; verifier?: { verdict: string } | null; attempts?: number };

const CHECK_TONE = { pass: 'green', warn: 'amber', review: 'amber', fail: 'red' } as const;

export default async function ArticleEditor({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ ok?: string; err?: string }> }) {
  const user = await requireUser();
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const a = await db.article.findUnique({ where: { id }, include: { category: true, sources: true, corrections: { orderBy: { createdAt: 'desc' } }, revisions: { orderBy: { createdAt: 'desc' }, take: 10, include: { editor: { select: { email: true } } } }, runs: { orderBy: { createdAt: 'asc' } } } });
  if (!a) notFound();
  const categories = await db.category.findMany({ orderBy: { sortOrder: 'asc' } });
  const v = (a.validation ?? {}) as Validation;
  const tokens = a.runs.reduce((n, r) => n + r.promptTokens + r.completionTokens, 0);
  const cost = a.runs.reduce((n, r) => n + r.costUsd, 0);

  return (
    <>
      <PageHeader title="Edit article" subtitle={a.slug}
        actions={<>
          {a.status === 'PUBLISHED' && <Link href={`/article/${a.slug}`} target="_blank" className="btn">View live ↗</Link>}
          {a.status !== 'PUBLISHED' && a.status !== 'REJECTED' && <form action={publishArticleAction}><input type="hidden" name="id" value={a.id} /><button className="btn btn-primary">Publish now</button></form>}
          {a.status === 'REJECTED' && <form action={publishArticleAction}><input type="hidden" name="id" value={a.id} /><button className="btn">Publish anyway</button></form>}
          {a.status === 'PUBLISHED' && <form action={unpublishArticleAction}><input type="hidden" name="id" value={a.id} /><button className="btn">Unpublish</button></form>}
          {(a.status === 'PENDING_REVIEW' || a.status === 'DRAFT') && <form action={rejectArticleAction}><input type="hidden" name="id" value={a.id} /><button className="btn">Reject</button></form>}
          {user.role === 'ADMIN' && <form action={deleteArticleAction}><input type="hidden" name="id" value={a.id} /><ConfirmButton message="Permanently delete this article?" className="btn !text-red-600">Delete</ConfirmButton></form>}
        </>} />
      <Flash ok={sp.ok} err={sp.err} />
      <div className="mb-6 flex flex-wrap items-center gap-2 text-sm">
        <Badge tone={statusTone(a.status)}>{a.status.replace('_', ' ').toLowerCase()}</Badge>
        {a.riskLevel === 2 && <Badge tone="amber">sensitive: {(v.sensitivity?.topics ?? []).join(', ') || a.category.name}</Badge>}
        {a.publishedAt && <span className="text-muted">Published {formatDateTime(a.publishedAt)}</span>}
        <span className="text-muted">· {a.aiProvider}/{a.aiModel} · {tokens.toLocaleString()} tokens · ≈${cost.toFixed(4)}</span>
      </div>
      {a.reviewReason && a.status !== 'PUBLISHED' && <p className="mb-6 rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm"><strong>Held because ({a.reviewCode}):</strong> {a.reviewReason}</p>}

      <div className="grid gap-8 xl:grid-cols-[1fr_22rem]">
        <form action={saveArticleAction} className="space-y-5">
          <input type="hidden" name="id" value={a.id} />
          <Field label="Headline"><input name="title" required defaultValue={a.title} className="input !text-lg !font-bold" /></Field>
          <Field label="Standfirst (dek)"><input name="dek" defaultValue={a.dek ?? ''} className="input" /></Field>
          <Field label="Body (Markdown: paragraphs, ## subheadings, lists, **bold**, quotes)"><textarea name="bodyMd" rows={18} required defaultValue={a.bodyMd} className="input font-serif !text-base leading-relaxed" /></Field>
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Homepage summary"><textarea name="summary" rows={2} defaultValue={a.summary} className="input" /></Field>
            <Field label="Excerpt (lists, social)"><textarea name="excerpt" rows={2} defaultValue={a.excerpt} className="input" /></Field>
            <Field label="SEO title (≤60)"><input name="seoTitle" defaultValue={a.seoTitle} maxLength={70} className="input" /></Field>
            <Field label="Meta description (≤160)"><input name="metaDescription" defaultValue={a.metaDescription} maxLength={170} className="input" /></Field>
            <Field label="URL slug" hint="Changing the slug changes the public URL of a published story."><input name="slug" defaultValue={a.slug} className="input font-mono text-xs" /></Field>
            <Field label="Tags (comma separated)"><input name="tags" defaultValue={a.tags.join(', ')} className="input" /></Field>
            <Field label="Category"><select name="category" defaultValue={a.category.slug} className="input">{categories.map((c) => <option key={c.id} value={c.slug}>{c.name}</option>)}</select></Field>
            <div className="space-y-2 pt-6"><Check name="isBreaking" label="Mark as breaking news" defaultChecked={a.isBreaking} /><Check name="isFeatured" label="Featured" defaultChecked={a.isFeatured} /></div>
          </div>
          <fieldset className="panel space-y-4 p-4">
            <legend className="px-1 text-sm font-bold">Featured image — {a.imageKind.toLowerCase().replace('_', ' ')}</legend>
            {a.imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={a.imageSmallUrl ?? a.imageUrl} alt="" className="aspect-video w-64 rounded object-cover" />
            ) : <p className="text-sm text-muted">No image — the site shows neutral section artwork.</p>}
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Alt text"><input name="imageAlt" defaultValue={a.imageAlt ?? ''} className="input" /></Field>
              <Field label="Credit / licence line"><input name="imageCredit" defaultValue={a.imageCredit ?? ''} className="input" /></Field>
              <Field label="Credit link (optional)"><input name="imageCreditUrl" defaultValue={a.imageCreditUrl ?? ''} className="input" /></Field>
              <Field label="Replace image (JPG/PNG/WebP ≤ 4 MB)" hint="Only upload images you have the rights to use."><input name="image" type="file" accept="image/*" className="input !p-1.5" /></Field>
            </div>
            <div className="flex flex-wrap gap-6"><Check name="imageIsAi" label="This upload is an AI-generated illustration (will be labelled)" /><Check name="removeImage" label="Remove current image" /></div>
          </fieldset>
          <button className="btn btn-primary">Save changes</button>
        </form>

        <aside className="space-y-6">
          <section className="panel p-4">
            <h2 className="text-sm font-bold uppercase tracking-wide text-muted">Original sources</h2>
            <ul className="mt-3 space-y-3 text-sm">{a.sources.map((s) => <li key={s.id}><a href={s.url} target="_blank" rel="noopener noreferrer" className="font-semibold text-accent underline">{s.sourceName}</a><p className="text-xs text-muted">{s.title}</p><p className="text-xs text-muted">Source published: {formatDateTime(s.publishedAt)}</p></li>)}</ul>
          </section>
          <section className="panel p-4">
            <h2 className="text-sm font-bold uppercase tracking-wide text-muted">Automated validation</h2>
            {v.report ? (
              <ul className="mt-3 space-y-2 text-xs">
                {v.report.checks.map((c) => <li key={c.name} className="flex gap-2"><Badge tone={CHECK_TONE[c.status]}>{c.status}</Badge><span><strong>{c.name.replace('_', ' ')}</strong>: {c.detail}</span></li>)}
                <li className="pt-1 text-muted">Generation attempts: {v.attempts ?? 1} · overlap {(v.report.metrics.overlapRatio * 100).toFixed(1)}% · longest copied run {v.report.metrics.longestRun} words</li>
              </ul>
            ) : <p className="mt-2 text-sm text-muted">Manually created or no report stored.</p>}
          </section>
          <section className="panel p-4">
            <h2 className="text-sm font-bold uppercase tracking-wide text-muted">Publish a correction</h2>
            <form action={addCorrectionAction} className="mt-3 space-y-2"><input type="hidden" name="id" value={a.id} /><textarea name="text" rows={3} required className="input" placeholder="What was wrong and what is correct?" /><button className="btn w-full">Publish correction note</button></form>
            {a.corrections.length > 0 && <ul className="mt-3 space-y-1 text-xs text-muted">{a.corrections.map((c) => <li key={c.id}>{formatDateTime(c.createdAt)}: {c.text}</li>)}</ul>}
          </section>
          <section className="panel p-4">
            <h2 className="text-sm font-bold uppercase tracking-wide text-muted">Revision history</h2>
            <ul className="mt-3 space-y-1 text-xs text-muted">{a.revisions.length ? a.revisions.map((r) => <li key={r.id}>{formatDateTime(r.createdAt)} · {r.editor?.email ?? 'system'} · {r.reason}</li>) : <li>No manual edits.</li>}</ul>
          </section>
        </aside>
      </div>
    </>
  );
}
