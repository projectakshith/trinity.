import { createHash, randomBytes } from 'node:crypto';
import { HOST, PORT, readJson, writeJson, type Config } from '../config';
import type { SourceItem, SourceResult } from '../types';

const TOKEN_FILE = 'google.json';
const SCOPES = ['https://www.googleapis.com/auth/gmail.readonly', 'https://www.googleapis.com/auth/calendar.readonly'];
const REDIRECT = `http://${HOST}:${PORT}/auth/google/callback`;
const MAIL_QUERY = 'newer_than:2d -category:promotions -category:social -in:chats';
const MAX_MAILS = 20;
const MAX_CHARS = 280;

interface Tokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  email?: string;
}

const pending = new Map<string, { verifier: string; at: number }>();

function b64url(buf: Buffer): string {
  return buf.toString('base64url');
}

function accounts(): Tokens[] {
  const raw = readJson<Tokens | { accounts: Tokens[] }>(TOKEN_FILE);
  if (!raw) return [];
  return ('accounts' in raw ? raw.accounts : [raw]).filter((t) => t.refreshToken);
}

function save(tokens: Tokens): void {
  const rest = accounts().filter((t) => !tokens.email || t.email !== tokens.email);
  writeJson(TOKEN_FILE, { accounts: [...rest, tokens] });
}

export function googleLinked(): boolean {
  return accounts().length > 0;
}

export function googleAccounts(): string[] {
  return accounts().map((t) => t.email ?? 'unknown');
}

export function googleAuthUrl(config: Config): string | null {
  if (!config.google) return null;
  const state = b64url(randomBytes(16));
  const verifier = b64url(randomBytes(32));
  pending.set(state, { verifier, at: Date.now() });
  const params = new URLSearchParams({
    client_id: config.google.clientId,
    redirect_uri: REDIRECT,
    response_type: 'code',
    scope: SCOPES.join(' '),
    access_type: 'offline',
    prompt: 'consent select_account',
    state,
    code_challenge: b64url(createHash('sha256').update(verifier).digest()),
    code_challenge_method: 'S256',
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
}

async function tokenRequest(config: Config, body: Record<string, string>): Promise<{ access_token: string; refresh_token?: string; expires_in: number }> {
  if (!config.google) throw new Error('Google client not configured');
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: config.google.clientId, client_secret: config.google.clientSecret, ...body }),
  });
  if (!res.ok) throw new Error(`Google token exchange failed (${res.status}): ${await res.text()}`);
  return (await res.json()) as { access_token: string; refresh_token?: string; expires_in: number };
}

export async function googleCallback(config: Config, code: string, state: string): Promise<string> {
  const entry = pending.get(state);
  pending.delete(state);
  if (!entry || Date.now() - entry.at > 10 * 60_000) throw new Error('Sign-in expired, start again');
  const t = await tokenRequest(config, { code, code_verifier: entry.verifier, grant_type: 'authorization_code', redirect_uri: REDIRECT });
  if (!t.refresh_token) throw new Error('Google returned no refresh token');
  const tokens: Tokens = { accessToken: t.access_token, refreshToken: t.refresh_token, expiresAt: Date.now() + t.expires_in * 1000 };
  const profile = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/profile', { headers: { authorization: `Bearer ${tokens.accessToken}` } });
  if (profile.ok) tokens.email = ((await profile.json()) as { emailAddress?: string }).emailAddress;
  save(tokens);
  return tokens.email ?? 'your Google account';
}

async function accessToken(config: Config, tokens: Tokens): Promise<string> {
  if (tokens.expiresAt - 60_000 > Date.now()) return tokens.accessToken;
  const t = await tokenRequest(config, { refresh_token: tokens.refreshToken, grant_type: 'refresh_token' });
  const next = { ...tokens, accessToken: t.access_token, expiresAt: Date.now() + t.expires_in * 1000 };
  save(next);
  Object.assign(tokens, next);
  return next.accessToken;
}

async function api<T>(config: Config, tokens: Tokens, url: string): Promise<T> {
  const res = await fetch(url, { headers: { authorization: `Bearer ${await accessToken(config, tokens)}` } });
  if (!res.ok) throw new Error(`${new URL(url).hostname} ${res.status}`);
  return (await res.json()) as T;
}

function clip(text: string): string {
  const flat = text.replace(/\s+/gu, ' ').trim();
  return flat.length > MAX_CHARS ? `${flat.slice(0, MAX_CHARS - 1)}…` : flat;
}

