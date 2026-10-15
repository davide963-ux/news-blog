import { NextResponse } from 'next/server';
import { env } from '@/lib/env';
import { safeEqual } from '@/lib/crypto';
import { runMaintenance } from '@/server/maintenance';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

export async function GET(req: Request) {
  const secret = env.cronSecret;
  if (!secret || !safeEqual(req.headers.get('authorization') ?? '', `Bearer ${secret}`)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  try {
    return NextResponse.json({ ok: true, ...(await runMaintenance()) });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
}
export const POST = GET;
