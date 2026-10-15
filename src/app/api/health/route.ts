import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { queueStats } from '@/server/queue';

export const dynamic = 'force-dynamic';

/** Public liveness probe. Reveals only coarse status (use for uptime monitors). */
export async function GET() {
  try {
    await db.$queryRaw`SELECT 1`;
    const lastTick = await db.cronRun.findFirst({ where: { kind: 'tick', ok: true }, orderBy: { startedAt: 'desc' }, select: { startedAt: true } });
    const ageMin = lastTick ? (Date.now() - lastTick.startedAt.getTime()) / 60000 : null;
    const q = await queueStats();
    const schedulerHealthy = ageMin !== null && ageMin < 20;
    return NextResponse.json({ ok: true, database: 'up', scheduler: schedulerHealthy ? 'healthy' : ageMin === null ? 'never-ran' : 'stale', lastTickMinutesAgo: ageMin === null ? null : Math.round(ageMin), queue: { pending: q.PENDING, failed: q.FAILED } }, { status: 200 });
  } catch {
    return NextResponse.json({ ok: false, database: 'down' }, { status: 503 });
  }
}
