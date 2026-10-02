/*
 * Pairing screen: daemon address + token, verified with an initialize round-trip before saving.
 */

import { useCallback, useState, type ChangeEvent, type FormEvent } from 'react';
import { MorpheusClient } from 'morpheus/client';
import { defaultDaemonUrl, type DaemonLink } from '../lib/link';
import { Hero } from './Feed';

export function Connect({ initial, onConnect }: { initial: DaemonLink | null; onConnect: (link: DaemonLink) => void }) {
  const [url, setUrl] = useState(initial?.url ?? defaultDaemonUrl());
  const [token, setToken] = useState(initial?.token ?? '');
  const [status, setStatus] = useState<{ busy: boolean; error: string | null }>({ busy: false, error: null });

  const onUrl = useCallback((e: ChangeEvent<HTMLInputElement>) => setUrl(e.target.value), []);
  const onToken = useCallback((e: ChangeEvent<HTMLInputElement>) => setToken(e.target.value), []);

  const submit = useCallback(
    (e: FormEvent) => {
      e.preventDefault();
      const link = { url: url.trim(), token: token.trim() };
      if (!link.url || !link.token) return;
      setStatus({ busy: true, error: null });
      let client: MorpheusClient;
      try {
        client = new MorpheusClient({ url: link.url, token: link.token, requestTimeoutMs: 6000, clientName: 'trinity' });
      } catch {
        setStatus({ busy: false, error: 'that address is not a valid ws:// url' });
        return;
      }
      client
        .request('initialize', { client: { name: 'trinity' } })
        .then(() => onConnect(link))
        .catch(() =>
          setStatus({
            busy: false,
            error: client.state === 'unauthorized' ? 'token rejected by the daemon' : `can't reach morpheus at ${link.url}`,
          })
        )
        .finally(() => client.close());
    },
    [url, token, onConnect]
  );

  return (
    <div className="connect">
      <Hero />
      <form className="connect-form" onSubmit={submit}>
        <div className="panel-title">
          <span className="accent">◈</span> link to morpheus
        </div>
        <label>
          <span className="muted">daemon</span>
          <input value={url} onChange={onUrl} placeholder="ws://100.x.y.z:7878" spellCheck={false} autoCapitalize="off" inputMode="url" />
        </label>
        <label>
          <span className="muted">token</span>
          <input value={token} onChange={onToken} placeholder="from ~/.morpheus/daemon.json" type="password" autoComplete="off" />
        </label>
        <button type="submit" className="send" disabled={status.busy}>
          {status.busy ? 'linking…' : 'connect'}
        </button>
        {status.error ? <div className="error">{status.error}</div> : null}
        <p className="muted hint">
          run <code>morpheus serve</code> on your laptop (add <code>--host 0.0.0.0</code> or your tailscale IP for your
          phone). it prints the address and token.
        </p>
      </form>
    </div>
  );
}
