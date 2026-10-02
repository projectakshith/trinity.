/*
 * Navigation: Trinity's tools, plus recent Morpheus sessions.
 */

import { useCallback, useMemo, type MouseEvent } from 'react';
import { useTheme } from '../lib/theme';
import type { ConnectionState, SessionListItem } from 'morpheus/client';
import { bucketOf, type SessionBucket } from '../lib/format';
import { Icon, type IconName } from '../lib/icons';

export type View = 'home' | 'morpheus' | 'automations';

interface SidebarProps {
  view: View;
  sessions: SessionListItem[];
  activeSessionId: string | null;
  connection: ConnectionState;
  linked: boolean;
  onNavigate: (view: View) => void;
  onSelectSession: (id: string) => void;
  onNewChat: () => void;
  onCollapse: () => void;
  onUnlink: () => void;
}

const NAV: { view: View; label: string; icon: IconName }[] = [
  { view: 'home', label: 'Home', icon: 'home' },
  { view: 'morpheus', label: 'Morpheus', icon: 'code' },
  { view: 'automations', label: 'Automations', icon: 'bolt' },
];

const BUCKETS: SessionBucket[] = ['Today', 'Yesterday', 'This week', 'Earlier'];

export function Sidebar({ view, sessions, activeSessionId, connection, linked, onNavigate, onSelectSession, onNewChat, onCollapse, onUnlink }: SidebarProps) {
  const { isDark, toggle } = useTheme();

  const groups = useMemo(() => {
    const now = Date.now();
    const map = new Map<SessionBucket, SessionListItem[]>();
    for (const s of sessions) {
      const b = bucketOf(s.updatedAt, now);
      map.set(b, [...(map.get(b) ?? []), s]);
    }
    return BUCKETS.filter((b) => map.has(b)).map((b) => [b, map.get(b)!] as const);
  }, [sessions]);

  const nav = useCallback(
    (e: MouseEvent<HTMLButtonElement>) => {
      const target = e.currentTarget.dataset.view as View | undefined;
      if (target) onNavigate(target);
    },
    [onNavigate]
  );
  const select = useCallback(
    (e: MouseEvent<HTMLButtonElement>) => {
      const id = e.currentTarget.dataset.id;
      if (id) onSelectSession(id);
    },
    [onSelectSession]
  );

  const morpheusDot = !linked ? 'off' : connection === 'open' ? 'on' : connection === 'unauthorized' ? 'bad' : 'wait';

  return (
    <aside className="sidebar">
      <div className="sidebar-head">
        <span className="wordmark">Trinity</span>
        <button type="button" className="ghost-btn" onClick={onCollapse} aria-label="hide sidebar">
          <Icon name="panel" size={17} />
        </button>
      </div>

      <button type="button" className="new-chat" onClick={onNewChat}>
        <Icon name="plus" size={16} />
        New chat
      </button>

      <nav className="nav">
        {NAV.map((item) => (
          <button key={item.view} type="button" data-view={item.view} className={`nav-item${view === item.view ? ' active' : ''}`} onClick={nav}>
            <Icon name={item.icon} size={16} />
            <span>{item.label}</span>
            {item.view === 'morpheus' ? <span className={`status-dot ${morpheusDot}`} /> : null}
            {item.view === 'automations' ? <span className="soon">Soon</span> : null}
          </button>
        ))}
      </nav>

      <div className="recents">
        {groups.map(([bucket, items]) => (
          <section key={bucket}>
            <h3>{bucket}</h3>
            {items.map((s) => (
              <button key={s.id} type="button" data-id={s.id} className={`recent${view === 'morpheus' && s.id === activeSessionId ? ' active' : ''}`} onClick={select}>
                <span className="recent-title">{s.title}</span>
                {s.status === 'running' ? <span className="running-dot" /> : null}
              </button>
            ))}
          </section>
        ))}
      </div>

      <div className="sidebar-foot">
        <button type="button" className="ghost-btn" onClick={toggle} aria-label="toggle theme">
          {isDark ? 'Light mode' : 'Dark mode'}
        </button>
        {linked ? (
          <button type="button" className="ghost-btn" onClick={onUnlink}>
            <Icon name="logout" size={14} />
            Disconnect
          </button>
        ) : null}
      </div>
    </aside>
  );
}
