import { z } from 'zod';
import { db } from './db';
import { encrypt, decrypt } from './crypto';
import { env } from './env';

/**
 * All runtime configuration lives in the database (editable from /admin/settings).
 * Secrets (API keys) are encrypted at rest with APP_ENCRYPTION_KEY; env vars are the preferred source.
 */
export const DEFAULT_SYSTEM_PROMPT_EXTRA = '';
export const DEFAULT_STYLE_GUIDE =
  'Neutral, precise wire-style journalism with a clear inverted pyramid: lead with the most newsworthy confirmed fact, then context and background. Short paragraphs (1-3 sentences). Active voice. No clickbait, no hype, no editorialising. Use plain, natural English; vary sentence length.';

export const settingsSchema = z.object({
  site: z.object({
    name: z.string().min(1).default('The Meridian Post'),
    tagline: z.string().default('Independent reporting, around the clock'),
    description: z.string().default('Breaking news and analysis on world affairs, politics, business, technology, science, health and sport.'),
    contactEmail: z.string().default(''),
    twitterHandle: z.string().default(''),
    aiDisclosure: z.string().default('Stories on this site are drafted with the assistance of AI from reported facts in the cited sources, and checked by automated and editorial processes. Always refer to the linked original sources.'),
  }).default({}),
  automation: z.object({
    monitoringEnabled: z.boolean().default(true),
    autoPublish: z.boolean().default(true),
    defaultIntervalMinutes: z.number().int().min(5).max(1440).default(5),
    dailyPublishLimit: z.number().int().min(0).max(1000).default(80),
    hourlyPublishLimit: z.number().int().min(0).max(200).default(12),
    jobsPerTickConcurrency: z.number().int().min(1).max(8).default(3),
    breakingWindowMinutes: z.number().int().min(15).max(720).default(180),
    maxGenerationAttempts: z.number().int().min(1).max(5).default(2),
  }).default({}),
  ai: z.object({
    provider: z.enum(['anthropic', 'openai', 'openai-compatible']).default('anthropic'),
    model: z.string().default('claude-sonnet-5-5'),
    verifierModel: z.string().default('claude-haiku-5-5'),
    baseUrl: z.string().default(''),
    apiKeyEnc: z.string().default(''),
    temperature: z.number().min(0).max(1.5).default(0.4),
    maxOutputTokens: z.number().int().min(500).max(16000).default(3500),
    styleGuide: z.string().default(DEFAULT_STYLE_GUIDE),
    extraInstructions: z.string().default(DEFAULT_SYSTEM_PROMPT_EXTRA),
    verifyWithAi: z.boolean().default(true),
    inputPricePerMTok: z.number().min(0).default(3),
    outputPricePerMTok: z.number().min(0).default(15),
    verifierInputPricePerMTok: z.number().min(0).default(1),
    verifierOutputPricePerMTok: z.number().min(0).default(5),
    embeddings: z.object({
      enabled: z.boolean().default(false),
      model: z.string().default('text-embedding-3-small'),
      baseUrl: z.string().default(''),
      similarityThreshold: z.number().min(0.5).max(0.99).default(0.86),
    }).default({}),
  }).default({}),
  quality: z.object({
    minSourceChars: z.number().int().min(0).default(350),
    minWords: z.number().int().min(50).default(160),
    maxWords: z.number().int().min(150).default(650),
    maxVerbatimRunWords: z.number().int().min(4).default(10),
    maxOverlapRatio: z.number().min(0.01).max(0.9).default(0.12),
    duplicateThreshold: z.number().min(0.3).max(0.99).default(0.42),
    duplicateWindowHours: z.number().int().min(6).max(336).default(72),
    unsupportedNameRatio: z.number().min(0).max(1).default(0.12),
    requireAiVerification: z.boolean().default(true),
  }).default({}),
  sensitive: z.object({
    policy: z.enum(['corroborate', 'review']).default('corroborate'),
    minIndependentSources: z.number().int().min(2).max(6).default(2),
    extraKeywords: z.string().default(''),
  }).default({}),
  images: z.object({
    stockProvider: z.enum(['none', 'pexels', 'unsplash']).default('pexels'),
    aiIllustrations: z.enum(['off', 'fallback']).default('off'),
    aiImageModel: z.string().default('gpt-image-1'),
    aiImageBaseUrl: z.string().default(''),
    useLicensedSourceImages: z.boolean().default(true),
  }).default({}),
  alerts: z.object({
    webhookUrl: z.string().default(''),
    sourceFailureThreshold: z.number().int().min(1).default(3),
    notifyOnReviewQueue: z.boolean().default(false),
  }).default({}),
});

export type Settings = z.infer<typeof settingsSchema>;
const KEY = 'config';
let cache: { at: number; value: Settings } | null = null;

export async function getSettings(fresh = false): Promise<Settings> {
  if (!fresh && cache && Date.now() - cache.at < 15_000) return cache.value;
  let stored: unknown = {};
  try {
    stored = (await db.setting.findUnique({ where: { key: KEY } }))?.value ?? {};
  } catch {
    /* database temporarily unavailable: fall back to defaults/cache */
    if (cache) return cache.value;
  }
  const parsed = settingsSchema.safeParse(stored);
  const value = parsed.success ? parsed.data : settingsSchema.parse({});
  cache = { at: Date.now(), value };
  return value;
}

function mergeDeep<T extends Record<string, unknown>>(base: T, patch: Record<string, unknown>): T {
  const out: Record<string, unknown> = { ...base };
  for (const [k, v] of Object.entries(patch)) {
    if (v && typeof v === 'object' && !Array.isArray(v) && typeof out[k] === 'object' && out[k] !== null) {
      out[k] = mergeDeep(out[k] as Record<string, unknown>, v as Record<string, unknown>);
    } else if (v !== undefined) out[k] = v;
  }
  return out as T;
}

export async function updateSettings(patch: Record<string, unknown>): Promise<Settings> {
  const current = await getSettings(true);
  const next = settingsSchema.parse(mergeDeep(current as unknown as Record<string, unknown>, patch));
  await db.setting.upsert({ where: { key: KEY }, create: { key: KEY, value: next as object }, update: { value: next as object } });
  cache = { at: Date.now(), value: next };
  return next;
}

/** Resolve the AI API key: DB (encrypted) overrides env. Returns '' if unset. */
export function resolveAiKey(s: Settings): string {
  if (s.ai.apiKeyEnc) {
    try { return decrypt(s.ai.apiKeyEnc); } catch { /* wrong encryption key: ignore */ }
  }
  const k = env.aiApiKeyEnv;
  if (k.generic) return k.generic;
  return s.ai.provider === 'anthropic' ? k.anthropic : k.openai;
}

export const encryptSecret = encrypt;
