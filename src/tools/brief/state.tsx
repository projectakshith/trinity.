'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Capacitor } from '@capacitor/core';

export interface Insight {
  id: string;
  source: string;
  priority: 1 | 2 | 3;
  title: string;
  detail: string;
  from?: string;
  chat?: string;
  group?: boolean;
  url?: string;
}

export interface SourceState {
  source: string;
  ok: boolean;
  error?: string;
  count: number;
}

export interface Upcoming {
  id: string;
  what: string;
  when: string;
  whenText: string;
  who?: string;
  chat?: string;
  source: string;
  status?: 'pending' | 'remind' | 'skip';
}

export interface Digest {
  generatedAt: number;
  headline: string;
  summary: string;
  insights: Insight[];
  upcoming?: Upcoming[];
  sources: SourceState[];
}

interface BriefState {
  link: BriefLink | null;
  connect: (link: BriefLink) => void;
  digest: Digest | null;
  error: string | null;
  refreshing: boolean;
  reachable: boolean;
  refresh: () => void;
  decide: (id: string, status: 'remind' | 'skip') => void;
}

export interface BriefLink {
  url: string;
  token: string;
}

const LINK_KEY = 'trinity.brief.link';

const POLL_MS = 60_000;

export const BRIEF_HREF = '/brief/';

const BriefContext = createContext<BriefState | null>(null);

export function useBrief(): BriefState {
  const state = useContext(BriefContext);
  if (!state) throw new Error('useBrief outside BriefProvider');
  return state;
}

function localDaemonUrl(): string {
  const host = window.location.hostname === 'localhost' ? 'localhost' : '127.0.0.1';
  return `http://${host}:7979`;
}

export function BriefProvider({ children }: { children: ReactNode }) {
  const [link, setLink] = useState<BriefLink | null>(null);
  const [ready, setReady] = useState(false);
  const [digest, setDigest] = useState<Digest | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [reachable, setReachable] = useState(true);

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(LINK_KEY) ?? 'null') as BriefLink | null;
      if (saved?.url && saved.token) setLink(saved);
      else if (!Capacitor.isNativePlatform()) setLink({ url: localDaemonUrl(), token: '' });
    } catch {
      if (!Capacitor.isNativePlatform()) setLink({ url: localDaemonUrl(), token: '' });
    }
    setReady(true);
  }, []);

  const connect = useCallback((next: BriefLink) => {
    const value = { url: next.url.trim().replace(/\/+$/u, ''), token: next.token.trim() };
    localStorage.setItem(LINK_KEY, JSON.stringify(value));
    setLink(value);
  }, []);

  const load = useCallback(async (path: string, method: 'GET' | 'POST', payload?: unknown) => {
    if (!link) return;
    try {
      const headers: Record<string, string> = {};
      if (link.token) headers.authorization = `Bearer ${link.token}`;
      if (payload) headers['content-type'] = 'application/json';
      const res = await fetch(`${link.url}${path}`, { method, headers, ...(payload ? { body: JSON.stringify(payload) } : {}) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const body = (await res.json()) as { digest: Digest | null; error: string | null };
      setReachable(true);
      if (body.digest) setDigest(body.digest);
      setError(body.error);
    } catch {
      setReachable(false);
      setError('Couldn’t reach trinityd. Check its address, token, and network connection.');
    }
  }, [link]);

  useEffect(() => {
    if (!ready || !link) return;
    void load('/digest', 'GET');
    const id = setInterval(() => void load('/digest', 'GET'), POLL_MS);
    return () => clearInterval(id);
  }, [ready, link, load]);

  const refresh = useCallback(() => {
    setRefreshing(true);
    void load('/refresh?force=1', 'POST').finally(() => setRefreshing(false));
  }, [load]);

  const decide = useCallback((id: string, status: 'remind' | 'skip') => void load(`/upcoming/${id}`, 'POST', { status }), [load]);

  const value = useMemo(() => ({ link, connect, digest, error, refreshing, reachable, refresh, decide }), [link, connect, digest, error, refreshing, reachable, refresh, decide]);
  return <BriefContext.Provider value={value}>{children}</BriefContext.Provider>;
}
