'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useMemo } from 'react';
import type { SessionListItem } from 'morpheus/client';
import { projectName, timeAgo } from '@/lib/format';
import { glyphs } from '@/ui/glyphs';
import { Icon } from '@/ui/Icon';
import type { Ask, PaletteItem } from '../types';
import { MORPHEUS_HREF, sessionHref, useMorpheus } from './state';

const HOME_RECENTS = 5;

export function sessionGlyph(status: SessionListItem['status']): [glyph: string, tone: string] {
  if (status === 'running') return [glyphs.running, 'on'];
  if (status === 'error') return [glyphs.error, 'bad'];
  return [glyphs.bulletOpen, ''];
}

function useLinkState(): { glyph: string; tone: string; text: string } {
  const { link, connection, sessions } = useMorpheus();
  const running = sessions.filter((s) => s.status === 'running').length;
  if (!link) return { glyph: glyphs.bulletOpen, tone: 'off', text: 'Not connected' };
  if (connection === 'unauthorized') return { glyph: glyphs.error, tone: 'bad', text: 'Token rejected' };
  if (connection !== 'open') return { glyph: glyphs.running, tone: 'wait', text: 'Reconnecting…' };
  if (running > 0) return { glyph: glyphs.running, tone: 'on', text: `${running} running` };
  return { glyph: glyphs.bullet, tone: 'on', text: 'Connected' };
}

export function NavGlyph() {
  const { glyph, tone } = useLinkState();
  return <span className={`status-glyph ${tone}`}>{glyph}</span>;
}

export function CardStatus() {
  const { glyph, tone, text } = useLinkState();
  return (
    <span className={`tool-status${tone === 'on' ? ' on' : ''}`}>
      <span className={`glyph ${tone}`}>{glyph}</span>
      {text}
    </span>
  );
}

function SessionRow({ session, now }: { session: SessionListItem; now: number }) {
  const [glyph, tone] = sessionGlyph(session.status);
  const running = session.status === 'running';
  return (
    <Link href={sessionHref(session.id)} className={`work-row${running ? ' is-running' : ''}`}>
      <span className={`glyph work-glyph ${tone}`}>{glyph}</span>
      <span className="work-text">
        <span className={`work-title${running ? ' shimmer' : ''}`}>{session.title}</span>
        <span className="work-meta">
          <span className="work-project">{projectName(session.cwd)}</span>
          <span>·</span>
          <span>{running ? 'working now' : timeAgo(session.updatedAt, now)}</span>
          {session.turnCount ? (
            <>
              <span>·</span>
              <span>
                {session.turnCount} {session.turnCount === 1 ? 'turn' : 'turns'}
              </span>
            </>
          ) : null}
        </span>
      </span>
      <Icon name="arrowRight" size={14} className="work-go" />
    </Link>
  );
}

export function HomeWork() {
  const { link, connection, sessions } = useMorpheus();
  const now = Date.now();
  const running = sessions.filter((s) => s.status === 'running');
  const recent = sessions.filter((s) => s.status !== 'running').slice(0, HOME_RECENTS);

  if (!link) {
    return (
      <section className="home-section">
        <h2 className="eyebrow">Get started</h2>
        <Link href={MORPHEUS_HREF} className="connect-banner">
          <span className="connect-mark">{glyphs.bulletOpen}</span>
          <span className="connect-text">
            <span className="connect-title">Connect Morpheus</span>
            <span className="connect-sub">Pair the coding agent on your laptop to start delegating work.</span>
          </span>
          <Icon name="arrowRight" size={16} />
        </Link>
      </section>
    );
  }

  return (
    <>
      {running.length > 0 ? (
        <section className="home-section">
          <h2 className="eyebrow">
            Running now <span className="count">{running.length}</span>
          </h2>
          <div className="work-list hud">
            {running.map((s) => (
              <SessionRow key={s.id} session={s} now={now} />
            ))}
          </div>
        </section>
      ) : null}
      <section className="home-section">
        <h2 className="eyebrow">Recent work</h2>
        {recent.length > 0 ? (
          <div className="work-list">
            {recent.map((s) => (
              <SessionRow key={s.id} session={s} now={now} />
            ))}
          </div>
        ) : (
          <p className="empty-line">{connection === 'open' ? 'Nothing yet. Ask Morpheus for something above.' : 'Waiting for Morpheus…'}</p>
        )}
      </section>
    </>
  );
}

export function useMorpheusAsk(): Ask {
  const { link, ask } = useMorpheus();
  return {
    placeholder: link ? 'Ask Morpheus to build, fix or explain something…' : 'Connect Morpheus to start a task…',
    submit: ask,
  };
}

export function useMorpheusNewSession(): () => void {
  const { createSession, openSession, link } = useMorpheus();
  const router = useRouter();
  return useCallback(() => {
    if (!link) {
      router.push(MORPHEUS_HREF);
      return;
    }
    void createSession().then((id) => id && openSession(id));
  }, [createSession, openSession, link, router]);
}

export function useMorpheusPalette(): PaletteItem[] {
  const { sessions, openSession } = useMorpheus();
  const newSession = useMorpheusNewSession();
  return useMemo(() => {
    const now = Date.now();
    return [
      { id: 'morpheus:new', group: 'Morpheus', label: 'New session', glyph: '+', run: newSession },
      ...sessions.map((s) => {
        const [glyph] = sessionGlyph(s.status);
        return {
          id: `morpheus:s:${s.id}`,
          group: 'Sessions',
          label: s.title,
          detail: `${projectName(s.cwd)} · ${s.status === 'running' ? 'running' : timeAgo(s.updatedAt, now)}`,
          glyph,
          run: () => openSession(s.id),
        };
      }),
    ];
  }, [sessions, openSession, newSession]);
}
