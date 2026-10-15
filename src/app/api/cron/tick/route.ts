import { NextResponse } from 'next/server';
import { env } from '@/lib/env';
import { safeEqual } from '@/lib/crypto';
import { runTick } from '@/server/tick';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/**
 * Heartbeat. Vercel Cron calls this every 5 minutes (vercel.json) with `Authorization: Bearer $CRON_SECRET`.
 * Any external scheduler (GitHub Actions, cron-job.org, Upstash QStash) may call it the same way.
 * Overlapping invocations are safe: jobs are claimed with SKIP LOCKED and enqueues are idempotent.
 */
export async function GET(req: Request) {
  const secret = env.cronSecret;
  const auth = req.headers.get('authorization') ?? '';
  if (!secret || !safeEqual(auth, `Bearer ${secret}`)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  try {
    const stats = await runTick({ budgetMs: 255_000 });
    return NextResponse.json({ ok: true, ...stats });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
}
export const POST = GET;
