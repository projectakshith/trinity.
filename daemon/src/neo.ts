import type { Config } from './config';

export interface Completion {
  text: string;
  model: string;
  tokensIn: number;
  tokensOut: number;
}

const MAX_OUTPUT_TOKENS = 900;

export async function complete(config: Config, system: string, user: string): Promise<Completion> {
  const groq = config.provider === 'groq' ? config.groq : undefined;
  const model = groq?.model ?? config.model;
  const url = groq ? 'https://api.groq.com/openai/v1/chat/completions' : `${config.neoUrl}/v1/chat/completions`;
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (groq) headers.authorization = `Bearer ${groq.apiKey}`;

  const body: Record<string, unknown> = {
    model,
    stream: false,
    temperature: 0.2,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
  };
  if (groq) {
    body.max_completion_tokens = MAX_OUTPUT_TOKENS;
    body.response_format = { type: 'json_object' };
    if (model.startsWith('openai/gpt-oss')) body.reasoning_effort = 'low';
  }

  const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body), signal: AbortSignal.timeout(90_000) });
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
