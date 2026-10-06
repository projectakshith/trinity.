import type { Config } from './config';

export interface Completion {
  text: string;
  model: string;
  tokensIn: number;
  tokensOut: number;
}

export interface Turn {
  role: 'user' | 'assistant';
  content: string;
}

const MAX_OUTPUT_TOKENS = 1600;
const GROQ_FALLBACKS = ['openai/gpt-oss-120b', 'openai/gpt-oss-20b', 'qwen/qwen3.8-27b'];

export async function complete(config: Config, system: string, user: string | Turn[], temperature = 0.2): Promise<Completion> {
  const groq = config.provider === 'groq' ? config.groq : undefined;
  if (!groq) return call(config, config.model, system, user, temperature);
  const models = [groq.model, ...GROQ_FALLBACKS.filter((m) => m !== groq.model)];
  for (const [i, model] of models.entries()) {
    try {
      return await call(config, model, system, user, temperature);
    } catch (err) {
      if (!(err instanceof RateLimited) || i === models.length - 1) throw err;
    }
  }
  throw new Error('unreachable');
}

class RateLimited extends Error {}

async function call(config: Config, model: string, system: string, user: string | Turn[], temperature: number): Promise<Completion> {
  const groq = config.provider === 'groq' ? config.groq : undefined;
  const url = groq ? 'https://api.groq.com/openai/v1/chat/completions' : `${config.neoUrl}/v1/chat/completions`;
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (groq) headers.authorization = `Bearer ${groq.apiKey}`;

  const body: Record<string, unknown> = {
    model,
    stream: false,
    temperature,
    messages: [{ role: 'system', content: system }, ...(typeof user === 'string' ? [{ role: 'user', content: user }] : user)],
  };
  if (groq) {
    body.max_completion_tokens = MAX_OUTPUT_TOKENS;
    body.response_format = { type: 'json_object' };
    if (model.startsWith('openai/gpt-oss')) body.reasoning_effort = 'low';
    else body.reasoning_format = 'hidden';
  }

  const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body), signal: AbortSignal.timeout(90_000) });
  if (res.status === 429) throw new RateLimited(`${groq ? 'groq' : 'neo'} ${model} rate limited: ${(await res.text()).slice(0, 160)}`);
  if (!res.ok) throw new Error(`${groq ? 'groq' : 'neo'} ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const json = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
    usage?: { prompt_tokens?: number; completion_tokens?: number };
  };
  return {
    text: json.choices?.[0]?.message?.content ?? '',
    model,
    tokensIn: json.usage?.prompt_tokens ?? 0,
    tokensOut: json.usage?.completion_tokens ?? 0,
  };
}
