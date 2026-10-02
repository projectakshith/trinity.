/*
 * Top bar: brand, git state, session title, model chip and link state. Mirrors the TUI header.
 */

import type { ConnectionState, SessionSnapshot } from 'morpheus/client';

interface HeaderProps {
  session: SessionSnapshot | null;
  connection: ConnectionState;
  onOpenSessions: () => void;
  onOpenActivity: () => void;
  onOpenModels: () => void;
}

const LINK_LABEL: Record<ConnectionState, string> = {
  idle: 'offline',
  connecting: 'linking',
  open: 'linked',
  reconnecting: 'relinking',
  unauthorized: 'denied',
  closed: 'offline',
};

export function Header({ session, connection, onOpenSessions, onOpenActivity, onOpenModels }: HeaderProps) {
  const ws = session?.workspace;
  return (
    <header className="topbar">
      <button type="button" className="icon-btn only-narrow" onClick={onOpenSessions} aria-label="sessions">
        ☰
      </button>
      <div className="brand">
        <span className="accent-bright bold">▰ trinity</span>
        <span className="muted"> v0.1</span>
        {ws?.branch ? (
          <span className="git">
            <span className="border-fg"> │ </span>
            <span className="secondary">◈ {ws.branch}</span>
            {ws.gitStatus ? <span className={ws.gitStatus === 'clean' ? 'muted' : 'accent-bright'}> [{ws.gitStatus}]</span> : null}
          </span>
        ) : null}
        {session ? (
          <span className="title">
            <span className="border-fg"> │ </span>
            <span className="text">{session.title}</span>
          </span>
        ) : null}
      </div>
      <div className="topbar-right">
        {session ? (
          <button type="button" className="model-chip" onClick={onOpenModels}>
            <span className="border-fg">[ </span>
            <span className="accent">⬡ </span>
            <span className="secondary bold">{session.model}</span>
            <span className="border-fg"> ]</span>
          </button>
        ) : null}
        <span className={`link link-${connection}`} title={`daemon ${LINK_LABEL[connection]}`}>
          ● <span className="link-label">{LINK_LABEL[connection]}</span>
        </span>
        <button type="button" className="icon-btn only-narrow" onClick={onOpenActivity} aria-label="tool activity">
          ◈
        </button>
      </div>
    </header>
  );
}
