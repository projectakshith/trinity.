/*
 * Where Trinity's daemon lives and how to authenticate. Persisted per device; can arrive via a pairing URL
 * (?url=ws://…&token=…) which is stripped from the address bar once read.
 */

export interface DaemonLink {
  url: string;
  token: string;
}

const LINK_KEY = 'trinity.link';
const SESSION_KEY = 'trinity.session';

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string | null): void {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    /* Private mode or blocked storage: the app still works for this visit. */
  }
}

export function loadLink(): DaemonLink | null {
  try {
    const parsed = JSON.parse(read(LINK_KEY) ?? 'null') as Partial<DaemonLink> | null;
    return parsed?.url && parsed.token ? { url: parsed.url, token: parsed.token } : null;
  } catch {
    return null;
  }
}

export function saveLink(link: DaemonLink | null): void {
  write(LINK_KEY, link ? JSON.stringify(link) : null);
}

export function linkFromLocation(): DaemonLink | null {
  const params = new URLSearchParams(window.location.search || window.location.hash.slice(1));
  const url = params.get('url');
  const token = params.get('token');
  if (!url || !token) return null;
  window.history.replaceState(null, '', window.location.pathname);
  return { url, token };
}

export function defaultDaemonUrl(): string {
  const host = window.location.hostname && window.location.hostname !== 'localhost' ? window.location.hostname : '127.0.0.1';
  return `ws://${host}:7878`;
}

export function loadLastSession(): string | null {
  return read(SESSION_KEY);
}

export function saveLastSession(id: string | null): void {
  write(SESSION_KEY, id);
}
