/*
 * Main layout: sessions | feed | activity, with header, status bar and composer. Collapses to one column on phones.
 */

import { useCallback, useEffect, useState } from 'react';
import type { SessionListItem } from 'morpheus/client';
import { loadLastSession, saveLastSession } from '../lib/link';
import { useClient, useConnectionState, useSession } from '../lib/morpheus';
import { Activity } from './Activity';
import { Composer } from './Composer';
import { Feed, Hero } from './Feed';
import { Header } from './Header';
import { ModelPicker } from './ModelPicker';
import { Sessions } from './Sessions';
import { StatusBar } from './StatusBar';

type Drawer = 'sessions' | 'activity' | null;

export function Shell({ onUnlink }: { onUnlink: () => void }) {
  const client = useClient();
  const connection = useConnectionState();
  const [sessionId, setSessionId] = useState<string | null>(() => loadLastSession());
  const [sessions, setSessions] = useState<SessionListItem[]>([]);
  const [drawer, setDrawer] = useState<Drawer>(null);
  const [pickingModel, setPickingModel] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const { snapshot, store } = useSession(sessionId);

  const selectSession = useCallback((id: string | null) => {
    setSessionId(id);
    saveLastSession(id);
    setDrawer(null);
  }, []);

  const refreshSessions = useCallback(
    () =>
      client
        .request('session.list', { limit: 50 })
        .then((res) => {
          setSessions(res.sessions);
          return res.sessions;
        })
        .catch(() => [] as SessionListItem[]),
    [client]
  );

  const createSession = useCallback(() => {
    client
      .request('session.create', {})
      .then(({ session }) => {
        selectSession(session.id);
        void refreshSessions();
      })
      .catch((err: Error) => setNotice(err.message));
  }, [client, selectSession, refreshSessions]);

  /* On (re)connect: refresh the list and make sure we're looking at a session that exists. */
  useEffect(() => {
    if (connection !== 'open') return;
    void refreshSessions().then((list) => {
      if (sessionId && list.some((s) => s.id === sessionId)) return;
      if (sessionId) {
        client.request('session.subscribe', { sessionId }).catch(() => selectSession(list[0]?.id ?? null));
        return;
      }
      if (list[0]) selectSession(list[0].id);
      else createSession();
    });
    const id = setInterval(refreshSessions, 15_000);
    return () => clearInterval(id);
  }, [connection, client, refreshSessions, sessionId, selectSession, createSession]);

  useEffect(() => {
    if (!store) return;
    return store.onEvent((event) => {
      if (event.type === 'session.switched') {
        selectSession(event.to);
        void refreshSessions();
      } else if (event.type === 'ui.request' && event.modal === 'model') {
        setPickingModel(true);
      } else if (event.type === 'status' || event.type === 'session.updated') {
        void refreshSessions();
      }
    });
  }, [store, selectSession, refreshSessions]);

  const submit = useCallback(
    (prompt: string) => {
      if (!sessionId) return;
      client.request('turn.start', { sessionId, prompt }).catch((err: Error) => setNotice(err.message));
    },
    [client, sessionId]
  );

  const stop = useCallback(() => {
    if (sessionId) client.request('turn.abort', { sessionId }).catch(() => {});
  }, [client, sessionId]);

  const pickModel = useCallback(
    (model: string) => {
      setPickingModel(false);
      if (sessionId) client.request('session.setModel', { sessionId, model }).catch((err: Error) => setNotice(err.message));
    },
    [client, sessionId]
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && snapshot?.status === 'running' && !(e.target instanceof HTMLTextAreaElement)) stop();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [snapshot?.status, stop]);

  const openSessions = useCallback(() => setDrawer((d) => (d === 'sessions' ? null : 'sessions')), []);
  const openActivity = useCallback(() => setDrawer((d) => (d === 'activity' ? null : 'activity')), []);
  const closeDrawer = useCallback(() => setDrawer(null), []);
  const openModels = useCallback(() => setPickingModel(true), []);
  const closeModels = useCallback(() => setPickingModel(false), []);
  const dismissNotice = useCallback(() => setNotice(null), []);

  return (
    <div className={`app${drawer ? ` drawer-${drawer}` : ''}`}>
      <Header session={snapshot} connection={connection} onOpenSessions={openSessions} onOpenActivity={openActivity} onOpenModels={openModels} />

      {connection === 'unauthorized' ? (
        <div className="banner error">
          token rejected. the daemon token changed.{' '}
          <button type="button" onClick={onUnlink}>
            re-pair
          </button>
        </div>
      ) : connection === 'reconnecting' ? (
        <div className="banner">lost the daemon · relinking…</div>
      ) : null}
      {notice ? (
        <button type="button" className="banner error" onClick={dismissNotice}>
          {notice} · dismiss
        </button>
      ) : null}

      <div className="main">
        <aside className="col col-sessions">
          <Sessions sessions={sessions} activeId={sessionId} onSelect={selectSession} onCreate={createSession} />
          <button type="button" className="unlink muted" onClick={onUnlink}>
            unlink device
          </button>
        </aside>
        <main className="col col-feed">{snapshot ? <Feed threads={snapshot.threads} cwd={snapshot.cwd} /> : <div className="feed"><Hero /></div>}</main>
        <aside className="col col-activity">{snapshot ? <Activity threads={snapshot.threads} cwd={snapshot.cwd} /> : null}</aside>
        {drawer ? <button type="button" className="scrim" aria-label="close" onClick={closeDrawer} /> : null}
      </div>

      {snapshot ? <StatusBar session={snapshot} /> : null}
      {sessionId ? (
        <Composer sessionId={sessionId} running={snapshot?.status === 'running'} disabled={connection !== 'open' || !snapshot} onSubmit={submit} onStop={stop} />
      ) : null}

      {pickingModel && snapshot ? <ModelPicker current={snapshot.model} onPick={pickModel} onClose={closeModels} /> : null}
    </div>
  );
}
