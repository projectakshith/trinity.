/*
 * Session list: saved and live sessions on the daemon, newest first.
 */

import { useCallback, type MouseEvent } from 'react';
import type { SessionListItem } from 'morpheus/client';
import { fmtAgo } from '../lib/format';

interface SessionsProps {
  sessions: SessionListItem[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onCreate: () => void;
}

export function Sessions({ sessions, activeId, onSelect, onCreate }: SessionsProps) {
  const select = useCallback(
    (e: MouseEvent<HTMLButtonElement>) => {
      const id = e.currentTarget.dataset.id;
      if (id) onSelect(id);
    },
    [onSelect]
  );
  const now = Date.now();

  return (
    <nav className="sessions">
      <div className="panel-title">
        <span className="accent">◈</span> sessions
      </div>
      <button type="button" className="new-session" onClick={onCreate}>
        <span className="accent-bright">+</span> new session
      </button>
      <ul>
        {sessions.map((s) => (
          <li key={s.id}>
            <button type="button" data-id={s.id} className={s.id === activeId ? 'active' : ''} onClick={select}>
              <span className="session-title">
                {s.status === 'running' ? <span className="accent-bright">● </span> : null}
                {s.title}
              </span>
              <span className="muted session-meta">
                {s.turnCount} turn{s.turnCount === 1 ? '' : 's'} · {fmtAgo(s.updatedAt, now)}
                {s.cwd ? ` · ${s.cwd.split('/').pop()}` : ''}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </nav>
  );
}
