import { db } from '@/lib/db';
import { requireUser } from '@/lib/auth';
import type { ItemStatus } from '@prisma/client';
import Link from 'next/link';
import { Badge, Flash, PageHeader, Table, statusTone } from '@/components/admin/ui';
import { retryFailedJobsAction, retryItemAction } from '../../actions';
import { queueStats } from '@/server/queue';
import { timeAgo, truncate } from '@/lib/utils';

export const metadata = { title: 'Pipeline' };
const STATUSES: ItemStatus[] = ['DETECTED', 'EXTRACTED', 'GENERATED', 'DUPLICATE', 'SKIPPED', 'FAILED'];

export default async function PipelinePage({ searchParams }: { searchParams: Promise<{ status?: string; ok?: string; err?: string }> }) {
  await requireUser();
  const sp = await searchParams;
  const status = STATUSES.includes(sp.status as ItemStatus) ? (sp.status as ItemStatus) : undefined;
  const [items, counts, q, failedJobs] = await Promise.all([
    db.sourceItem.findMany({ where: status ? { status } : {}, orderBy: { createdAt: 'desc' }, take: 60, include: { source: { select: { name: true } }, articleSources: { take: 1, select: { articleId: true } } } }),
    db.sourceItem.groupBy({ by: ['status'], _count: true }),
    queueStats(),
    db.job.findMany({ where: { status: 'FAILED' }, orderBy: { updatedAt: 'desc' }, take: 10 }),
  ]);
  const cnt = Object.fromEntries(counts.map((c) => [c.status, c._count]));
  return (
    <>
      <PageHeader title="Pipeline" subtitle="Every detected story and what happened to it. Duplicates and skipped items are kept so URLs are never processed twice."
        actions={q.FAILED > 0 ? <form action={retryFailedJobsAction}><button className="btn">Retry {q.FAILED} failed job(s)</button></form> : undefined} />
      <Flash ok={sp.ok} err={sp.err} />
      <p className="mb-4 text-sm text-muted">Queue: {q.PENDING} pending · {q.RUNNING} running · {q.FAILED} failed · {q.DONE} done (last 3 days)</p>
      <div className="mb-5 flex flex-wrap gap-2">
        <Link href="/admin/pipeline" className={`btn !py-1.5 ${!status ? '!border-ink' : ''}`}>All</Link>
        {STATUSES.map((s) => <Link key={s} href={`/admin/pipeline?status=${s}`} className={`btn !py-1.5 ${status === s ? '!border-ink' : ''}`}>{s.toLowerCase()} <span className="text-muted">{cnt[s] ?? 0}</span></Link>)}
      </div>
      <Table head={['Detected', 'Source', 'Title', 'Status', 'Outcome', '']} empty={items.length ? undefined : 'No items.'}>
        {items.map((i) => (
          <tr key={i.id} className="align-top">
            <td className="whitespace-nowrap px-4 py-2.5 text-muted">{timeAgo(i.createdAt)}</td>
            <td className="px-4 py-2.5">{i.source.name}</td>
            <td className="max-w-sm px-4 py-2.5"><a href={i.url} target="_blank" rel="noopener noreferrer" className="font-semibold hover:underline">{truncate(i.title, 100)}</a></td>
            <td className="px-4 py-2.5"><Badge tone={statusTone(i.status)}>{i.status.toLowerCase()}</Badge></td>
            <td className="max-w-xs px-4 py-2.5 text-xs text-muted">{i.statusReason ?? (i.articleSources[0] ? <Link className="underline" href={`/admin/articles/${i.articleSources[0].articleId}`}>open article</Link> : '')}</td>
            <td className="px-4 py-2.5">
              {(i.status === 'FAILED' || i.status === 'SKIPPED' || i.status === 'DETECTED') && (
                <div className="flex justify-end gap-1.5">
                  <form action={retryItemAction}><input type="hidden" name="id" value={i.id} /><button className="btn !px-2.5 !py-1 !text-xs">Retry</button></form>
                  {i.status === 'SKIPPED' && <form action={retryItemAction}><input type="hidden" name="id" value={i.id} /><input type="hidden" name="force" value="true" /><button className="btn !px-2.5 !py-1 !text-xs" title="Process even though the source text is short — result will need careful review">Process anyway</button></form>}
                </div>
              )}
            </td>
          </tr>
        ))}
      </Table>
      {failedJobs.length > 0 && (
        <>
          <h2 className="mb-3 mt-10 font-serif text-xl font-black">Failed jobs</h2>
          <Table head={['When', 'Type', 'Attempts', 'Error']}>
            {failedJobs.map((j) => <tr key={j.id}><td className="px-4 py-2.5 text-muted">{timeAgo(j.updatedAt)}</td><td className="px-4 py-2.5">{j.type}</td><td className="px-4 py-2.5">{j.attempts}/{j.maxAttempts}</td><td className="px-4 py-2.5 text-xs">{truncate(j.lastError ?? '', 200)}</td></tr>)}
          </Table>
        </>
      )}
    </>
  );
}
