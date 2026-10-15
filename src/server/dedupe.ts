import { db } from '@/lib/db';
import type { Settings } from '@/lib/settings';
import { cosine, cosineVec, hamming, jaccard, properNouns, significantNumbers, termFreq, tokens } from './text';

export interface Candidate { id: string; title: string; text: string; contentHash?: string | null; simhash?: string | null; embedding?: number[] }
export interface Match { itemId: string; storyId: string; score: number; via: string }

function features(c: { title: string; text: string }) {
  const body = c.text.slice(0, 1800);
  return {
    titleTf: termFreq(tokens(c.title)),
    bodyTf: termFreq(tokens(`${c.title} ${body}`)),
    nouns: new Set(properNouns(`${c.title}. ${body}`).map((n) => n.toLowerCase())),
    nums: new Set(significantNumbers(`${c.title} ${body}`)),
  };
}

/** Pure scoring function (unit tested). Returns best match among candidates or null. */
export function bestMatch(item: Candidate, pool: Array<Candidate & { storyId: string }>, s: Settings): Match | null {
  if (!pool.length) return null;
  // IDF over the pool so ubiquitous words don't dominate
  const df = new Map<string, number>();
  const feats = pool.map((p) => features(p));
  for (const f of feats) for (const t of f.bodyTf.keys()) df.set(t, (df.get(t) ?? 0) + 1);
  const n = pool.length + 1;
  const idf = new Map<string, number>();
  for (const [t, d] of df) idf.set(t, Math.log(1 + n / (1 + d)));
  const fi = features(item);

  let best: Match | null = null;
  pool.forEach((p, idx) => {
    const f = feats[idx];
    let via = '';
    let score = 0;
    if (item.contentHash && p.contentHash === item.contentHash) { score = 1; via = 'identical text'; }
    else if (item.simhash && p.simhash && hamming(item.simhash, p.simhash) <= 3) { score = 0.97; via = 'near-identical text (simhash)'; }
    else {
      const bodyCos = cosine(fi.bodyTf, f.bodyTf, idf);
      const titleCos = cosine(fi.titleTf, f.titleTf);
      const nounJ = jaccard(fi.nouns, f.nouns);
      const numJ = jaccard(fi.nums, f.nums);
      // Independent outlets reword everything but keep the same names and figures, so those carry real weight.
      const combined = 0.35 * bodyCos + 0.15 * titleCos + 0.25 * nounJ + 0.25 * numJ;
      score = combined;
      via = `lexical ${combined.toFixed(2)} (body ${bodyCos.toFixed(2)}, title ${titleCos.toFixed(2)}, entities ${nounJ.toFixed(2)}, figures ${numJ.toFixed(2)})`;
      if (!(combined >= s.quality.duplicateThreshold) && titleCos >= 0.8 && nounJ >= 0.4) { score = Math.max(combined, s.quality.duplicateThreshold); via = `similar headline ${titleCos.toFixed(2)}`; }
      if (item.embedding?.length && p.embedding?.length) {
        const e = cosineVec(item.embedding, p.embedding);
        if (e >= s.ai.embeddings.similarityThreshold && e > score) { score = e; via = `semantic embedding ${e.toFixed(2)}`; }
      }
    }
    if (score >= s.quality.duplicateThreshold && (!best || score > best.score)) best = { itemId: p.id, storyId: p.storyId, score, via };
  });
  return best;
}

export async function findStoryMatch(item: Candidate, s: Settings): Promise<Match | null> {
  const since = new Date(Date.now() - s.quality.duplicateWindowHours * 3600_000);
  const rows = await db.$queryRaw<Array<{ id: string; title: string; text: string | null; contentHash: string | null; simhash: string | null; storyId: string; embedding: number[] }>>`
    SELECT "id","title",left(coalesce("contentText","summary",''),1800) AS "text","contentHash","simhash","storyId","embedding"
    FROM "SourceItem"
    WHERE "id" <> ${item.id} AND "storyId" IS NOT NULL AND "createdAt" >= ${since}
      AND "status" IN ('EXTRACTED','GENERATED','DUPLICATE')
    ORDER BY "createdAt" DESC LIMIT 500`;
  return bestMatch(item, rows.map((r) => ({ ...r, text: r.text ?? '', embedding: r.embedding ?? [] })), s);
}
