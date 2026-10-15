import type { Settings } from '@/lib/settings';

const BUCKETS: Record<string, RegExp> = {
  politics: /\b(election|elections|vote|voters|ballot|campaign|candidate|parliament|congress|senate|prime minister|president|minister|government|coalition|referendum|impeach\w*|sanction\w*|legislation|lawmakers?)\b/i,
  crime: /\b(arrest\w*|murder\w*|homicide|police|suspect\w*|charged|indict\w*|trial|lawsuit|sued|alleg\w+|accused|shooting|stabbing|assault\w*|abuse|fraud|convicted|sentenced|kidnap\w*|manslaughter|investigation into)\b/i,
  health: /\b(cancer|outbreak|epidemic|pandemic|vaccine\w*|virus|disease|infection|clinical trial|treatment|drug approval|fda|who warns|medical|diagnos\w+|mortality|overdose)\b/i,
  conflict: /\b(war|airstrike\w*|missile\w*|troops|ceasefire|terror\w*|hostage\w*|bombing|military offensive|invasion|casualt\w+|killed in|attack on|shelling|insurgen\w+|coup)\b/i,
  disaster: /\b(earthquake|tsunami|hurricane|wildfire|flood\w*|evacuat\w+|plane crash|explosion|collapse[sd]?)\b/i,
};

export interface Sensitivity { level: 0 | 1 | 2; topics: string[] }

export function classifySensitivity(opts: { settings: Settings; title: string; leadText: string; aiTopics: string[]; categorySensitive: boolean; isBreaking: boolean }): Sensitivity {
  const hay = `${opts.title}\n${opts.leadText.slice(0, 500)}`;
  const topics = new Set<string>();
  for (const [name, re] of Object.entries(BUCKETS)) if (re.test(hay)) topics.add(name);
  for (const t of opts.aiTopics) {
    const k = t.toLowerCase();
    if (/election|politic|crime|allegation|health|conflict|war|legal|terror|disaster/.test(k)) topics.add(k);
  }
  const extra = opts.settings.sensitive.extraKeywords.split(',').map((x) => x.trim()).filter(Boolean);
  for (const kw of extra) if (hay.toLowerCase().includes(kw.toLowerCase())) topics.add(`custom:${kw}`);
  let level: 0 | 1 | 2 = 0;
  if (topics.size > 0 || opts.categorySensitive) level = 2;
  else if (opts.isBreaking) level = 1;
  return { level, topics: [...topics] };
}
