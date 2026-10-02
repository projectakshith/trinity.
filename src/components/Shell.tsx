/*
 * Trinity's frame: sidebar + the active view. Morpheus is one tool among (eventually) several.
 */

import { useCallback, useEffect, useState } from 'react';
import type { SessionListItem } from 'morpheus/client';
import { loadLastSession, saveLastSession, type DaemonLink } from '../lib/link';
import { useConnectionState, useMaybeClient } from '../lib/morpheus';
import { Automations } from './Automations';
import { ConnectMorpheus } from './ConnectMorpheus';
import { Home } from './Home';
import { MorpheusView } from './MorpheusView';
import { Sidebar, type View } from './Sidebar';
import { TopBar } from './TopBar';

const VIEW_KEY = 'trinity.view';
const NARROW = '(max-width: 860px)';

function loadView(): View {
  try {
    const v = localStorage.getItem(VIEW_KEY);
    return v === 'morpheus' || v === 'automations' ? v : 'home';
  } catch {
    return 'home';
  }
}

interface ShellProps {
  link: DaemonLink | null;
  lastLink: DaemonLink | null;
  onLink: (link: DaemonLink) => void;
  onUnlink: () => void;
}

export function Shell({ link, lastLink, onLink, onUnlink }: ShellProps) {
  const client = useMaybeClient();
  const connection = useConnectionState();
  const [view, setView] = useState<View>(loadView);
  const [sessionId, setSessionId] = useState<string | null>(() => loadLastSession());
  const [sessions, setSessions] = useState<SessionListItem[]>([]);
  const [sidebarHidden, setSidebarHidden] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const navigate = useCallback((next: View) => {
    setView(next);
    setDrawerOpen(false);
    try {
      localStorage.setItem(VIEW_KEY, next);
    } catch {
      /* Storage unavailable: view just won't persist. */
    }
  }, []);

  const selectSession = useCallback(
    (id: string | null) => {
      setSessionId(id);
      saveLastSession(id);
      if (id) navigate('morpheus');
    },
    [navigate]
  );

  const refreshSessions = useCallback(async () => {
    if (!client) return [] as SessionListItem[];
    try {
      const { sessions: list } = await client.request('session.list', { limit: 60 });
      setSessions(list);
      return list;
    } catch {
      return [] as SessionListItem[];
    }
  }, [client]);

  const createSession = useCallback(async () => {
    if (!client) return null;
    const { session } = await client.request('session.create', {});
    setSessionId(session.id);
    saveLastSession(session.id);
    void refreshSessions();
    return session.id;
  }, [client, refreshSessions]);

  useEffect(() => {
    if (!client || connection !== 'open') return;
    void refreshSessions().then((list) => {
      if (!sessionId && list[0]) setSessionId(list[0].id);
    });
    const id = setInterval(refreshSessions, 15_000);
    return () => clearInterval(id);
  }, [client, connection, refreshSessions, sessionId]);

  useEffect(() => {
    if (!link) setSessions([]);
  }, [link]);

  const newChat = useCallback(() => {
    navigate('morpheus');
    if (client) void createSession().catch(() => {});
  }, [client, navigate, createSession]);

  const ask = useCallback(
    (prompt: string) => {
      if (!client) {
        navigate('morpheus');
        return;
      }
      void createSession()
        .then((id) => {
          if (!id) return;
          navigate('morpheus');
          return client.request('turn.start', { sessionId: id, prompt });
        })
        .catch(() => navigate('morpheus'));
    },
    [client, navigate, createSession]
  );

  const showSidebar = useCallback(() => {
    if (window.matchMedia(NARROW).matches) setDrawerOpen(true);
    else setSidebarHidden(false);
  }, []);
  const hideSidebar = useCallback(() => {
    if (window.matchMedia(NARROW).matches) setDrawerOpen(false);
    else setSidebarHidden(true);
  }, []);
  const closeDrawer = useCallback(() => setDrawerOpen(false), []);
  const sessionsChanged = useCallback(() => void refreshSessions(), [refreshSessions]);
  const repair = useCallback(() => onUnlink(), [onUnlink]);
  const unlink = useCallback(() => {
    setSessionId(null);
    onUnlink();
  }, [onUnlink]);

  let body;
  if (view === 'home') {
    body = <Home linked={Boolean(link)} connection={connection} sessions={sessions} onMenu={showSidebar} onNavigate={navigate} onAsk={ask} onOpenSession={selectSession} />;
  } else if (view === 'automations') {
    body = <Automations onMenu={showSidebar} />;
  } else if (!link) {
    body = (
      <div className="view">
        <TopBar onMenu={showSidebar} title="Morpheus" />
        <ConnectMorpheus initial={lastLink} onConnect={onLink} />
      </div>
    );
  } else {
    body = (
      <MorpheusView
        sessionId={sessionId}
        connection={connection}
        onMenu={showSidebar}
        onSwitchSession={selectSession}
        onSessionsChanged={sessionsChanged}
        onRepair={repair}
      />
    );
  }

  return (
    <div className={`app${sidebarHidden ? ' sidebar-hidden' : ''}${drawerOpen ? ' drawer-open' : ''}`}>
      <Sidebar
        view={view}
        sessions={sessions}
        activeSessionId={sessionId}
        connection={connection}
        linked={Boolean(link)}
        onNavigate={navigate}
        onSelectSession={selectSession}
        onNewChat={newChat}
        onCollapse={hideSidebar}
        onUnlink={unlink}
      />
      {drawerOpen ? <button type="button" className="scrim" aria-label="close sidebar" onClick={closeDrawer} /> : null}
      <main className="main">{body}</main>
    </div>
  );
}
