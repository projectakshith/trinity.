import { createContext, useContext, useEffect, useMemo, useSyncExternalStore, type ReactNode } from 'react';
import { MorpheusClient, type ConnectionState, type SessionSnapshot, type SessionStore } from 'morpheus/client';
import type { DaemonLink } from './link';

const ClientContext = createContext<MorpheusClient | null>(null);

export function ClientProvider({ link, children }: { link: DaemonLink | null; children: ReactNode }) {
  const client = useMemo(() => (link ? new MorpheusClient({ url: link.url, token: link.token, clientName: 'trinity' }) : null), [link]);

  useEffect(() => {
    if (!client) return;
    client.connect();
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

const noSubscribe = () => () => {};
const noSnapshot = () => null;

export function useConnectionState(): ConnectionState {
  const client = useMaybeClient();
  return useSyncExternalStore(
    client ? (onChange) => client.onState(onChange) : noSubscribe,
    () => client?.state ?? 'idle',
    () => 'idle'
  );
}

export function useSession(sessionId: string | null): { snapshot: SessionSnapshot | null; store: SessionStore | null } {
  const client = useClient();
  const handle = useMemo(() => (sessionId ? client.session(sessionId) : null), [client, sessionId]);
  useEffect(() => () => handle?.release(), [handle]);
  const snapshot = useSyncExternalStore(handle ? handle.store.subscribe : noSubscribe, handle ? handle.store.getSnapshot : noSnapshot, noSnapshot);
  return { snapshot, store: handle?.store ?? null };
}
