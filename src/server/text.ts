import { createHash } from 'node:crypto';

/* -------- URL normalisation -------- */
const TRACKING = /^(utm_.+|fbclid|gclid|dclid|msclkid|mc_cid|mc_eid|igshid|ref|ref_src|source|cmpid|cid|ocid|taid|ito|xtor|at_medium|at_campaign|share|spm)$/i;

export function normalizeUrl(raw: string): string {
  const u = new URL(raw.trim());
  u.hash = '';
  u.protocol = 'https:'; // treat http/https as the same resource
  u.hostname = u.hostname.toLowerCase().replace(/^www\./, '').replace(/^m\./, '');
  if (u.port === '443' || u.port === '80') u.port = '';
  const params = [...u.searchParams.entries()].filter(([k]) => !TRACKING.test(k)).sort(([a], [b]) => a.localeCompare(b));
  u.search = '';
  for (const [k, v] of params) u.searchParams.append(k, v);
  u.pathname = u.pathname.replace(/\/{2,}/g, '/').replace(/\/(index|default)\.(html?|php|aspx?)$/i, '/');
  if (u.pathname.length > 1) u.pathname = u.pathname.replace(/\/+$/, '');
  return u.toString();
}

/* -------- Text cleanup -------- */
const ZERO_WIDTH = /[​-‏‪-‮⁠-⁤﻿]/g;
// eslint-disable-next-line no-control-regex
const CONTROL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;

export function cleanText(s: string): string {
  return s.replace(ZERO_WIDTH, '').replace(CONTROL, ' ').replace(/ /g, ' ').replace(/[ \t]+/g, ' ').replace(/\s*\n\s*/g, '\n').trim();
}

export function htmlToText(html: string): string {
  return cleanText(
    html
      .replace(/<(script|style|noscript|iframe|svg)[\s\S]*?<\/\1>/gi, ' ')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/(p|div|li|h[1-6]|blockquote|tr|td|th)>/gi, '\n')
      .replace(/<[^>]+>/g, '')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#0?39;|&apos;/g, "'")
      .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
      .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16))),
  );
}

export const wordCount = (s: string) => (s.trim() ? s.trim().split(/\s+/).length : 0);

/* -------- Tokenisation & similarity -------- */
const STOP = new Set(('a an the and or but if of to in on at by for with from as is are was were be been being it its this that these those he she they we you i his her their our your not no ' +
  'will would can could should may might has have had do does did said says say after before over under about into than then so such also more most up out new news report reports according').split(' '));

export function stem(w: string): string {
  return w.replace(/(ing|edly|ed|es|s)$/i, (m, _g, off) => (off >= 4 ? '' : m));
}

export function tokens(s: string, opts: { keepStop?: boolean } = {}): string[] {
  return s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 1 && (opts.keepStop || !STOP.has(w)))
    .map(stem);
}

export function termFreq(toks: string[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const t of toks) m.set(t, (m.get(t) ?? 0) + 1);
  return m;
}

export function cosine(a: Map<string, number>, b: Map<string, number>, idf?: Map<string, number>): number {
  let dot = 0, na = 0, nb = 0;
  const w = (t: string) => idf?.get(t) ?? 1;
  for (const [t, f] of a) { const x = f * w(t); na += x * x; const g = b.get(t); if (g) dot += x * g * w(t); }
  for (const [t, f] of b) { const x = f * w(t); nb += x * x; }
  return na && nb ? dot / Math.sqrt(na * nb) : 0;
}

export function jaccard<T>(a: Set<T>, b: Set<T>): number {
  if (!a.size || !b.size) return 0;
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  return inter / (a.size + b.size - inter);
}

export function cosineVec(a: number[], b: number[]): number {
  if (!a.length || a.length !== b.length) return 0;
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
  return na && nb ? dot / Math.sqrt(na * nb) : 0;
}

/* -------- Fingerprints -------- */
export function contentHash(s: string): string {
  return createHash('sha256').update(tokens(s, { keepStop: true }).join(' ')).digest('hex');
}

/** 64-bit SimHash over word trigrams, hex encoded. */
export function simhash(s: string): string {
  const toks = tokens(s, { keepStop: true });
  const grams = toks.length >= 3 ? toks.slice(0, -2).map((_, i) => toks.slice(i, i + 3).join(' ')) : toks;
  const v = new Array<number>(64).fill(0);
  for (const g of grams) {
    const h = createHash('md5').update(g).digest();
    for (let i = 0; i < 64; i++) v[i] += (h[i >> 3] >> (i & 7)) & 1 ? 1 : -1;
  }
  let out = '';
  for (let i = 0; i < 64; i += 4) {
    let nib = 0;
    for (let j = 0; j < 4; j++) if (v[i + j] > 0) nib |= 1 << j;
    out += nib.toString(16);
  }
  return out;
}

