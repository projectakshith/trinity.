/*
 * React bindings for morpheus/client: one client per daemon link, session stores via useSyncExternalStore.
 */

import { createContext, useContext, useEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from 'react';
import { MorpheusClient, type ConnectionState, type SessionSnapshot, type SessionStore } from 'morpheus/client';
import type { DaemonLink } from './link';

const ClientContext = createContext<MorpheusClient | null>(null);

/* Morpheus is optional: with no link, the provider holds null and Morpheus views offer to connect. */
export function ClientProvider({ link, children }: { link: DaemonLink | null; children: ReactNode }) {
  const client = useMemo(() => (link ? new MorpheusClient({ url: link.url, token: link.token, clientName: 'trinity' }) : null), [link]);

  useEffect(() => {
    if (!client) return;
    client.connect();
    /* Phones suspend sockets in the background; reconnect immediately when the app comes back. */
    const wake = () => {
      if (document.visibilityState === 'visible') client.reconnectNow();
    };
    document.addEventListener('visibilitychange', wake);
    window.addEventListener('online', wake);
    return () => {
      document.removeEventListener('visibilitychange', wake);
      window.removeEventListener('online', wake);
      client.close();
    };
  }, [client]);

  return <ClientContext.Provider value={client}>{children}</ClientContext.Provider>;
}

export function useMaybeClient(): MorpheusClient | null {
  return useContext(ClientContext);
}

export function useClient(): MorpheusClient {
  const client = useContext(ClientContext);
  if (!client) throw new Error('useClient needs a linked Morpheus');
  return client;
}

const noClientState = () => () => {};

export function useConnectionState(): ConnectionState {
  const client = useMaybeClient();
  return useSyncExternalStore(
    client ? (onChange) => client.onState(onChange) : noClientState,
    () => client?.state ?? 'idle'
  );
}

const noopSubscribe = () => () => {};
const noSnapshot = () => null;

export function useSession(sessionId: string | null): { snapshot: SessionSnapshot | null; store: SessionStore | null } {
  const client = useClient();
  const handle = useMemo(() => (sessionId ? client.session(sessionId) : null), [client, sessionId]);
  useEffect(() => () => handle?.release(), [handle]);
  const snapshot = useSyncExternalStore(handle ? handle.store.subscribe : noopSubscribe, handle ? handle.store.getSnapshot : noSnapshot);
  return { snapshot, store: handle?.store ?? null };
}

/* Re-renders on an interval while active, for live elapsed timers. */
export function useNow(active: boolean, intervalMs = 250): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [active, intervalMs]);
  return active ? now : Date.now();
}
