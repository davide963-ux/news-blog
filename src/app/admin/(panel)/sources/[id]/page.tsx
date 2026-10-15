import { notFound } from 'next/navigation';
import Link from 'next/link';
import { db } from '@/lib/db';
import { requireUser } from '@/lib/auth';
import { Badge, Flash, PageHeader, Table, statusTone } from '@/components/admin/ui';
import { SourceForm } from '@/components/admin/source-form';
import { checkSourceNowAction, testSourceAction, updateSourceAction } from '../../../actions';
import { formatDateTime, timeAgo, truncate } from '@/lib/utils';

export const maxDuration = 120; // hosts long-running actions (manual tick / source check)
export const metadata = { title: 'Source' };

export default async function SourcePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ ok?: string; err?: string }> }) {
  await requireUser('ADMIN');
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const source = await db.source.findUnique({ where: { id } });
  if (!source) notFound();
  const [categories, items, byStatus] = await Promise.all([
    db.category.findMany({ orderBy: { sortOrder: 'asc' }, select: { slug: true, name: true } }),
    db.sourceItem.findMany({ where: { sourceId: id }, orderBy: { createdAt: 'desc' }, take: 25, include: { articleSources: { select: { article: { select: { id: true, status: true } } }, take: 1 } } }),
    db.sourceItem.groupBy({ by: ['status'], where: { sourceId: id }, _count: true }),
  ]);
  return (
    <>
      <PageHeader title={source.name} subtitle={source.feedUrl}
        actions={<>
          <form action={testSourceAction}><input type="hidden" name="id" value={id} /><button className="btn">Test fetch</button></form>
          <form action={checkSourceNowAction}><input type="hidden" name="id" value={id} /><button className="btn btn-primary">Check &amp; process now</button></form>
        </>} />
      <Flash ok={sp.ok} err={sp.err} />
      <div className="mb-8 flex flex-wrap gap-3 text-sm">
        {!source.enabled ? <Badge>disabled</Badge> : !source.termsAcknowledged ? <Badge tone="amber">monitoring paused: terms not acknowledged</Badge> : source.consecutiveFailures ? <Badge tone="red">failing ×{source.consecutiveFailures}</Badge> : <Badge tone="green">healthy</Badge>}
        <span className="text-muted">Last check: {source.lastCheckedAt ? `${timeAgo(source.lastCheckedAt)} (${formatDateTime(source.lastCheckedAt)})` : 'never'}</span>
        <span className="text-muted">Last success: {source.lastSuccessAt ? timeAgo(source.lastSuccessAt) : 'never'}</span>
        {byStatus.map((b) => <Badge key={b.status} tone={statusTone(b.status)}>{b.status.toLowerCase()}: {b._count}</Badge>)}
      </div>
      {source.lastError && <p className="mb-6 rounded-md border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-700 dark:text-red-300"><strong>Last error:</strong> {source.lastError}</p>}
      <div className="panel p-5"><SourceForm source={source} categories={categories} action={updateSourceAction} submitLabel="Save changes" /></div>

      <h2 className="mb-3 mt-10 font-serif text-xl font-black">Recent items</h2>
      <Table head={['Detected', 'Title', 'Status', 'Detail']} empty={items.length ? undefined : 'Nothing detected yet.'}>
        {items.map((i) => (
          <tr key={i.id}>
            <td className="whitespace-nowrap px-4 py-2.5 text-muted">{timeAgo(i.createdAt)}</td>
            <td className="px-4 py-2.5"><a href={i.url} target="_blank" rel="noopener noreferrer" className="font-semibold hover:underline">{truncate(i.title, 90)}</a></td>
            <td className="px-4 py-2.5"><Badge tone={statusTone(i.status)}>{i.status.toLowerCase()}</Badge></td>
            <td className="px-4 py-2.5 text-xs text-muted">{i.statusReason ?? (i.articleSources[0] ? <Link className="underline" href={`/admin/articles/${i.articleSources[0].article.id}`}>open article</Link> : '')}</td>
          </tr>
        ))}
      </Table>
    </>
  );
}
