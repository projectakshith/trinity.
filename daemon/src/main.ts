import { timingSafeEqual } from 'node:crypto';
import { daemonToken, ensureHome, HOST, loadConfig, PORT } from './config';
import { buildDigest, cachedDigest } from './digest';
import { googleAuthUrl, googleCallback, googleLinked } from './sources/google';
import type { Digest } from './types';

ensureHome();
const config = loadConfig();
const token = daemonToken();
const ALLOWED_HOSTS = new Set([`${HOST}:${PORT}`, `localhost:${PORT}`]);
const ALLOWED_ORIGINS = new Set(['http://localhost:6070', 'http://127.0.0.1:6070']);

let inflight: Promise<Digest> | null = null;
let lastError: string | null = null;

function refresh(force = false): Promise<Digest> {
  if (inflight) return inflight;
  inflight = buildDigest(config, force)
    .then((d) => {
      lastError = null;
      console.log(`[trinityd] digest ${new Date(d.generatedAt).toLocaleTimeString()} · ${d.insights.length} insights · ${d.sources.map((s) => `${s.source}:${s.ok ? s.count : 'off'}`).join(' ')}`);
      return d;
    })
    .catch((err: Error) => {
      lastError = err.message;
      console.error(`[trinityd] digest failed: ${err.message}`);
      throw err;
    })
    .finally(() => {
      inflight = null;
    });
  return inflight;
}

function authorized(req: Request): boolean {
  const header = req.headers.get('authorization') ?? '';
  const given = Buffer.from(header.replace(/^Bearer\s+/iu, ''));
  const want = Buffer.from(token);
  return given.length === want.length && timingSafeEqual(given, want);
}

function cors(req: Request): Record<string, string> {
  const origin = req.headers.get('origin');
  return origin && ALLOWED_ORIGINS.has(origin)
    ? { 'access-control-allow-origin': origin, 'access-control-allow-headers': 'authorization, content-type', 'access-control-allow-methods': 'GET, POST' }
    : {};
}

function json(req: Request, body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...cors(req) } });
}

function page(title: string, body: string): Response {
  return new Response(
    `<!doctype html><meta charset="utf-8"><title>${title}</title><body style="font:16px/1.5 system-ui;max-width:520px;margin:15vh auto;padding:0 16px"><div style="font-size:28px">◈</div><h1 style="font-weight:500">${title}</h1><p>${body}</p></body>`,
    { headers: { 'content-type': 'text/html; charset=utf-8' } }
  );
}

function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/gu, (c) => `&#${c.charCodeAt(0)};`);
}

Bun.serve({
  hostname: HOST,
  port: PORT,
  idleTimeout: 120,
  async fetch(req) {
    const url = new URL(req.url);
    if (!ALLOWED_HOSTS.has(req.headers.get('host') ?? '')) return new Response('bad host', { status: 421 });
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(req) });

    if (url.pathname === '/health') return json(req, { ok: true });

    if (url.pathname === '/auth/google') {
      const target = googleAuthUrl(config);
      if (!target) return page('Google not configured', 'Add <code>google.clientId</code> and <code>google.clientSecret</code> to <code>~/.trinity/config.json</code>, then restart trinityd.');
      return Response.redirect(target, 302);
    }

    if (url.pathname === '/auth/google/callback') {
      const code = url.searchParams.get('code');
      const state = url.searchParams.get('state');
      if (!code || !state) return page('Sign-in cancelled', escapeHtml(url.searchParams.get('error') ?? 'No code returned.'));
      try {
        const email = await googleCallback(config, code, state);
        void refresh(true).catch(() => undefined);
        return page('Linked', `Trinity can now read mail and calendar for ${escapeHtml(email)}. You can close this tab.`);
      } catch (err) {
        return page('Sign-in failed', escapeHtml((err as Error).message));
      }
    }

    if (!authorized(req)) return json(req, { error: 'unauthorized' }, 401);

    if (url.pathname === '/digest' && req.method === 'GET') {
      const cached = cachedDigest();
      if (cached) return json(req, { digest: cached, refreshing: Boolean(inflight), error: lastError });
      try {
        return json(req, { digest: await refresh(), refreshing: false, error: null });
      } catch (err) {
        return json(req, { digest: null, refreshing: false, error: (err as Error).message }, 502);
      }
    }

    if (url.pathname === '/refresh' && req.method === 'POST') {
      try {
        return json(req, { digest: await refresh(url.searchParams.get('force') === '1'), error: null });
      } catch (err) {
        return json(req, { digest: cachedDigest(), error: (err as Error).message }, 502);
      }
    }

    if (url.pathname === '/status') {
      return json(req, { model: config.model, googleConfigured: Boolean(config.google), googleLinked: googleLinked(), refreshMinutes: config.refreshMinutes, lastError, digest: cachedDigest()?.sources ?? [] });
    }

    return json(req, { error: 'not found' }, 404);
  },
});

console.log(`[trinityd] listening on http://${HOST}:${PORT} · model ${config.model}`);
if (config.google && !googleLinked()) console.log(`[trinityd] link Google: open http://${HOST}:${PORT}/auth/google`);
void refresh().catch(() => undefined);
setInterval(() => void refresh().catch(() => undefined), config.refreshMinutes * 60_000);
