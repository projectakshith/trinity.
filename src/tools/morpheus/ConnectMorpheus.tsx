import { useCallback, useState, type ChangeEvent, type FormEvent } from 'react';
import { MorpheusClient } from 'morpheus/client';
import { glyphs } from '@/ui/glyphs';
import { defaultDaemonUrl, type DaemonLink } from './link';

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
    <div className="center-page connect-page">
      <form className="connect-card" onSubmit={submit}>
        <span className="connect-hero">{glyphs.bulletOpen}</span>
        <p className="eyebrow">Morpheus</p>
        <h1 className="serif-title">Connect your laptop</h1>
        <p className="lede">Morpheus is your coding agent. It runs on your laptop, and Trinity drives it from anywhere.</p>
        <ol className="connect-steps">
          <li>
            Run <code>morpheus serve</code> on your laptop.
          </li>
          <li>Paste the address and token it prints.</li>
          <li>
            From your phone, start it with <code>--host 0.0.0.0</code> or your Tailscale IP.
          </li>
        </ol>
        <div className="connect-fields">
          <label className="field">
            <span>Address</span>
            <input value={url} onChange={onUrl} placeholder="ws://100.x.y.z:7878" spellCheck={false} autoCapitalize="off" inputMode="url" />
          </label>
          <label className="field">
            <span>Token</span>
            <input value={token} onChange={onToken} placeholder="Paste from morpheus serve" type="password" autoComplete="off" />
          </label>
          {error ? <p className="form-error">{glyphs.error} {error}</p> : null}
          <button type="submit" className="primary-btn" disabled={busy || !url.trim() || !token.trim()}>
            {busy ? 'Connecting…' : 'Connect'}
          </button>
        </div>
      </form>
    </div>
  );
}
