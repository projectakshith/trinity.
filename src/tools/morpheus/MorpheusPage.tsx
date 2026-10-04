'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { TopBar } from '@/shell/TopBar';
import { ConnectMorpheus } from './ConnectMorpheus';
import { loadLastSession } from './link';
import { PanelContext, PanelToggle } from './panel';
import { SessionsPanel } from './SessionsPanel';
import { SessionView } from './SessionView';
import { useMorpheus } from './state';

const NARROW = '(max-width: 860px)';

export function MorpheusPage() {
  const { ready, link, lastLink, connect, connection, sessions, sessionsLoaded, createSession, openSession } = useMorpheus();
  const sessionId = useSearchParams().get('s');
  const [collapsed, setCollapsed] = useState(false);
  const [sheet, setSheet] = useState(false);

  useEffect(() => setSheet(false), [sessionId]);

  useEffect(() => {
    if (sessionId || !link || connection !== 'open' || !sessionsLoaded) return;
    const last = loadLastSession();
    const target = last && sessions.some((s) => s.id === last) ? last : sessions[0]?.id;
    if (target) openSession(target, true);
    else void createSession().then((id) => id && openSession(id, true));
  }, [sessionId, link, connection, sessionsLoaded, sessions, createSession, openSession]);

  const show = useCallback(() => {
    if (window.matchMedia(NARROW).matches) setSheet(true);
    else setCollapsed(false);
  }, []);
  const hide = useCallback(() => {
    if (window.matchMedia(NARROW).matches) setSheet(false);
    else setCollapsed(true);
  }, []);
  const closeSheet = useCallback(() => setSheet(false), []);
  const panel = useMemo(() => ({ hidden: collapsed, show }), [collapsed, show]);

  if (!ready) return null;

  if (!link) {
    return (
      <div className="view">
        <ConnectMorpheus initial={lastLink} onConnect={connect} />
      </div>
    );
  }

  return (
    <PanelContext.Provider value={panel}>
      <div className={`morpheus${collapsed ? ' panel-hidden' : ''}${sheet ? ' sheet-open' : ''}`}>
        <SessionsPanel onHide={hide} />
        {sheet ? <button type="button" className="scrim" aria-label="close sessions" onClick={closeSheet} /> : null}
        {sessionId ? (
          <SessionView key={sessionId} sessionId={sessionId} />
        ) : (
          <div className="view">
            <TopBar lead={<PanelToggle />} />
          </div>
        )}
      </div>
    </PanelContext.Provider>
  );
}