function decodeEntities(text: string): string {
  return text.replace(/&#39;/gu, "'").replace(/&quot;/gu, '"').replace(/&amp;/gu, '&').replace(/&lt;/gu, '<').replace(/&gt;/gu, '>');
}

interface GmailMessage {
  id: string;
  threadId: string;
  labelIds?: string[];
  snippet?: string;
  internalDate?: string;
  payload?: { headers?: { name: string; value: string }[] };
}

async function each(config: Config, source: SourceResult['source'], read: (tokens: Tokens, label: string) => Promise<SourceItem[]>): Promise<SourceResult> {
  const linked = accounts();
  const many = linked.length > 1;
  const results = await Promise.allSettled(linked.map((t) => read(t, many ? ` (${t.email ?? 'account'})` : '')));
  const items = results.flatMap((r) => (r.status === 'fulfilled' ? r.value : []));
  const failed = results.flatMap((r, i) => (r.status === 'rejected' ? [`${linked[i].email ?? 'account'}: ${(r.reason as Error).message}`] : []));
  if (failed.length === results.length) return { source, ok: false, error: failed.join('; '), items: [] };
  return { source, ok: true, error: failed.length ? failed.join('; ') : undefined, items };
}

export async function readGmail(config: Config): Promise<SourceResult> {
  if (!config.google) return { source: 'mail', ok: false, error: 'Add a Google OAuth client to ~/.trinity/config.json', items: [] };
  if (!googleLinked()) return { source: 'mail', ok: false, error: `Sign in at http://${HOST}:${PORT}/auth/google`, items: [] };
  return each(config, 'mail', async (tokens, label) => {
    const list = await api<{ messages?: { id: string }[] }>(
      config,
      tokens,
      `https://gmail.googleapis.com/gmail/v1/users/me/messages?${new URLSearchParams({ q: MAIL_QUERY, maxResults: String(MAX_MAILS) })}`
    );
    const ids = (list.messages ?? []).map((m) => m.id);
    const messages = await Promise.all(
      ids.map((id) =>
        api<GmailMessage>(
          config,
          tokens,
          `https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=List-Id&metadataHeaders=List-Unsubscribe&metadataHeaders=Precedence`
        )
      )
    );
    return messages.map((m): SourceItem => {
      const header = (name: string) => m.payload?.headers?.find((h) => h.name.toLowerCase() === name)?.value ?? '';
      const from = header('from').replace(/\s*<[^>]+>/u, '').replace(/"/gu, '') || header('from');
      return {
        source: 'mail',
        ref: `mail:${m.id}`,
        at: Number(m.internalDate ?? Date.now()),
        from,
        title: `${header('subject') || '(no subject)'}${label}`,
        text: clip(decodeEntities(m.snippet ?? '')),
        unread: m.labelIds?.includes('UNREAD') ?? false,
        address: /<([^>]+)>/u.exec(header('from'))?.[1] ?? header('from'),
        folders: (m.labelIds ?? []).filter((l) => l.startsWith('Label_')).length ? ['your label'] : [],
        bulk: Boolean(header('list-id') || header('list-unsubscribe') || /bulk|list/iu.test(header('precedence'))),
        url: `https://mail.google.com/mail/?authuser=${encodeURIComponent(tokens.email ?? '')}#all/${m.threadId}`,
      };
    });
  });
}

interface CalendarEvent {
  id: string;
  summary?: string;
  location?: string;
  htmlLink?: string;
  start?: { dateTime?: string; date?: string };
  end?: { dateTime?: string; date?: string };
  attendees?: { email: string; self?: boolean; responseStatus?: string }[];
}

export async function readCalendar(config: Config): Promise<SourceResult> {
  if (!config.google || !googleLinked()) return { source: 'calendar', ok: false, error: 'Google not linked', items: [] };
  return each(config, 'calendar', async (tokens, label) => {
    const now = new Date();
    const end = new Date(now.getTime() + 36 * 3600_000);
    const res = await api<{ items?: CalendarEvent[] }>(
      config,
      tokens,
      `https://www.googleapis.com/calendar/v3/calendars/primary/events?${new URLSearchParams({
        timeMin: now.toISOString(),
        timeMax: end.toISOString(),
        singleEvents: 'true',
        orderBy: 'startTime',
        maxResults: '15',
      })}`
    );
    return (res.items ?? []).map((e): SourceItem => {
      const startRaw = e.start?.dateTime ?? e.start?.date ?? now.toISOString();
      const start = new Date(startRaw);
      const when = e.start?.dateTime
        ? start.toLocaleString('en-GB', { weekday: 'short', hour: '2-digit', minute: '2-digit' })
        : `${start.toLocaleDateString('en-GB', { weekday: 'short' })} all day`;
      const mine = e.attendees?.find((a) => a.self)?.responseStatus;
      return {
        source: 'calendar',
        ref: `cal:${e.id}`,
        at: start.getTime(),
        from: 'calendar',
        title: `${e.summary ?? '(untitled event)'}${label}`,
        text: [when, e.location, mine && mine !== 'accepted' ? `you: ${mine}` : ''].filter(Boolean).join(' · '),
        url: e.htmlLink,
      };
    });
  });
}
