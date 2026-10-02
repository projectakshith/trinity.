'use client';

import { useCallback, useEffect, useState } from 'react';
import { Shell } from '@/components/Shell';
import { linkFromLocation, loadLink, saveLink, type DaemonLink } from '@/lib/link';
import { ClientProvider } from '@/lib/morpheus';

export default function Page() {
  /* Everything here lives in the browser (localStorage, sockets), so render only after mount. */
  const [ready, setReady] = useState(false);
  const [link, setLink] = useState<DaemonLink | null>(null);
  const [lastLink, setLastLink] = useState<DaemonLink | null>(null);

  useEffect(() => {
    const paired = linkFromLocation();
    if (paired) saveLink(paired);
    const initial = paired ?? loadLink();
    setLink(initial);
    setLastLink(initial);
    setReady(true);
  }, []);

  const connect = useCallback((next: DaemonLink) => {
    saveLink(next);
    setLastLink(next);
    setLink(next);
  }, []);
  const unlink = useCallback(() => {
    saveLink(null);
    setLink(null);
  }, []);

  if (!ready) return null;
  return (
    <ClientProvider link={link}>
      <Shell link={link} lastLink={lastLink} onLink={connect} onUnlink={unlink} />
    </ClientProvider>
  );
}
