import sharp from 'sharp';
import { put } from '@vercel/blob';
import { db } from '@/lib/db';
import { env } from '@/lib/env';

export interface StoredImage { url: string; smallUrl: string }

/** Re-encode (strips metadata, normalises size) and store. Vercel Blob when configured, else PostgreSQL. */
export async function storeImage(input: Buffer): Promise<StoredImage> {
  const img = sharp(input, { failOn: 'error', limitInputPixels: 60_000_000 }).rotate();
  const [large, small] = await Promise.all([
    img.clone().resize({ width: 1600, withoutEnlargement: true }).webp({ quality: 78 }).toBuffer(),
    img.clone().resize({ width: 640, withoutEnlargement: true }).webp({ quality: 72 }).toBuffer(),
  ]);
  if (env.blobToken) {
    const id = crypto.randomUUID();
    const [a, b] = await Promise.all([
      put(`news/${id}-1600.webp`, large, { access: 'public', contentType: 'image/webp', addRandomSuffix: false, cacheControlMaxAge: 31536000 }),
      put(`news/${id}-640.webp`, small, { access: 'public', contentType: 'image/webp', addRandomSuffix: false, cacheControlMaxAge: 31536000 }),
    ]);
    return { url: a.url, smallUrl: b.url };
  }
  const [a, b] = await Promise.all([
    db.media.create({ data: { contentType: 'image/webp', data: new Uint8Array(large) }, select: { id: true } }),
    db.media.create({ data: { contentType: 'image/webp', data: new Uint8Array(small) }, select: { id: true } }),
  ]);
  return { url: `/media/${a.id}`, smallUrl: `/media/${b.id}` };
}
