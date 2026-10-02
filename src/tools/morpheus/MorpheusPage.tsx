'use client';

import { useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { TopBar } from '@/shell/TopBar';
import { ConnectMorpheus } from './ConnectMorpheus';
import { loadLastSession } from './link';
import { SessionView } from './SessionView';
import { useMorpheus } from './state';

export function MorpheusPage() {
  const { ready, link, lastLink, connect, connection, sessions, sessionsLoaded, createSession, openSession } = useMorpheus();
  const sessionId = useSearchParams().get('s');

  useEffect(() => {
    if (sessionId || !link || connection !== 'open' || !sessionsLoaded) return;
    const last = loadLastSession();
    const target = last && sessions.some((s) => s.id === last) ? last : sessions[0]?.id;
    if (target) openSession(target, true);
    else void createSession().then((id) => id && openSession(id, true));
  }, [sessionId, link, connection, sessionsLoaded, sessions, createSession, openSession]);

  if (!ready) return null;

  if (!link) {
    return (
      <div className="view">
        <TopBar title="Morpheus" />
        <ConnectMorpheus initial={lastLink} onConnect={connect} />
      </div>
    );
  }

  if (!sessionId) {
    return (
      <div className="view">
        <TopBar title="Morpheus" />
      </div>
    );
  }

  return <SessionView key={sessionId} sessionId={sessionId} />;
}
