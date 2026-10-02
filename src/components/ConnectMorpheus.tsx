/*
 * Linking Trinity to a Morpheus daemon: address + token, verified before saving.
 */

import { useCallback, useState, type ChangeEvent, type FormEvent } from 'react';
import { MorpheusClient } from 'morpheus/client';
import { defaultDaemonUrl, type DaemonLink } from '../lib/link';
import { Icon } from '../lib/icons';

export function ConnectMorpheus({ initial, onConnect }: { initial: DaemonLink | null; onConnect: (link: DaemonLink) => void }) {
  const [url, setUrl] = useState(initial?.url ?? defaultDaemonUrl());
  const [token, setToken] = useState(initial?.token ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onUrl = useCallback((e: ChangeEvent<HTMLInputElement>) => setUrl(e.target.value), []);
  const onToken = useCallback((e: ChangeEvent<HTMLInputElement>) => setToken(e.target.value), []);

  const submit = useCallback(
    (e: FormEvent) => {
      e.preventDefault();
      const link = { url: url.trim(), token: token.trim() };
      if (!link.url || !link.token) return;
      setBusy(true);
      setError(null);
      let client: MorpheusClient;
      try {
        client = new MorpheusClient({ url: link.url, token: link.token, requestTimeoutMs: 6000, clientName: 'trinity' });
      } catch {
        setBusy(false);
        setError('That address doesn’t look like a ws:// URL.');
        return;
      }
      client
        .request('initialize', { client: { name: 'trinity' } })
        .then(() => onConnect(link))
        .catch(() => {
          setBusy(false);
          setError(client.state === 'unauthorized' ? 'Morpheus rejected that token.' : `Couldn’t reach Morpheus at ${link.url}.`);
        })
        .finally(() => client.close());
    },
    [url, token, onConnect]
  );

  return (
    <div className="center-page">
      <form className="connect-card" onSubmit={submit}>
        <div className="tool-icon">
          <Icon name="code" size={20} />
        </div>
        <h1 className="serif-title">Connect Morpheus</h1>
        <p className="lede">Morpheus is your coding agent. It runs on your laptop; Trinity talks to it from anywhere.</p>
        <label className="field">
          <span>Address</span>
          <input value={url} onChange={onUrl} placeholder="ws://100.x.y.z:7878" spellCheck={false} autoCapitalize="off" inputMode="url" />
        </label>
        <label className="field">
          <span>Token</span>
          <input value={token} onChange={onToken} placeholder="Paste from morpheus serve" type="password" autoComplete="off" />
        </label>
        {error ? <p className="form-error">{error}</p> : null}
        <button type="submit" className="primary-btn" disabled={busy || !url.trim() || !token.trim()}>
          {busy ? 'Connecting…' : 'Connect'}
        </button>
        <p className="help">
          On your laptop run <code>morpheus serve</code>. It prints the address and token. To connect from your phone, add <code>--host 0.0.0.0</code> or
          your Tailscale IP.
        </p>
      </form>
    </div>
  );
}
