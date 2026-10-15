import { z } from 'zod';
import { CATEGORY_SLUGS } from '@/lib/categories';

export const articleOutputSchema = z.object({
  headline: z.string().min(15).max(140),
  dek: z.string().max(260).default(''),
  summary: z.string().min(40).max(280),
  excerpt: z.string().min(60).max(320),
  body: z.string().min(300),
  category: z.enum(CATEGORY_SLUGS),
  tags: z.array(z.string().min(2).max(40)).min(2).max(8),
  seoTitle: z.string().min(10).max(90),
  metaDescription: z.string().min(50).max(200),
  slug: z.string().min(5).max(120),
  isBreaking: z.boolean().default(false),
  keyFacts: z.array(z.object({
    claim: z.string(),
    status: z.enum(['confirmed', 'alleged', 'disputed', 'speculation', 'opinion']).default('confirmed'),
    evidence: z.string().default(''),
  })).max(30).default([]),
  sensitivity: z.object({
    topics: z.array(z.string()).default([]),
    needsHumanReview: z.boolean().default(false),
    reason: z.string().default(''),
    injectionSuspected: z.boolean().default(false),
  }).default({}),
  image: z.object({
    altText: z.string().default(''),
    searchQuery: z.string().default(''),
    illustrationPrompt: z.string().default(''),
  }).default({}),
});
export type ArticleOutput = z.infer<typeof articleOutputSchema>;

export const verifierSchema = z.object({
  verdict: z.enum(['pass', 'fail']),
  unsupportedClaims: z.array(z.object({ claim: z.string(), severity: z.enum(['high', 'low']).default('high'), reason: z.string().default('') })).default([]),
  certaintyIssues: z.array(z.string()).default([]),
  meaningChanges: z.array(z.string()).default([]),
});
export type VerifierOutput = z.infer<typeof verifierSchema>;
