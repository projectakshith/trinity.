import { useCallback, useState } from 'react';
import { Shell } from '../components/Shell';
import { linkFromLocation, loadLink, saveLink, type DaemonLink } from '../lib/link';
import { ClientProvider } from '../lib/morpheus';

export default function Home() {
  const [link, setLink] = useState<DaemonLink | null>(() => {
    const paired = linkFromLocation();
    if (paired) saveLink(paired);
    return paired ?? loadLink();
  });
  const [lastLink, setLastLink] = useState<DaemonLink | null>(link);

  const connect = useCallback((next: DaemonLink) => {
    saveLink(next);
    setLastLink(next);
    setLink(next);
  }, []);
  const unlink = useCallback(() => {
    saveLink(null);
    setLink(null);
  }, []);

  return (
    <ClientProvider link={link}>
      <Shell link={link} lastLink={lastLink} onLink={connect} onUnlink={unlink} />
    </ClientProvider>
  );
}
