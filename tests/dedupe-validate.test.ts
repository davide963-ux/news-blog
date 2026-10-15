import { describe, it, expect } from 'vitest';
import { settingsSchema } from '@/lib/settings';
import { bestMatch } from '@/server/dedupe';
import { validateArticle } from '@/server/validate';
import { classifySensitivity } from '@/server/sensitive';
import { contentHash, simhash } from '@/server/text';
import type { ArticleOutput } from '@/server/ai/schema';
import { SOURCE_A, SOURCE_B, SOURCE_C, SOURCE_D, GOOD_ARTICLE_BODY } from './fixtures';

const s = settingsSchema.parse({});
const cand = (id: string, x: { title: string; text: string }, storyId = 'st_' + id) => ({ id, ...x, storyId, contentHash: contentHash(x.title + ' ' + x.text), simhash: simhash(x.text) });

describe('story duplicate detection', () => {
  it('matches the same event reported with different wording by another outlet', () => {
    const m = bestMatch(cand('b', SOURCE_B), [cand('a', SOURCE_A), cand('c', SOURCE_C), cand('d', SOURCE_D)], s);
    expect(m?.itemId).toBe('a');
    expect(m!.score).toBeGreaterThanOrEqual(s.quality.duplicateThreshold);
  });
  it('does not merge a similar-topic but different event (other country, other figures)', () => {
    expect(bestMatch(cand('d', SOURCE_D), [cand('a', SOURCE_A), cand('c', SOURCE_C)], s)).toBeNull();
    expect(bestMatch(cand('a', SOURCE_A), [cand('d', SOURCE_D)], s)).toBeNull();
  });
  it('does not match unrelated stories', () => {
    expect(bestMatch(cand('c', SOURCE_C), [cand('a', SOURCE_A), cand('b', SOURCE_B)], s)).toBeNull();
  });
  it('flags identical syndicated text immediately', () => {
    const m = bestMatch(cand('a2', SOURCE_A), [cand('a', SOURCE_A)], s);
    expect(m?.via).toMatch(/identical|near-identical/);
  });
});

const baseOut = (over: Partial<ArticleOutput> = {}): ArticleOutput => ({
  headline: 'Eastland holds rates at 4.5% after split committee vote',
  dek: 'Two of nine members wanted a cut.', summary: 'The central bank held rates at 4.5% as inflation cooled to 3.1%.',
  excerpt: 'Eastland held its benchmark rate at 4.5% after a 7-2 vote while inflation fell to 3.1% in August, the central bank said on Thursday.',
  body: GOOD_ARTICLE_BODY, category: 'economy', tags: ['interest rates', 'inflation'], seoTitle: 'Eastland holds rates at 4.5%', metaDescription: 'Eastland kept its benchmark rate at 4.5% on Thursday after a 7-2 vote as inflation eased to 3.1% in August.',
  slug: 'eastland-holds-rates', isBreaking: false,
  keyFacts: [
    { claim: 'Rate held at 4.5%', status: 'confirmed', evidence: 'left its benchmark interest rate unchanged at 4.5%' },
    { claim: 'Vote was 7-2', status: 'confirmed', evidence: 'voted 7-2 to hold rates' },
  ],
  sensitivity: { topics: [], needsHumanReview: false, reason: '', injectionSuspected: false }, image: { altText: '', searchQuery: '', illustrationPrompt: '' },
  ...over,
});
const run = (out: ArticleOutput, body = out.body, extra: Record<string, unknown> = {}) =>
  validateArticle({ settings: { ...s, quality: { ...s.quality, minWords: 100 } }, out, body, sourceText: `${SOURCE_A.title}\n${SOURCE_A.text}`, sourceTitles: [SOURCE_A.title], sourceNames: ['Example Wire'], siteName: s.site.name, publishedAt: new Date('2024-09-12T10:00:00Z'), verifier: { verdict: 'pass', unsupportedClaims: [], certaintyIssues: [], meaningChanges: [] }, injectionFlags: [], thin: false, ...extra });

