import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { clientIp, rateLimit } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';

/** Privacy-friendly view counter (no cookies, no IPs stored) used for the "Trending" ranking. */
export async function POST(req: Request) {
  const ip = clientIp(req.headers);
  const body = (await req.json().catch(() => null)) as { slug?: string } | null;
  const slug = body?.slug;
  if (!slug || slug.length > 200) return NextResponse.json({ ok: false }, { status: 400 });
  const rl = await rateLimit(`view:${ip}:${slug}`, 3, 3600);
  if (!rl.ok) return NextResponse.json({ ok: true });
  const a = await db.article.findFirst({ where: { slug, status: 'PUBLISHED' }, select: { id: true } });
  if (!a) return NextResponse.json({ ok: false }, { status: 404 });
  await db.$executeRaw`
    INSERT INTO "ArticleView" ("articleId","day","count") VALUES (${a.id}, CURRENT_DATE, 1)
    ON CONFLICT ("articleId","day") DO UPDATE SET "count" = "ArticleView"."count" + 1`;
  await db.article.update({ where: { id: a.id }, data: { viewCount: { increment: 1 } } });
  return NextResponse.json({ ok: true });
}
