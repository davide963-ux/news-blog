import type { Settings } from '@/lib/settings';
import type { ArticleOutput, VerifierOutput } from './ai/schema';
import {
  normalizeForMatch, maskFacts, numbersIn, significantNumbers, properNouns, quotedStrings, shingles, longestCommonRun,
  tokens, wordCount, jaccard,
} from './text';
import { stripMarkdown } from './render';

export type CheckStatus = 'pass' | 'warn' | 'review' | 'fail';
export interface Check { name: string; status: CheckStatus; detail: string }
export interface ValidationReport {
  checks: Check[];
  decision: 'publish' | 'review' | 'reject';
  reasons: string[];
  /** Problems that justify an automatic regeneration attempt. */
  retryable: string[];
  metrics: { overlapRatio: number; longestRun: number; words: number; unsupportedNumbers: string[]; unsupportedNames: string[]; unsupportedQuotes: string[]; groundedFacts: number; totalFacts: number };
}

export interface ValidateInput {
  settings: Settings;
  out: ArticleOutput;
  body: string; // final markdown (after attribution fix)
  sourceText: string; // concatenation of all source texts (incl. titles)
  sourceTitles: string[];
  sourceNames: string[];
  siteName: string;
  publishedAt?: Date | null;
  verifier?: VerifierOutput | null;
  verifierError?: string | null;
  injectionFlags: string[];
  thin: boolean;
}

/** Proper nouns that are universally known and need no source support. */
const COMMON_PROPER = new Set(['earth', 'sun', 'moon', 'internet', 'web', 'god', 'christmas', 'easter', 'ramadan', 'mother nature']);

const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];

