import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';

export const HOME = join(homedir(), '.trinity');
export const PORT = Number(process.env.TRINITY_PORT ?? 7979);
export const HOST = '127.0.0.1';

export interface Config {
  model: string;
  neoUrl: string;
  refreshMinutes: number;
  ownerName: string;
  google?: { clientId: string; clientSecret: string };
  whatsappDb: string;
}

const DEFAULTS: Config = {
  model: 'gemini-3.8-flash-high',
  neoUrl: 'http://127.0.0.1:8787',
  refreshMinutes: 15,
  ownerName: 'Akshith',
  whatsappDb: join(homedir(), 'Library/Group Containers/group.net.whatsapp.WhatsApp.shared/ChatStorage.sqlite'),
};

export function ensureHome(): void {
  if (!existsSync(HOME)) mkdirSync(HOME, { recursive: true, mode: 0o700 });
}

export function readJson<T>(name: string): T | null {
  try {
    return JSON.parse(readFileSync(join(HOME, name), 'utf8')) as T;
  } catch {
    return null;
  }
}

export function writeJson(name: string, value: unknown): void {
  ensureHome();
  const path = join(HOME, name);
  writeFileSync(path, JSON.stringify(value, null, 2), { mode: 0o600 });
  chmodSync(path, 0o600);
}

export function loadConfig(): Config {
  const user = readJson<Partial<Config>>('config.json') ?? {};
  if (!readJson('config.json')) writeJson('config.json', { model: DEFAULTS.model, refreshMinutes: DEFAULTS.refreshMinutes, google: { clientId: '', clientSecret: '' } });
  return {
    ...DEFAULTS,
    ...user,
    model: process.env.TRINITY_MODEL ?? user.model ?? DEFAULTS.model,
    google: user.google?.clientId && user.google.clientSecret ? user.google : undefined,
  };
}

export function daemonToken(): string {
  const existing = readJson<{ token?: string }>('daemon.json');
  if (existing?.token) {
    writeJson('daemon.json', { url: `http://${HOST}:${PORT}`, token: existing.token });
    return existing.token;
  }
  const token = randomBytes(24).toString('base64url');
  writeJson('daemon.json', { url: `http://${HOST}:${PORT}`, token });
  return token;
}