export function hamming(a: string, b: string): number {
  if (a.length !== b.length) return 64;
  let d = 0;
  for (let i = 0; i < a.length; i++) {
    let x = parseInt(a[i], 16) ^ parseInt(b[i], 16);
    while (x) { d += x & 1; x >>= 1; }
  }
  return d;
}

/* -------- Entities, numbers, quotes -------- */
const MONTHS = 'january february march april may june july august september october november december'.split(' ');
const NON_NAMES = new Set([...MONTHS, 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday', 'the', 'a', 'an', 'in', 'on', 'at', 'it', 'he', 'she', 'they', 'we', 'but', 'and', 'if', 'as', 'while', 'when', 'after', 'before', 'however', 'this', 'that', 'these', 'those', 'there', 'according', 'officials', 'meanwhile', 'one', 'two', 'for', 'with', 'by', 'from', 'his', 'her', 'their', 'its', 'our', 'what', 'why', 'how', 'who', 'where', 'also', 'later', 'earlier', 'still', 'despite', 'although', 'because', 'since', 'during', 'under', 'over', 'between', 'among', 'some', 'many', 'most', 'other', 'another', 'several', 'such', 'both', 'each', 'no', 'not', 'now', 'then', 'today', 'yesterday', 'tomorrow', 'last', 'next', 'first', 'second', 'third', 'new']);

/** Capitalised word sequences that are probably proper nouns (names, places, organisations). */
export function properNouns(text: string): string[] {
  const out = new Set<string>();
  const sentences = text.split(/(?<=[.!?])\s+|\n+/);
  for (const sent of sentences) {
    const words = sent.split(/\s+/);
    let run: string[] = [];
    const flush = (startIdx: number) => {
      if (!run.length) return;
      let r = run;
      // a single capitalised word at sentence start is not evidence of a name
      if (r.length === 1 && startIdx === 0) { run = []; return; }
      while (r.length && NON_NAMES.has(r[0].toLowerCase())) r = r.slice(1);
      if (r.length) out.add(r.join(' '));
      run = [];
    };
    let runStart = 0;
    words.forEach((raw, i) => {
      const w = raw.replace(/^[("'“‘\[]+|[)"'”’\].,;:!?…]+$/g, '').replace(/['’]s$/, '');
      const isCap = /^[A-Z][A-Za-zÀ-ſ\-']*$/.test(w) || /^[A-Z]{2,}$/.test(w);
      if (isCap) { if (!run.length) runStart = i; run.push(w); } else flush(runStart);
      if (/[.,;:!?)]$/.test(raw) && run.length) flush(runStart);
    });
    flush(runStart);
  }
  return [...out].filter((n) => n.length > 2);
}

const WORD_NUMS: Record<string, string> = { one: '1', two: '2', three: '3', four: '4', five: '5', six: '6', seven: '7', eight: '8', nine: '9', ten: '10', eleven: '11', twelve: '12', thirteen: '13', fourteen: '14', fifteen: '15', sixteen: '16', seventeen: '17', eighteen: '18', nineteen: '19', twenty: '20', thirty: '30', forty: '40', fifty: '50', hundred: '100', thousand: '1000', million: '1000000', billion: '1000000000' };

export function numbersIn(text: string): string[] {
  const out = new Set<string>();
  const re = /\d[\d,]*(?:\.\d+)?/g;
  for (const m of text.matchAll(re)) out.add(m[0].replace(/,/g, '').replace(/\.$/, ''));
  for (const w of text.toLowerCase().match(/\b[a-z]+\b/g) ?? []) if (WORD_NUMS[w]) out.add(WORD_NUMS[w]);
  return [...out];
}

/** Numbers that carry factual weight (excludes bare single digits found in running prose). */
export function significantNumbers(text: string): string[] {
  const out = new Set<string>();
  for (const m of text.matchAll(/(?<![\w.])\d[\d,]*(?:\.\d+)?(?![\w])/g)) {
    const n = m[0].replace(/,/g, '').replace(/\.$/, '');
    if (n.length >= 2 || /[%$€£]/.test(text.slice(Math.max(0, m.index! - 1), m.index! + m[0].length + 1))) out.add(n);
  }
  return [...out];
}

export function normalizeForMatch(s: string): string {
  return s.toLowerCase().replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[^a-z0-9\s']/g, ' ').replace(/\s+/g, ' ').trim();
}

/** Text inside double quotes with at least `minWords` words. */
export function quotedStrings(text: string, minWords = 4): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(/["“]([^"“”]{8,600}?)["”]/g)) {
    if (wordCount(m[1]) >= minWords) out.push(m[1].trim());
  }
  return out;
}

export function sentences(s: string): string[] {
  return s.split(/(?<=[.!?])\s+(?=[A-Z"“])/).map((x) => x.trim()).filter(Boolean);
}

/**
 * Replace figures and dates with unique placeholders so that unavoidable factual strings
 * ("fell to 3.1% in August from 3.6% in July") never count as copied prose. `tag` keeps
 * placeholders from matching across the two texts being compared.
 */
export function maskFacts(text: string, tag: string): string {
  let i = 0;
  return normalizeForMatch(text)
    .split(' ')
    .map((w) => (/\d/.test(w) || MONTHS.includes(w) || /^(monday|tuesday|wednesday|thursday|friday|saturday|sunday)$/.test(w) ? `#${tag}${i++}` : w))
    .join(' ');
}

/** Word n-gram shingles. */
export function shingles(text: string, n: number): Set<string> {
  const w = normalizeForMatch(text).split(' ').filter(Boolean);
  const out = new Set<string>();
  for (let i = 0; i + n <= w.length; i++) out.add(w.slice(i, i + n).join(' '));
  return out;
}

/** Longest run of consecutive words shared by both texts (case/punctuation-insensitive). */
export function longestCommonRun(a: string, b: string): { words: number; text: string } {
  const A = normalizeForMatch(a).split(' ').filter(Boolean);
  const B = normalizeForMatch(b).split(' ').filter(Boolean);
  if (!A.length || !B.length) return { words: 0, text: '' };
  const pos = new Map<string, number[]>();
  B.forEach((w, i) => { const l = pos.get(w); if (l) l.push(i); else pos.set(w, [i]); });
  let best = 0, bestEnd = 0;
  let prev = new Map<number, number>();
  for (let i = 0; i < A.length; i++) {
    const cur = new Map<number, number>();
    for (const j of pos.get(A[i]) ?? []) {
      const len = (prev.get(j - 1) ?? 0) + 1;
      cur.set(j, len);
      if (len > best) { best = len; bestEnd = i; }
    }
    prev = cur;
  }
  return { words: best, text: A.slice(bestEnd - best + 1, bestEnd + 1).join(' ') };
}

/* -------- Prompt-injection screening for scraped text -------- */
const INJECTION_PATTERNS: RegExp[] = [
  /ignore (all |any |the )?(previous|prior|above|earlier) (instructions|prompts?|rules)/i,
  /disregard (all |any |the )?(previous|prior|above|earlier)/i,
  /(you are|you're) (now )?(a|an|the) (new )?(assistant|ai|model|system|developer|admin)/i,
  /\bsystem prompt\b/i,
  /\b(reveal|print|show|leak) (your|the) (instructions|prompt|system|api key|secret)/i,
  /\bact as\b.{0,40}\b(dan|jailbreak|unrestricted)/i,
  /<\s*\/?\s*(system|assistant|instructions?)\s*>/i,
  /\[\s*(system|inst)\s*\]/i,
  /do not (mention|tell|reveal).{0,40}(user|reader|editor)/i,
  /(publish|write|include) (the following|this) (verbatim|exactly|as is)/i,
];

export function detectInjection(text: string): string[] {
  return INJECTION_PATTERNS.filter((re) => re.test(text)).map((re) => re.source.slice(0, 50));
}

/** Neutralise delimiters/markup in untrusted text so it cannot break out of the data block. */
export function neutralizeUntrusted(text: string): string {
  return text.replace(/<\/?\s*(source_article|system|assistant|user|instructions?)[^>]*>/gi, '[tag removed]').replace(/```/g, "'''");
}

export function languageGuess(text: string): string {
  const sample = ' ' + tokens(text.slice(0, 1500), { keepStop: true }).join(' ') + ' ';
  const en = [' the ', ' and ', ' of ', ' to ', ' in ', ' is ', ' for '].reduce((n, w) => n + (sample.split(w).length - 1), 0);
  const other = [' el ', ' la ', ' de ', ' que ', ' der ', ' die ', ' und ', ' le ', ' les ', ' des ', ' il ', ' di '].reduce((n, w) => n + (sample.split(w).length - 1), 0);
  return en >= other ? 'en' : 'other';
}
