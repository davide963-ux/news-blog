import { db } from '@/lib/db';
import type { Settings } from '@/lib/settings';
import { getLlm, extractJson, type LlmClient } from './provider';
import { articleOutputSchema, verifierSchema, type ArticleOutput, type VerifierOutput } from './schema';
import { buildSystemPrompt, buildUserPrompt, buildVerifierPrompt, VERIFIER_SYSTEM, type SourceMaterial } from './prompts';

export function cost(s: Settings, kind: 'generate' | 'verify', inTok: number, outTok: number): number {
  const [pi, po] = kind === 'verify' ? [s.ai.verifierInputPricePerMTok, s.ai.verifierOutputPricePerMTok] : [s.ai.inputPricePerMTok, s.ai.outputPricePerMTok];
  return (inTok * pi + outTok * po) / 1_000_000;
}

async function record(s: Settings, kind: 'generate' | 'verify', model: string, itemId: string | undefined, r: { inputTokens: number; outputTokens: number }, ms: number, ok: boolean, error?: string) {
  await db.generationRun.create({
    data: { itemId, kind, provider: s.ai.provider, model, promptTokens: r.inputTokens, completionTokens: r.outputTokens, costUsd: cost(s, kind, r.inputTokens, r.outputTokens), durationMs: ms, ok, error: error?.slice(0, 500) },
  }).catch(() => undefined);
}

export interface GenerateInput {
  settings: Settings;
  itemId?: string;
  primary: SourceMaterial;
  extra?: SourceMaterial[];
  stricterOriginality?: boolean;
  retryNote?: string;
  llm?: LlmClient;
}

/** Generate the article JSON. One automatic repair attempt if the model returns invalid output. */
export async function generateArticle(inp: GenerateInput): Promise<ArticleOutput> {
  const s = inp.settings;
  const llm = inp.llm ?? getLlm(s);
  const system = buildSystemPrompt(s, { stricterOriginality: inp.stricterOriginality });
  let user = buildUserPrompt(s, inp.primary, inp.extra, inp.retryNote);
  let lastError = '';
  for (let attempt = 0; attempt < 2; attempt++) {
    const t0 = Date.now();
    const r = await llm.complete({ system, user, model: s.ai.model, maxTokens: s.ai.maxOutputTokens, temperature: s.ai.temperature, json: true });
    try {
      const parsed = articleOutputSchema.parse(extractJson(r.text));
      await record(s, 'generate', s.ai.model, inp.itemId, r, Date.now() - t0, true);
      return parsed;
    } catch (e) {
      lastError = e instanceof Error ? e.message.slice(0, 600) : String(e);
      await record(s, 'generate', s.ai.model, inp.itemId, r, Date.now() - t0, false, lastError);
      user = buildUserPrompt(s, inp.primary, inp.extra, `Your previous reply was rejected: ${lastError}. Reply with ONE valid JSON object matching the schema exactly.`);
    }
  }
  throw new Error(`AI output invalid after retry: ${lastError}`);
}

export async function verifyArticle(s: Settings, source: string, title: string, body: string, itemId?: string, llm?: LlmClient): Promise<VerifierOutput> {
  const client = llm ?? getLlm(s);
  const t0 = Date.now();
  const r = await client.complete({ system: VERIFIER_SYSTEM, user: buildVerifierPrompt(source, title, body), model: s.ai.verifierModel || s.ai.model, maxTokens: 1500, temperature: 0, json: true });
  try {
    const out = verifierSchema.parse(extractJson(r.text));
    await record(s, 'verify', s.ai.verifierModel, itemId, r, Date.now() - t0, true);
    return out;
  } catch (e) {
    await record(s, 'verify', s.ai.verifierModel, itemId, r, Date.now() - t0, false, String(e));
    throw e;
  }
}
