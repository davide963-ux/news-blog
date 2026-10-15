import Link from 'next/link';
import { db } from '@/lib/db';
import { requireUser } from '@/lib/auth';
import { ConfirmButton } from '@/components/admin/confirm-button';
import { Badge, Flash, PageHeader, Table } from '@/components/admin/ui';
import { SourceForm } from '@/components/admin/source-form';
import { createSourceAction, deleteSourceAction, toggleSourceAction } from '../../actions';
import { timeAgo } from '@/lib/utils';

export const metadata = { title: 'Sources' };

export default async function SourcesPage({ searchParams }: { searchParams: Promise<{ ok?: string; err?: string }> }) {
  await requireUser('ADMIN');
  const sp = await searchParams;
  const [sources, categories, counts] = await Promise.all([
    db.source.findMany({ orderBy: { createdAt: 'asc' } }),
    db.category.findMany({ orderBy: { sortOrder: 'asc' }, select: { slug: true, name: true } }),
    db.sourceItem.groupBy({ by: ['sourceId'], where: { createdAt: { gte: new Date(Date.now() - 7 * 86400_000) } }, _count: true }),
  ]);
  const week = new Map(counts.map((c) => [c.sourceId, c._count]));
  return (
    <>
      <PageHeader title="News sources" subtitle="Sites the system monitors. Add only sources whose terms or licences permit automated processing." />
      <Flash ok={sp.ok} err={sp.err} />
      <Table head={['Source', 'Type', 'Interval', 'Status', 'Last check', '7-day items', '']} empty={sources.length ? undefined : 'No sources configured yet. Add your first one below.'}>
        {sources.map((s) => (
          <tr key={s.id}>
            <td className="px-4 py-3"><Link href={`/admin/sources/${s.id}`} className="font-semibold hover:underline">{s.name}</Link><p className="max-w-xs truncate text-xs text-muted">{s.feedUrl}</p></td>
            <td className="px-4 py-3"><Badge>{s.type}</Badge> <span className="text-xs text-muted">{s.fetchMode === 'FULL_PAGE' ? '+page' : ''}</span></td>
            <td className="px-4 py-3">{s.checkIntervalMinutes} min</td>
            <td className="px-4 py-3">{!s.enabled ? <Badge>disabled</Badge> : !s.termsAcknowledged ? <Badge tone="amber">needs terms ack.</Badge> : s.consecutiveFailures ? <Badge tone="red">failing ×{s.consecutiveFailures}</Badge> : <Badge tone="green">healthy</Badge>}</td>
            <td className="px-4 py-3 text-muted">{s.lastCheckedAt ? timeAgo(s.lastCheckedAt) : 'never'}</td>
            <td className="px-4 py-3">{week.get(s.id) ?? 0}</td>
            <td className="px-4 py-3">
              <div className="flex justify-end gap-2">
                <form action={toggleSourceAction}><input type="hidden" name="id" value={s.id} /><button className="btn !px-2.5 !py-1 !text-xs">{s.enabled ? 'Disable' : 'Enable'}</button></form>
                <form action={deleteSourceAction}><input type="hidden" name="id" value={s.id} /><ConfirmButton message={`Remove ${s.name}? Published articles are kept.`} className="btn !px-2.5 !py-1 !text-xs !text-red-600" aria-label={`Remove ${s.name}`}>Remove</ConfirmButton></form>
              </div>
            </td>
          </tr>
        ))}
      </Table>
      <h2 className="mb-4 mt-10 font-serif text-2xl font-black">Add a source</h2>
      <div className="panel p-5"><SourceForm categories={categories} action={createSourceAction} submitLabel="Add source" /></div>
    </>
  );
}
