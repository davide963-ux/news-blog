import { type Settings, resolveAiKey } from '@/lib/settings';
import { PermanentError } from '../queue';
import { sleep } from '@/lib/utils';

export interface LlmRequest { system: string; user: string; model: string; maxTokens: number; temperature: number; json?: boolean }
export interface LlmResponse { text: string; inputTokens: number; outputTokens: number }
export interface LlmClient {
  complete(req: LlmRequest): Promise<LlmResponse>;
  embed(texts: string[], model: string): Promise<number[][]>;
}

let override: LlmClient | null = null;
/** Test hook: inject a deterministic client. */
export function setLlmOverride(c: LlmClient | null) { override = c; }

async function postJson(url: string, headers: Record<string, string>, body: unknown, tries = 3): Promise<any> {
  let lastErr: unknown;
  for (let i = 0; i < tries; i++) {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 110_000);
    try {
      const res = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body), signal: ctl.signal });
      const text = await res.text();
      if (res.ok) return JSON.parse(text);
      const msg = `AI API ${res.status}: ${text.slice(0, 400)}`;
      if (res.status === 429 || res.status >= 500 || res.status === 408) { lastErr = new Error(msg); await sleep(1500 * 2 ** i); continue; }
      throw new PermanentError(msg);
    } catch (e) {
      if (e instanceof PermanentError) throw e;
      lastErr = e;
      await sleep(1000 * 2 ** i);
    } finally { clearTimeout(timer); }
  }
  throw lastErr instanceof Error ? lastErr : new Error('AI request failed');
}

const noTemperature = (model: string) => /^(o\d|gpt-5)/i.test(model);

function anthropicClient(s: Settings, key: string): LlmClient {
  const base = (s.ai.baseUrl || 'https://api.anthropic.com').replace(/\/+$/, '');
  return {
    async complete(r) {
      const j = await postJson(`${base}/v1/messages`, { 'x-api-key': key, 'anthropic-version': '2023-06-01' }, {
        model: r.model, max_tokens: r.maxTokens, temperature: r.temperature, system: r.system,
        messages: [{ role: 'user', content: r.user }],
      });
      const text = (j.content ?? []).filter((c: any) => c.type === 'text').map((c: any) => c.text).join('');
      return { text, inputTokens: j.usage?.input_tokens ?? 0, outputTokens: j.usage?.output_tokens ?? 0 };
    },
    async embed() { throw new PermanentError('Anthropic has no embeddings endpoint; configure an OpenAI-compatible embeddings provider'); },
  };
}

function openaiClient(s: Settings, key: string): LlmClient {
  const base = (s.ai.baseUrl || 'https://api.openai.com/v1').replace(/\/+$/, '');
  const official = s.ai.provider === 'openai';
  return {
    async complete(r) {
      const body: Record<string, unknown> = {
        model: r.model,
        messages: [{ role: 'system', content: r.system }, { role: 'user', content: r.user }],
        ...(official ? { max_completion_tokens: r.maxTokens } : { max_tokens: r.maxTokens }),
        ...(noTemperature(r.model) ? {} : { temperature: r.temperature }),
        ...(r.json && official ? { response_format: { type: 'json_object' } } : {}),
      };
      const j = await postJson(`${base}/chat/completions`, { authorization: `Bearer ${key}` }, body);
      return { text: j.choices?.[0]?.message?.content ?? '', inputTokens: j.usage?.prompt_tokens ?? 0, outputTokens: j.usage?.completion_tokens ?? 0 };
    },
    async embed(texts, model) {
      const eb = (s.ai.embeddings.baseUrl || base).replace(/\/+$/, '');
      const j = await postJson(`${eb}/embeddings`, { authorization: `Bearer ${key}` }, { model, input: texts });
      return (j.data ?? []).map((d: any) => d.embedding as number[]);
    },
  };
}

export function getLlm(s: Settings): LlmClient {
  if (override) return override;
  const key = resolveAiKey(s);
  if (!key) throw new PermanentError('No AI API key configured (set ANTHROPIC_API_KEY / OPENAI_API_KEY, or save one in Settings → AI)');
  return s.ai.provider === 'anthropic' ? anthropicClient(s, key) : openaiClient(s, key);
}

export function hasAiKey(s: Settings): boolean {
  return !!override || !!resolveAiKey(s);
}

/** Embeddings use an OpenAI-compatible endpoint, which may differ from the text provider. */
export function getEmbedder(s: Settings): LlmClient | null {
  if (override) return override;
  if (!s.ai.embeddings.enabled) return null;
  const key = resolveAiKey({ ...s, ai: { ...s.ai, provider: s.ai.provider === 'anthropic' ? 'openai' : s.ai.provider } });
  const k = key || process.env.OPENAI_API_KEY || '';
  if (!k) return null;
  return openaiClient({ ...s, ai: { ...s.ai, provider: 'openai-compatible', baseUrl: s.ai.embeddings.baseUrl || 'https://api.openai.com/v1' } }, k);
}

export function extractJson(text: string): unknown {
  const t = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '');
  try { return JSON.parse(t); } catch { /* fall through */ }
  const start = t.indexOf('{');
  const end = t.lastIndexOf('}');
  if (start >= 0 && end > start) return JSON.parse(t.slice(start, end + 1));
  throw new Error('Model did not return JSON');
}
