/*
 * Trinity's front page: a greeting, one composer, and the tools Trinity can reach.
 */

import { useCallback, type MouseEvent } from 'react';
import type { ConnectionState, SessionListItem } from 'morpheus/client';
import { greeting } from '../lib/format';
import { Icon } from '../lib/icons';
import { Composer } from './Composer';
import type { View } from './Sidebar';
import { TopBar } from './TopBar';

const OWNER = 'Akshith';

interface HomeProps {
  linked: boolean;
  connection: ConnectionState;
  sessions: SessionListItem[];
  onMenu: () => void;
  onNavigate: (view: View) => void;
  onAsk: (prompt: string) => void;
  onOpenSession: (id: string) => void;
}

function morpheusStatus(linked: boolean, connection: ConnectionState, running: number): string {
  if (!linked) return 'Not connected';
  if (connection === 'unauthorized') return 'Token rejected';
  if (connection !== 'open') return 'Reconnecting…';
  return running > 0 ? `Connected · ${running} running` : 'Connected';
}

export function Home({ linked, connection, sessions, onMenu, onNavigate, onAsk, onOpenSession }: HomeProps) {
  const running = sessions.filter((s) => s.status === 'running').length;
  const recent = sessions.slice(0, 3);

  const go = useCallback(
    (e: MouseEvent<HTMLButtonElement>) => {
      const view = e.currentTarget.dataset.view as View | undefined;
      if (view) onNavigate(view);
    },
    [onNavigate]
  );
  const open = useCallback(
    (e: MouseEvent<HTMLButtonElement>) => {
      const id = e.currentTarget.dataset.id;
      if (id) onOpenSession(id);
    },
    [onOpenSession]
  );

  return (
    <div className="view">
      <TopBar onMenu={onMenu} />
      <div className="scroll">
        <div className="column home">
          <h1 className="greeting">
            {greeting()}, <em>{OWNER}</em>.
          </h1>
          <Composer placeholder={linked ? 'Ask Morpheus to build, fix or explain something…' : 'Connect Morpheus to start a task…'} toolLabel="Morpheus" autoFocus onSubmit={onAsk} />

          <section className="home-section">
            <h2>Your tools</h2>
            <div className="tool-grid">
              <button type="button" className="tool-card" data-view="morpheus" onClick={go}>
                <div className="tool-icon">
                  <Icon name="code" size={18} />
                </div>
                <div>
                  <div className="tool-name">Morpheus</div>
                  <div className="tool-desc">Coding agent on your laptop</div>
                </div>
                <span className={`tool-status${linked && connection === 'open' ? ' on' : ''}`}>{morpheusStatus(linked, connection, running)}</span>
              </button>
              <button type="button" className="tool-card" data-view="automations" onClick={go}>
                <div className="tool-icon">
                  <Icon name="bolt" size={18} />
                </div>
                <div>
                  <div className="tool-name">Automations</div>
                  <div className="tool-desc">Routines that run on their own</div>
                </div>
                <span className="tool-status">Soon</span>
              </button>
            </div>
          </section>

          {recent.length > 0 ? (
            <section className="home-section">
              <h2>Pick up where you left off</h2>
              <div className="recent-list">
                {recent.map((s) => (
                  <button key={s.id} type="button" className="recent-row" data-id={s.id} onClick={open}>
                    <span className="recent-row-title">{s.title}</span>
                    <span className="faint">
                      {s.status === 'running' ? 'Running' : `${s.turnCount} ${s.turnCount === 1 ? 'turn' : 'turns'}`}
                    </span>
                    <Icon name="chevronRight" size={15} className="faint" />
                  </button>
                ))}
              </div>
            </section>
          ) : null}
        </div>
      </div>
    </div>
  );
}