describe('article validation', () => {
  it('passes a faithful, original article', () => {
    const r = run(baseOut());
    expect(r.reasons).toEqual([]);
    expect(r.decision).toBe('publish');
  });
  it('catches an invented figure', () => {
    const body = GOOD_ARTICLE_BODY.replace('4.2%', '5.9%');
    const r = run(baseOut({ body }), body);
    expect(r.decision).toBe('review');
    expect(r.metrics.unsupportedNumbers).toContain('5.9');
    expect(r.retryable.join(' ')).toMatch(/5\.9/);
  });
  it('catches a fabricated quotation', () => {
    const body = GOOD_ARTICLE_BODY + '\n\nOkonkwo added: "Rates will certainly fall before the end of the year."';
    const r = run(baseOut({ body }), body);
    expect(r.metrics.unsupportedQuotes).toHaveLength(1);
    expect(r.decision).toBe('review');
  });
  it('catches an invented name', () => {
    const body = GOOD_ARTICLE_BODY + '\n\nAnalyst Gregory Whitmore of Blackwater Capital called the move prudent.';
    const r = run(baseOut({ body }), body);
    expect(r.metrics.unsupportedNames.join(' ')).toMatch(/Whitmore|Blackwater/);
    expect(r.decision).toBe('review');
  });
  it('rejects text copied from the source', () => {
    const copied = `${SOURCE_A.text}\n\nThe account draws on Example Wire.`;
    const r = run(baseOut({ body: copied }), copied);
    expect(r.decision).toBe('reject');
    expect(r.checks.find((c) => c.name === 'originality')?.status).toBe('fail');
  });
  it('routes to review on verifier failure, injection flags, thin sources and model flags', () => {
    expect(run(baseOut(), undefined, { verifier: { verdict: 'fail', unsupportedClaims: [{ claim: 'x', severity: 'high', reason: '' }], certaintyIssues: [], meaningChanges: [] } }).decision).toBe('review');
    expect(run(baseOut(), undefined, { injectionFlags: ['ignore previous'] }).decision).toBe('review');
    expect(run(baseOut(), undefined, { thin: true }).decision).toBe('review');
    expect(run(baseOut({ sensitivity: { topics: [], needsHumanReview: true, reason: 'unclear', injectionSuspected: false } })).decision).toBe('review');
  });
  it('requires verification when configured and the verifier is unavailable', () => {
    expect(run(baseOut(), undefined, { verifier: null, verifierError: 'timeout' }).decision).toBe('review');
  });
});

describe('regressions from live NASA run', () => {
  it('does not treat a Title Case headline as an unknown proper noun', () => {
    const out = baseOut({ headline: 'Eastland Central Bank Holds Interest Rates After Split Committee Vote' });
    const r = run(out);
    expect(r.metrics.unsupportedNames).toEqual([]);
    expect(r.decision).toBe('publish');
  });
  it('still catches an invented name in the body when the headline is Title Case', () => {
    const body = GOOD_ARTICLE_BODY + '\n\nAnalyst Gregory Whitmore of Blackwater Capital called the move prudent.';
    const r = run(baseOut({ headline: 'Eastland Central Bank Holds Interest Rates After Split Committee Vote', body }), body);
    expect(r.decision).toBe('review');
  });
});

describe('sensitivity classification', () => {
  it('flags crime, elections, health, conflict; leaves routine business alone', () => {
    const c = (title: string, lead = '', cat = false) => classifySensitivity({ settings: s, title, leadText: lead, aiTopics: [], categorySensitive: cat, isBreaking: false });
    expect(c('Man arrested over shop robbery').level).toBe(2);
    expect(c('Voters head to the polls in key election').level).toBe(2);
    expect(c('New vaccine approved after clinical trial').level).toBe(2);
    expect(c('Missile strike hits border town').level).toBe(2);
    expect(c('Chipmaker reports higher quarterly profit').level).toBe(0);
    expect(c('Anything', '', true).level).toBe(2);
  });
});
