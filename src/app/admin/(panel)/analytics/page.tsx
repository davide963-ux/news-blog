import { db } from '@/lib/db';
import { requireUser } from '@/lib/auth';
import { PageHeader, Stat, Table, Badge, statusTone } from '@/components/admin/ui';
import { formatDateTime, truncate } from '@/lib/utils';

export const metadata = { title: 'Analytics' };
const DAYS = 14;

function Bars({ data, label, format = (n: number) => String(n) }: { data: { day: string; value: number }[]; label: string; format?: (n: number) => string }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <figure className="panel p-4" aria-label={label}>
      <figcaption className="mb-3 text-sm font-bold">{label}</figcaption>
      <div className="flex h-36 items-end gap-1.5" role="img" aria-label={`${label}: ${data.map((d) => `${d.day} ${format(d.value)}`).join(', ')}`}>
        {data.map((d) => (
          <div key={d.day} className="group flex h-full flex-1 flex-col justify-end" title={`${d.day}: ${format(d.value)}`}>
            <span className="mb-1 text-center text-[0.6rem] text-muted opacity-0 group-hover:opacity-100">{format(d.value)}</span>
            <div className="w-full rounded-t bg-accent/80 transition group-hover:bg-accent" style={{ height: `${Math.max(2, (d.value / max) * 100)}%` }} />
          </div>
        ))}
      </div>
      <div className="mt-1 flex gap-1.5 text-center text-[0.6rem] text-muted">{data.map((d) => <span key={d.day} className="flex-1">{d.day.slice(8)}</span>)}</div>
    </figure>
  );
}

function fill(rows: { day: Date; v: number | bigint | null }[]) {
  const map = new Map(rows.map((r) => [r.day.toISOString().slice(0, 10), Number(r.v ?? 0)]));
  return Array.from({ length: DAYS }, (_, i) => {
    const d = new Date(Date.now() - (DAYS - 1 - i) * 86400_000).toISOString().slice(0, 10);
    return { day: d, value: map.get(d) ?? 0 };
  });
}

