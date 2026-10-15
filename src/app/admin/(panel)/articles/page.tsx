import Link from 'next/link';
import type { ArticleStatus, Prisma } from '@prisma/client';
import { db } from '@/lib/db';
import { requireUser } from '@/lib/auth';
import { ConfirmButton } from '@/components/admin/confirm-button';
import { Badge, Flash, PageHeader, Table, statusTone } from '@/components/admin/ui';
import { deleteArticleAction, publishArticleAction, rejectArticleAction, unpublishArticleAction } from '../../actions';
import { formatDateTime, truncate } from '@/lib/utils';

export const metadata = { title: 'Articles' };
const STATUSES: ArticleStatus[] = ['PENDING_REVIEW', 'DRAFT', 'PUBLISHED', 'UNPUBLISHED', 'REJECTED'];
const PER = 25;

export default async function ArticlesPage({ searchParams }: { searchParams: Promise<{ status?: string; q?: string; page?: string; ok?: string; err?: string }> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const status = STATUSES.includes(sp.status as ArticleStatus) ? (sp.status as ArticleStatus) : undefined;
  const page = Math.max(1, parseInt(sp.page ?? '1', 10) || 1);
  const where: Prisma.ArticleWhereInput = { ...(status ? { status } : {}), ...(sp.q ? { OR: [{ title: { contains: sp.q, mode: 'insensitive' } }, { slug: { contains: sp.q, mode: 'insensitive' } }] } : {}) };
  const [rows, total, counts] = await Promise.all([
    db.article.findMany({ where, orderBy: [{ generatedAt: 'desc' }], skip: (page - 1) * PER, take: PER, include: { category: { select: { name: true } }, sources: { take: 1, select: { sourceName: true, url: true } } } }),
    db.article.count({ where }),
    db.article.groupBy({ by: ['status'], _count: true }),
  ]);
  const cnt = Object.fromEntries(counts.map((c) => [c.status, c._count]));
  const back = `/admin/articles${status ? `?status=${status}` : ''}`;
  return (
    <>
      <PageHeader title="Articles" subtitle="Published stories, drafts waiting for approval, and rejected output." />
      <Flash ok={sp.ok} err={sp.err} />
      <div className="mb-5 flex flex-wrap items-center gap-2">
        <Link href="/admin/articles" className={`btn !py-1.5 ${!status ? '!border-ink' : ''}`}>All</Link>
        {STATUSES.map((s) => <Link key={s} href={`/admin/articles?status=${s}`} className={`btn !py-1.5 ${status === s ? '!border-ink' : ''}`}>{s.replace('_', ' ').toLowerCase()} <span className="text-muted">{cnt[s] ?? 0}</span></Link>)}
        <form className="ml-auto flex gap-2"><input type="hidden" name="status" value={status ?? ''} /><input name="q" defaultValue={sp.q} placeholder="Search title / slug" className="input !w-56 !py-1.5" /><button className="btn !py-1.5">Search</button></form>
      </div>
      <Table head={['Title', 'Status', 'Category', 'Why / source', 'Generated', '']} empty={rows.length ? undefined : 'No articles match.'}>
        {rows.map((a) => (
          <tr key={a.id} className="align-top">
            <td className="max-w-md px-4 py-3"><Link href={`/admin/articles/${a.id}`} className="font-semibold hover:underline">{truncate(a.title, 110)}</Link>{a.riskLevel === 2 && <Badge tone="amber">sensitive</Badge>}</td>
            <td className="px-4 py-3"><Badge tone={statusTone(a.status)}>{a.status.replace('_', ' ').toLowerCase()}</Badge></td>
            <td className="px-4 py-3">{a.category.name}</td>
            <td className="max-w-xs px-4 py-3 text-xs text-muted">{a.reviewReason ? <span title={a.reviewReason}>{truncate(a.reviewReason, 120)}</span> : a.sources[0] ? <a className="underline" href={a.sources[0].url} target="_blank" rel="noopener noreferrer">{a.sources[0].sourceName}</a> : '—'}</td>
            <td className="whitespace-nowrap px-4 py-3 text-xs text-muted">{formatDateTime(a.generatedAt)}</td>
            <td className="px-4 py-3">
              <div className="flex justify-end gap-1.5">
                {a.status !== 'PUBLISHED' && a.status !== 'REJECTED' && <form action={publishArticleAction}><input type="hidden" name="id" value={a.id} /><input type="hidden" name="back" value={back} /><button className="btn btn-primary !px-2.5 !py-1 !text-xs">Publish</button></form>}
                {a.status === 'PUBLISHED' && <form action={unpublishArticleAction}><input type="hidden" name="id" value={a.id} /><input type="hidden" name="back" value={back} /><button className="btn !px-2.5 !py-1 !text-xs">Unpublish</button></form>}
                {(a.status === 'PENDING_REVIEW' || a.status === 'DRAFT') && <form action={rejectArticleAction}><input type="hidden" name="id" value={a.id} /><input type="hidden" name="back" value={back} /><button className="btn !px-2.5 !py-1 !text-xs">Reject</button></form>}
                {user.role === 'ADMIN' && <form action={deleteArticleAction}><input type="hidden" name="id" value={a.id} /><ConfirmButton message="Permanently delete this article?" className="btn !px-2.5 !py-1 !text-xs !text-red-600" aria-label="Delete article">Delete</ConfirmButton></form>}
              </div>
            </td>
          </tr>
        ))}
      </Table>
      {total > PER && (
        <div className="mt-4 flex items-center justify-between text-sm">
          {page > 1 ? <Link className="btn" href={`/admin/articles?${new URLSearchParams({ ...(status ? { status } : {}), ...(sp.q ? { q: sp.q } : {}), page: String(page - 1) })}`}>← Newer</Link> : <span />}
          <span className="text-muted">Page {page} of {Math.ceil(total / PER)}</span>
          {page * PER < total ? <Link className="btn" href={`/admin/articles?${new URLSearchParams({ ...(status ? { status } : {}), ...(sp.q ? { q: sp.q } : {}), page: String(page + 1) })}`}>Older →</Link> : <span />}
        </div>
      )}
    </>
  );
}