export function validateArticle(i: ValidateInput): ValidationReport {
  const { settings: s, out } = i;
  const checks: Check[] = [];
  const retryable: string[] = [];
  const add = (name: string, status: CheckStatus, detail: string) => checks.push({ name, status, detail });

  const plainBody = stripMarkdown(i.body);
  const generated = `${out.headline}. ${out.dek}. ${out.summary}. ${plainBody}`;
  const srcNorm = normalizeForMatch(i.sourceText);
  const srcTokens = new Set(tokens(i.sourceText, { keepStop: true }));

  // 1. Length
  const words = wordCount(plainBody);
  if (words < s.quality.minWords * 0.75) add('length', 'review', `Body has ${words} words (minimum ${s.quality.minWords}).`);
  else if (words > s.quality.maxWords * 1.4) add('length', 'warn', `Body has ${words} words (maximum ${s.quality.maxWords}).`);
  else add('length', 'pass', `${words} words.`);

  // 2. Headline independence
  const tj = Math.max(...i.sourceTitles.map((t) => jaccard(new Set(tokens(t)), new Set(tokens(out.headline)))), 0);
  const titleRun = Math.max(...i.sourceTitles.map((t) => longestCommonRun(t, out.headline).words), 0);
  // Reordered keywords are normal for short factual headlines; flag only a long shared word sequence or a near-identical keyword set.
  if (tj >= 0.95 || titleRun >= 6) add('headline', 'review', 'Headline is nearly identical to the source headline.');
  else add('headline', 'pass', 'Headline is distinct from the source.');

  // 3. Numbers & figures
  const srcNums = new Set(numbersIn(i.sourceText));
  const allowedExtra = new Set<string>();
  const now = new Date();
  for (const d of [i.publishedAt, now]) if (d) { allowedExtra.add(String(d.getUTCFullYear())); allowedExtra.add(String(d.getUTCDate())); }
  const unsupportedNumbers = significantNumbers(generated).filter((n) => !srcNums.has(n) && !allowedExtra.has(n));
  if (unsupportedNumbers.length) {
    add('figures', 'review', `Figures not found in source: ${unsupportedNumbers.slice(0, 8).join(', ')}.`);
    retryable.push(`These figures do not appear in the source and must be removed or corrected: ${unsupportedNumbers.slice(0, 8).join(', ')}.`);
  } else add('figures', 'pass', 'All figures appear in the source.');

  // 4. Names / entities
  const publisherNames = [i.siteName, ...i.sourceNames].map((n) => n.toLowerCase());
  // "Reuters" is fine when the configured source is "Reuters World News" (and vice versa).
  const isPublisher = (n: string) => publisherNames.some((p) => p === n || p.includes(n) || n.includes(p));
  const nouns = properNouns(`${out.headline}. ${plainBody}`).filter((n) => !isPublisher(n.toLowerCase()) && !MONTHS.includes(n.toLowerCase()) && !COMMON_PROPER.has(n.toLowerCase()));
  const unsupportedNames = nouns.filter((n) => {
    const ntoks = tokens(n, { keepStop: true });
    return ntoks.length > 0 && !srcNorm.includes(normalizeForMatch(n)) && !ntoks.every((t) => srcTokens.has(t));
  });
  const ratio = nouns.length ? unsupportedNames.length / nouns.length : 0;
  if (unsupportedNames.length && ratio > s.quality.unsupportedNameRatio) {
    add('names', 'review', `Names not found in source (${unsupportedNames.length}/${nouns.length}): ${unsupportedNames.slice(0, 8).join(', ')}.`);
    retryable.push(`These names/terms are not in the source and must be removed: ${unsupportedNames.slice(0, 8).join(', ')}.`);
  } else add('names', unsupportedNames.length ? 'warn' : 'pass', unsupportedNames.length ? `Minor unmatched names: ${unsupportedNames.slice(0, 5).join(', ')}.` : 'All names appear in the source.');

  // 5. Quotations must be verbatim
  const quotes = quotedStrings(i.body, 4);
  const unsupportedQuotes = quotes.filter((q) => !srcNorm.includes(normalizeForMatch(q)));
  if (unsupportedQuotes.length) {
    add('quotations', 'review', `${unsupportedQuotes.length} quotation(s) not found verbatim in the source.`);
    retryable.push(`Quotations must be copied exactly from the source. Remove or fix: ${unsupportedQuotes.slice(0, 3).map((q) => `"${q.slice(0, 60)}"`).join('; ')}.`);
  } else add('quotations', 'pass', quotes.length ? `${quotes.length} quotation(s) verified verbatim.` : 'No direct quotations.');

  // 6. Key-fact grounding (model-declared evidence must exist in source)
  const facts = out.keyFacts.filter((f) => f.evidence.trim().length > 0);
  const grounded = facts.filter((f) => {
    const ev = normalizeForMatch(f.evidence);
    if (srcNorm.includes(ev)) return true;
    const et = tokens(f.evidence, { keepStop: true });
    return et.length > 0 && et.filter((t) => srcTokens.has(t)).length / et.length >= 0.85;
  });
  if (out.keyFacts.length < 2) add('key_facts', 'warn', 'Model declared fewer than 2 key facts.');
  else if (facts.length && grounded.length / facts.length < 0.75) add('key_facts', 'review', `Only ${grounded.length}/${facts.length} declared key facts are grounded in source text.`);
  else add('key_facts', 'pass', `${grounded.length}/${facts.length} declared key facts grounded.`);

  // 7. Textual similarity to source (quoted passages excluded)
  const bodyNoQuotes = plainBody.replace(/["“][^"”]{8,600}["”]/g, ' ');
  const maskedBody = maskFacts(bodyNoQuotes, 'g');
  const maskedSrc = maskFacts(i.sourceText, 's');
  const g5 = shingles(maskedBody, 5);
  const s5 = shingles(maskedSrc, 5);
  let shared = 0;
  for (const g of g5) if (s5.has(g)) shared++;
  const overlap = g5.size ? shared / g5.size : 0;
  const run = longestCommonRun(maskedBody, maskedSrc);
  if (overlap > s.quality.maxOverlapRatio || run.words > s.quality.maxVerbatimRunWords) {
    add('originality', 'fail', `Too close to source: ${(overlap * 100).toFixed(1)}% shared 5-grams, longest verbatim run ${run.words} words ("${run.text.slice(0, 80)}").`);
    retryable.push(`The draft copies the source too closely (longest copied run: "${run.text.slice(0, 80)}"). Rewrite with different structure and wording.`);
  } else add('originality', 'pass', `${(overlap * 100).toFixed(1)}% shared 5-grams; longest verbatim run ${run.words} words.`);

  // 8. Attribution
  const lower = i.body.toLowerCase();
  if (i.sourceNames.some((n) => lower.includes(n.toLowerCase()))) add('attribution', 'pass', 'Source is named in the text.');
  else add('attribution', 'review', 'Source is not named in the text.');

  // 9. Prompt-injection / sanity
  if (i.injectionFlags.length || out.sensitivity.injectionSuspected) add('injection', 'review', `Possible prompt-injection content in the source (${i.injectionFlags.length} pattern(s); model flag: ${out.sensitivity.injectionSuspected}).`);
  else add('injection', 'pass', 'No injection patterns detected.');

  // 10. Source sufficiency
  if (i.thin) add('source_depth', 'review', 'Source material was thin; facts may be incomplete.');
  else add('source_depth', 'pass', 'Source material sufficient.');

  // 11. Model self-assessment
  if (out.sensitivity.needsHumanReview) add('model_flag', 'review', `Model requested human review: ${out.sensitivity.reason || 'no reason given'}.`);
  else add('model_flag', 'pass', 'No model review flag.');

  // 12. Independent AI fact verification
  if (i.verifier) {
    const high = i.verifier.unsupportedClaims.filter((c) => c.severity === 'high');
    if (i.verifier.verdict === 'fail' || high.length || i.verifier.certaintyIssues.length || i.verifier.meaningChanges.length) {
      const bits = [...high.map((c) => `unsupported: ${c.claim}`), ...i.verifier.certaintyIssues.map((c) => `certainty: ${c}`), ...i.verifier.meaningChanges.map((c) => `meaning: ${c}`)];
      add('ai_verification', 'review', `Verifier found issues: ${bits.slice(0, 4).join(' | ')}`);
      retryable.push(`An independent fact-checker found problems: ${bits.slice(0, 4).join(' | ')}`);
    } else add('ai_verification', 'pass', 'Independent verifier found no unsupported claims.');
  } else if (s.quality.requireAiVerification && s.ai.verifyWithAi) add('ai_verification', 'review', `Verification unavailable: ${i.verifierError ?? 'not run'}.`);
  else add('ai_verification', 'warn', 'AI verification disabled.');

  const reasons = checks.filter((c) => c.status === 'review' || c.status === 'fail').map((c) => `${c.name}: ${c.detail}`);
  const decision = checks.some((c) => c.status === 'fail') ? 'reject' : checks.some((c) => c.status === 'review') ? 'review' : 'publish';
  return {
    checks, decision, reasons, retryable,
    metrics: { overlapRatio: overlap, longestRun: run.words, words, unsupportedNumbers, unsupportedNames, unsupportedQuotes, groundedFacts: grounded.length, totalFacts: facts.length },
  };
}