export default async function AnalyticsPage() {
  await requireUser();
  const since = new Date(Date.now() - DAYS * 86400_000);
  const [byStatus, perSource, dupCount, failedRuns, failedItems, usage, byModel, pubDaily, costDaily, errors] = await Promise.all([
    db.article.groupBy({ by: ['status'], _count: true }),
    db.source.findMany({ select: { id: true, name: true, _count: { select: { items: true } } } }),
    db.sourceItem.count({ where: { status: 'DUPLICATE' } }),
    db.generationRun.count({ where: { ok: false } }),
    db.sourceItem.count({ where: { status: 'FAILED' } }),
    db.generationRun.aggregate({ _sum: { promptTokens: true, completionTokens: true, costUsd: true } }),
    db.generationRun.groupBy({ by: ['model', 'kind'], _sum: { promptTokens: true, completionTokens: true, costUsd: true }, _count: true }),
    db.$queryRaw<{ day: Date; v: bigint }[]>`SELECT date_trunc('day', "publishedAt")::date AS day, count(*) AS v FROM "Article" WHERE "status"='PUBLISHED' AND "publishedAt" >= ${since} GROUP BY 1`,
    db.$queryRaw<{ day: Date; v: number }[]>`SELECT date_trunc('day', "createdAt")::date AS day, sum("costUsd") AS v FROM "GenerationRun" WHERE "createdAt" >= ${since} GROUP BY 1`,
    db.eventLog.findMany({ where: { level: 'ERROR' }, orderBy: { createdAt: 'desc' }, take: 15 }),
  ]);
  const detectedBySource = await Promise.all(perSource.map(async (s) => ({ name: s.name, total: s._count.items, last7: await db.sourceItem.count({ where: { sourceId: s.id, createdAt: { gte: new Date(Date.now() - 7 * 86400_000) } } }), dup: await db.sourceItem.count({ where: { sourceId: s.id, status: 'DUPLICATE' } }) })));
  const st = Object.fromEntries(byStatus.map((b) => [b.status, b._count]));
  const total = byStatus.reduce((n, b) => n + b._count, 0);
  const tokens = (usage._sum.promptTokens ?? 0) + (usage._sum.completionTokens ?? 0);
  const maxSrc = Math.max(1, ...detectedBySource.map((s) => s.total));

  return (
    <>
      <PageHeader title="Analytics" subtitle="Production, quality and cost across the automated pipeline." />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Articles generated" value={total} />
        <Stat label="Published" value={st.PUBLISHED ?? 0} tone="good" />
        <Stat label="Drafts / in review" value={(st.DRAFT ?? 0) + (st.PENDING_REVIEW ?? 0)} />
        <Stat label="Rejected" value={st.REJECTED ?? 0} />
        <Stat label="Duplicates prevented" value={dupCount} hint="items matched to an existing story" />
        <Stat label="Failed AI calls" value={failedRuns} tone={failedRuns ? 'warn' : 'good'} hint={`${failedItems} item(s) failed permanently`} />
        <Stat label="Tokens used" value={tokens.toLocaleString()} hint={`${(usage._sum.promptTokens ?? 0).toLocaleString()} in · ${(usage._sum.completionTokens ?? 0).toLocaleString()} out`} />
        <Stat label="Estimated AI cost" value={`$${(usage._sum.costUsd ?? 0).toFixed(2)}`} hint={total ? `≈ $${((usage._sum.costUsd ?? 0) / total).toFixed(3)} per article` : undefined} />
      </div>

      <div className="mt-8 grid gap-4 lg:grid-cols-2">
        <Bars data={fill(pubDaily)} label={`Articles published per day (last ${DAYS} days)`} />
        <Bars data={fill(costDaily as { day: Date; v: number }[])} label={`Estimated AI cost per day, USD`} format={(n) => `$${n.toFixed(2)}`} />
      </div>

      <h2 className="mb-3 mt-10 font-serif text-xl font-black">Articles detected per source</h2>
      <Table head={['Source', 'Detected (all time)', '', 'Last 7 days', 'Duplicates']} empty={detectedBySource.length ? undefined : 'No sources.'}>
        {detectedBySource.map((s) => (
          <tr key={s.name}><td className="px-4 py-2.5 font-semibold">{s.name}</td><td className="px-4 py-2.5">{s.total}</td><td className="w-1/3 px-4 py-2.5"><div className="h-2 rounded bg-wash"><div className="h-2 rounded bg-accent" style={{ width: `${(s.total / maxSrc) * 100}%` }} /></div></td><td className="px-4 py-2.5">{s.last7}</td><td className="px-4 py-2.5">{s.dup}</td></tr>
        ))}
      </Table>

      <h2 className="mb-3 mt-10 font-serif text-xl font-black">AI usage by model</h2>
      <Table head={['Model', 'Purpose', 'Calls', 'Input tokens', 'Output tokens', 'Est. cost']} empty={byModel.length ? undefined : 'No AI calls yet.'}>
        {byModel.map((m) => <tr key={`${m.model}-${m.kind}`}><td className="px-4 py-2.5 font-mono text-xs">{m.model}</td><td className="px-4 py-2.5"><Badge>{m.kind}</Badge></td><td className="px-4 py-2.5">{m._count}</td><td className="px-4 py-2.5">{(m._sum.promptTokens ?? 0).toLocaleString()}</td><td className="px-4 py-2.5">{(m._sum.completionTokens ?? 0).toLocaleString()}</td><td className="px-4 py-2.5">${(m._sum.costUsd ?? 0).toFixed(3)}</td></tr>)}
      </Table>

      <h2 className="mb-3 mt-10 font-serif text-xl font-black">Latest errors</h2>
      <Table head={['When', 'Scope', 'Message']} empty={errors.length ? undefined : 'No errors recorded.'}>
        {errors.map((e) => <tr key={e.id}><td className="whitespace-nowrap px-4 py-2 text-xs text-muted">{formatDateTime(e.createdAt)}</td><td className="px-4 py-2"><Badge tone={statusTone('ERROR')}>{e.scope}</Badge></td><td className="px-4 py-2 text-xs">{truncate(e.message, 240)}</td></tr>)}
      </Table>
    </>
  );
}
