import Link from 'next/link';
import { db } from '@/lib/db';
import { getSettings } from '@/lib/settings';
import { hasAiKey } from '@/server/ai/provider';
import { queueStats } from '@/server/queue';
import { Badge, Flash, PageHeader, Stat, Table, statusTone } from '@/components/admin/ui';
import { formatDateTime, timeAgo } from '@/lib/utils';
import { runTickNowAction } from '../actions';

export const maxDuration = 120; // hosts long-running actions (manual tick / source check)
export const metadata = { title: 'Dashboard' };

export default async function Dashboard({ searchParams }: { searchParams: Promise<{ ok?: string; err?: string; denied?: string }> }) {
  const sp = await searchParams;
  const s = await getSettings(true);
  const since24 = new Date(Date.now() - 24 * 3600_000);
  const [published24, review, drafts, lastTick, q, sources, recentLogs, failed24, dup24, cost24] = await Promise.all([
    db.article.count({ where: { status: 'PUBLISHED', publishedAt: { gte: since24 } } }),
    db.article.count({ where: { status: 'PENDING_REVIEW' } }),
    db.article.count({ where: { status: 'DRAFT' } }),
    db.cronRun.findFirst({ where: { kind: 'tick' }, orderBy: { startedAt: 'desc' } }),
    queueStats(),
    db.source.findMany({ orderBy: { name: 'asc' } }),
    db.eventLog.findMany({ where: { level: { in: ['WARN', 'ERROR'] } }, orderBy: { createdAt: 'desc' }, take: 8 }),
    db.generationRun.count({ where: { ok: false, createdAt: { gte: since24 } } }),
    db.sourceItem.count({ where: { status: 'DUPLICATE', updatedAt: { gte: since24 } } }),
    db.generationRun.aggregate({ where: { createdAt: { gte: since24 } }, _sum: { costUsd: true } }),
  ]);
  const tickAge = lastTick ? (Date.now() - lastTick.startedAt.getTime()) / 60000 : null;
  const tickTone = tickAge === null ? 'bad' : tickAge < 12 ? 'good' : tickAge < 25 ? 'warn' : 'bad';
  const aiOk = hasAiKey(s);

  return (
    <>
      <PageHeader title="Dashboard" subtitle="Live status of the automated newsroom." actions={<form action={runTickNowAction}><button className="btn btn-primary">▶ Run monitoring now</button></form>} />
      <Flash ok={sp.ok} err={sp.err ?? (sp.denied ? 'That area requires administrator rights.' : undefined)} />
      {(!aiOk || !s.automation.monitoringEnabled || tickTone === 'bad') && (
        <div className="mb-6 space-y-2">
          {!aiOk && <p className="rounded-md border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-700 dark:text-red-300"><strong>No AI API key.</strong> Articles cannot be generated. Add ANTHROPIC_API_KEY / OPENAI_API_KEY in the environment or <Link className="underline" href="/admin/settings#ai">Settings → AI</Link>.</p>}
          {!s.automation.monitoringEnabled && <p className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-800 dark:text-amber-300"><strong>Monitoring is paused</strong> in Settings → Automation.</p>}
          {tickTone === 'bad' && <p className="rounded-md border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-700 dark:text-red-300"><strong>Scheduler has not run recently.</strong> On Vercel, cron jobs at 5-minute intervals require the Pro plan; check Project → Settings → Cron Jobs and that CRON_SECRET is set — or use the GitHub Actions trigger in the README.</p>}
        </div>
      )}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Scheduler" value={lastTick ? timeAgo(lastTick.startedAt) : 'never'} tone={tickTone} hint={lastTick ? `${lastTick.ok ? 'OK' : 'FAILED'} · ${formatDateTime(lastTick.startedAt)}` : 'No tick has run yet'} />
        <Stat label="Published (24h)" value={published24} hint={`limit ${s.automation.dailyPublishLimit}/day · ${s.automation.hourlyPublishLimit}/h`} />
        <Stat label="Awaiting review" value={review} tone={review > 10 ? 'warn' : undefined} hint={<Link className="underline" href="/admin/articles?status=PENDING_REVIEW">Open queue</Link>} />
        <Stat label="Queue" value={`${q.PENDING + q.RUNNING}`} tone={q.FAILED ? 'warn' : undefined} hint={`${q.PENDING} pending · ${q.RUNNING} running · ${q.FAILED} failed`} />
        <Stat label="Queued drafts" value={drafts} hint="incl. held by publication limits" />
        <Stat label="Duplicates blocked (24h)" value={dup24} />
        <Stat label="AI failures (24h)" value={failed24} tone={failed24 ? 'warn' : 'good'} />
        <Stat label="AI cost (24h)" value={`$${(cost24._sum.costUsd ?? 0).toFixed(2)}`} hint="estimate from token prices in Settings" />
      </div>

      <h2 className="mb-3 mt-10 font-serif text-xl font-black">Sources</h2>
      <Table head={['Source', 'Status', 'Last check', 'Detected', 'Last error']} empty={sources.length ? undefined : 'No sources yet — add your first source.'}>
        {sources.map((x) => (
          <tr key={x.id}>
            <td className="px-4 py-3 font-semibold"><Link className="hover:underline" href={`/admin/sources/${x.id}`}>{x.name}</Link></td>
            <td className="px-4 py-3">{!x.enabled ? <Badge>disabled</Badge> : !x.termsAcknowledged ? <Badge tone="amber">terms not acknowledged</Badge> : x.consecutiveFailures ? <Badge tone="red">{x.consecutiveFailures} failure(s)</Badge> : <Badge tone="green">healthy</Badge>}</td>
            <td className="px-4 py-3 text-muted">{x.lastCheckedAt ? timeAgo(x.lastCheckedAt) : '—'}</td>
            <td className="px-4 py-3">{x.itemsDetectedTotal}</td>
            <td className="max-w-xs truncate px-4 py-3 text-xs text-muted" title={x.lastError ?? ''}>{x.lastError ?? '—'}</td>
          </tr>
        ))}
      </Table>

      <h2 className="mb-3 mt-10 font-serif text-xl font-black">Recent warnings &amp; errors</h2>
      <Table head={['When', 'Level', 'Scope', 'Message']} empty={recentLogs.length ? undefined : 'Nothing to report.'}>
        {recentLogs.map((l) => (
          <tr key={l.id}><td className="whitespace-nowrap px-4 py-2.5 text-muted">{timeAgo(l.createdAt)}</td><td className="px-4 py-2.5"><Badge tone={statusTone(l.level)}>{l.level}</Badge></td><td className="px-4 py-2.5">{l.scope}</td><td className="px-4 py-2.5 text-xs">{l.message}</td></tr>
        ))}
      </Table>
    </>
  );
}
