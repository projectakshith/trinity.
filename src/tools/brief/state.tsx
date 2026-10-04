'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

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
  digest: Digest | null;
  error: string | null;
  refreshing: boolean;
  reachable: boolean;
  refresh: () => void;
}

const POLL_MS = 60_000;

export const BRIEF_HREF = '/brief/';

const BriefContext = createContext<BriefState | null>(null);

export function useBrief(): BriefState {
  const state = useContext(BriefContext);
  if (!state) throw new Error('useBrief outside BriefProvider');
  return state;
}

function daemonUrl(path: string): string {
  const host = window.location.hostname === 'localhost' ? 'localhost' : '127.0.0.1';
  return `http://${host}:7979${path}`;
}

export function BriefProvider({ children }: { children: ReactNode }) {
  const [digest, setDigest] = useState<Digest | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [reachable, setReachable] = useState(true);

  const load = useCallback(async (path: string, method: 'GET' | 'POST') => {
    try {
      const res = await fetch(daemonUrl(path), { method });
      const body = (await res.json()) as { digest: Digest | null; error: string | null };
      setReachable(true);
      if (body.digest) setDigest(body.digest);
      setError(body.error);
    } catch {
      setReachable(false);
      setError('trinityd isn’t running. Start it with bun run daemon.');
    }
  }, []);

  useEffect(() => {
    void load('/digest', 'GET');
    const id = setInterval(() => void load('/digest', 'GET'), POLL_MS);
    return () => clearInterval(id);
  }, [load]);

  const refresh = useCallback(() => {
    setRefreshing(true);
    void load('/refresh?force=1', 'POST').finally(() => setRefreshing(false));
  }, [load]);

  const value = useMemo(() => ({ digest, error, refreshing, reachable, refresh }), [digest, error, refreshing, reachable, refresh]);
  return <BriefContext.Provider value={value}>{children}</BriefContext.Provider>;
}
