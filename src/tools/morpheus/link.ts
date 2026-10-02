import { readStorage, writeStorage } from '@/lib/storage';

export interface DaemonLink {
  url: string;
  token: string;
}

const LINK_KEY = 'trinity.link';
const SESSION_KEY = 'trinity.session';

export function loadLink(): DaemonLink | null {
  try {
    const parsed = JSON.parse(readStorage(LINK_KEY) ?? 'null') as Partial<DaemonLink> | null;
    return parsed?.url && parsed.token ? { url: parsed.url, token: parsed.token } : null;
  } catch {
    return null;
  }
}

export function saveLink(link: DaemonLink | null): void {
  writeStorage(LINK_KEY, link ? JSON.stringify(link) : null);
}

export function linkFromLocation(): DaemonLink | null {
  const params = new URLSearchParams(window.location.search);
  const url = params.get('url');
  const token = params.get('token');
  if (!url || !token) return null;
  params.delete('url');
  params.delete('token');
  const rest = params.toString();
  window.history.replaceState(window.history.state, '', `${window.location.pathname}${rest ? `?${rest}` : ''}`);
  return { url, token };
}

export function defaultDaemonUrl(): string {
  const host = window.location.hostname && window.location.hostname !== 'localhost' ? window.location.hostname : '127.0.0.1';
  return `ws://${host}:7878`;
}

export function loadLastSession(): string | null {
  return readStorage(SESSION_KEY);
}

export function saveLastSession(id: string | null): void {
  writeStorage(SESSION_KEY, id);
}
