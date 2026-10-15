import { db } from '@/lib/db';

export const dynamic = 'force-dynamic';

/** Serves images stored in PostgreSQL (fallback when Vercel Blob is not configured). Immutable => CDN cached. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[a-z0-9]{10,40}$/i.test(id)) return new Response('Not found', { status: 404 });
  const m = await db.media.findUnique({ where: { id } });
  if (!m) return new Response('Not found', { status: 404 });
  return new Response(m.data, {
    headers: { 'content-type': m.contentType, 'cache-control': 'public, max-age=31536000, s-maxage=31536000, immutable', 'x-content-type-options': 'nosniff' },
  });
}
