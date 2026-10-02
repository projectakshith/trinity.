'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import type { ConnectionState, SessionListItem } from 'morpheus/client';
import { ClientProvider, useConnectionState, useMaybeClient } from './client';
import { linkFromLocation, loadLink, saveLastSession, saveLink, type DaemonLink } from './link';

const SESSIONS_REFRESH_MS = 15_000;

export const MORPHEUS_HREF = '/morpheus/';

export function sessionHref(id: string): string {
  return `${MORPHEUS_HREF}?s=${encodeURIComponent(id)}`;
}

interface MorpheusState {
  ready: boolean;
  link: DaemonLink | null;
  lastLink: DaemonLink | null;
  connection: ConnectionState;
  sessions: SessionListItem[];
  sessionsLoaded: boolean;
  connect: (link: DaemonLink) => void;
  unlink: () => void;
  refreshSessions: () => Promise<SessionListItem[]>;
  createSession: () => Promise<string | null>;
  openSession: (id: string, replace?: boolean) => void;
  ask: (prompt: string) => void;
}

const MorpheusContext = createContext<MorpheusState | null>(null);

export function useMorpheus(): MorpheusState {
  const state = useContext(MorpheusContext);
  if (!state) throw new Error('useMorpheus outside MorpheusProvider');
  return state;
}

export function MorpheusProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [link, setLink] = useState<DaemonLink | null>(null);
  const [lastLink, setLastLink] = useState<DaemonLink | null>(null);

  useEffect(() => {
    const paired = linkFromLocation();
    if (paired) saveLink(paired);
    const initial = paired ?? loadLink();
    setLink(initial);
    setLastLink(initial);
    setReady(true);
  }, []);

  const connect = useCallback((next: DaemonLink) => {
    saveLink(next);
    setLastLink(next);
    setLink(next);
  }, []);

  const unlink = useCallback(() => {
    saveLink(null);
    saveLastSession(null);
    setLink(null);
  }, []);

  return (
    <ClientProvider link={link}>
      <SessionsLayer ready={ready} link={link} lastLink={lastLink} connect={connect} unlink={unlink}>
        {children}
      </SessionsLayer>
    </ClientProvider>
  );
}

interface SessionsLayerProps {
  ready: boolean;
  link: DaemonLink | null;
  lastLink: DaemonLink | null;
  connect: (link: DaemonLink) => void;
  unlink: () => void;
  children: ReactNode;
}

function SessionsLayer({ ready, link, lastLink, connect, unlink, children }: SessionsLayerProps) {
  const client = useMaybeClient();
  const connection = useConnectionState();
  const router = useRouter();
  const [sessions, setSessions] = useState<SessionListItem[]>([]);
  const [sessionsLoaded, setSessionsLoaded] = useState(false);

  const refreshSessions = useCallback(async () => {
    if (!client) return [];
    try {
      const { sessions: list } = await client.request('session.list', { limit: 60 });
      setSessions(list);
      setSessionsLoaded(true);
      return list;
    } catch {
      return [];
    }
  }, [client]);

  useEffect(() => {
    setSessions([]);
    setSessionsLoaded(false);
  }, [client]);

  useEffect(() => {
    if (connection !== 'open') return;
    void refreshSessions();
    const id = setInterval(refreshSessions, SESSIONS_REFRESH_MS);
    return () => clearInterval(id);
  }, [connection, refreshSessions]);

  const openSession = useCallback(
    (id: string, replace = false) => {
      saveLastSession(id);
      if (replace) router.replace(sessionHref(id));
      else router.push(sessionHref(id));
    },
    [router]
  );

  const createSession = useCallback(async () => {
    if (!client) return null;
    const { session } = await client.request('session.create', {});
    void refreshSessions();
    return session.id;
  }, [client, refreshSessions]);

  const ask = useCallback(
    (prompt: string) => {
      if (!client) {
        router.push(MORPHEUS_HREF);
        return;
      }
      void createSession()
        .then((id) => {
          if (!id) return;
          openSession(id);
          return client.request('turn.start', { sessionId: id, prompt });
        })
        .catch(() => router.push(MORPHEUS_HREF));
    },
    [client, createSession, openSession, router]
  );

  const value = useMemo<MorpheusState>(
    () => ({ ready, link, lastLink, connection, sessions, sessionsLoaded, connect, unlink, refreshSessions, createSession, openSession, ask }),
    [ready, link, lastLink, connection, sessions, sessionsLoaded, connect, unlink, refreshSessions, createSession, openSession, ask]
  );

  return <MorpheusContext.Provider value={value}>{children}</MorpheusContext.Provider>;
}
