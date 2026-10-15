import { db } from '@/lib/db';
import { requireUser } from '@/lib/auth';
import type { LogLevel } from '@prisma/client';
import Link from 'next/link';
import { Badge, PageHeader, Table, statusTone } from '@/components/admin/ui';
import { formatDateTime, truncate } from '@/lib/utils';

export const metadata = { title: 'Logs & audit' };
const LEVELS: LogLevel[] = ['ERROR', 'WARN', 'INFO'];

export default async function LogsPage({ searchParams }: { searchParams: Promise<{ level?: string; scope?: string }> }) {
  await requireUser();
  const sp = await searchParams;
  const level = LEVELS.includes(sp.level as LogLevel) ? (sp.level as LogLevel) : undefined;
  const [logs, audit, runs] = await Promise.all([
    db.eventLog.findMany({ where: { ...(level ? { level } : {}), ...(sp.scope ? { scope: sp.scope } : {}) }, orderBy: { createdAt: 'desc' }, take: 100 }),
    db.auditLog.findMany({ orderBy: { createdAt: 'desc' }, take: 50 }),
    db.cronRun.findMany({ orderBy: { startedAt: 'desc' }, take: 12 }),
  ]);
  return (
    <>
      <PageHeader title="Logs & audit trail" subtitle="System events (30 days) and a record of every administrative action." />
      <div className="mb-4 flex gap-2"><Link href="/admin/logs" className="btn !py-1.5">All</Link>{LEVELS.map((l) => <Link key={l} href={`/admin/logs?level=${l}`} className="btn !py-1.5">{l.toLowerCase()}</Link>)}</div>
      <Table head={['Time', 'Level', 'Scope', 'Message']} empty={logs.length ? undefined : 'No events.'}>
        {logs.map((l) => <tr key={l.id} className="align-top"><td className="whitespace-nowrap px-4 py-2 text-xs text-muted">{formatDateTime(l.createdAt)}</td><td className="px-4 py-2"><Badge tone={statusTone(l.level)}>{l.level}</Badge></td><td className="px-4 py-2 text-xs">{l.scope}</td><td className="px-4 py-2 text-xs">{truncate(l.message, 300)}</td></tr>)}
      </Table>
      <h2 className="mb-3 mt-10 font-serif text-xl font-black">Scheduler runs</h2>
      <Table head={['Started', 'Result', 'Stats']}>
        {runs.map((r) => <tr key={r.id}><td className="px-4 py-2 text-xs text-muted">{formatDateTime(r.startedAt)}</td><td className="px-4 py-2">{r.ok ? <Badge tone="green">ok</Badge> : <Badge tone="red">failed</Badge>} {r.finishedAt ? '' : <Badge tone="amber">running/interrupted</Badge>}</td><td className="px-4 py-2 font-mono text-xs">{r.error ?? JSON.stringify(r.stats)}</td></tr>)}
      </Table>
      <h2 className="mb-3 mt-10 font-serif text-xl font-black">Audit trail</h2>
      <Table head={['Time', 'Actor', 'Action', 'Entity', 'Details']}>
        {audit.map((a) => <tr key={a.id} className="align-top"><td className="whitespace-nowrap px-4 py-2 text-xs text-muted">{formatDateTime(a.createdAt)}</td><td className="px-4 py-2 text-xs">{a.actor}</td><td className="px-4 py-2 text-xs font-semibold">{a.action}</td><td className="px-4 py-2 text-xs text-muted">{a.entity}{a.entityId ? ` ${a.entityId.slice(0, 8)}` : ''}</td><td className="max-w-xs truncate px-4 py-2 font-mono text-xs text-muted">{a.meta ? JSON.stringify(a.meta) : ''}</td></tr>)}
      </Table>
    </>
  );
}
