/*
 * Model picker, fed by Neo's model catalog through the daemon's neo.request relay.
 */

import { useCallback, useEffect, useMemo, useState, type ChangeEvent, type FormEvent, type MouseEvent } from 'react';
import { useClient } from '../lib/morpheus';

interface ModelOption {
  id: string;
  description?: string;
  category?: string;
  providerName?: string;
  badge?: string;
}

interface ModelPickerProps {
  current: string;
  onPick: (model: string) => void;
  onClose: () => void;
}

export function ModelPicker({ current, onPick, onClose }: ModelPickerProps) {
  const client = useClient();
  const [models, setModels] = useState<ModelOption[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');

  useEffect(() => {
    let live = true;
    client
      .request('neo.request', { path: '/v1/models' })
      .then((res) => {
        const data = (res.body as { data?: ModelOption[] } | null)?.data;
        if (!live) return;
        if (Array.isArray(data)) setModels(data);
        else setError('neo returned no models');
      })
      .catch((err: Error) => live && setError(err.message));
    return () => {
      live = false;
    };
  }, [client]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = models ?? [];
    return q ? list.filter((m) => `${m.id} ${m.description ?? ''} ${m.providerName ?? ''}`.toLowerCase().includes(q)) : list;
  }, [models, query]);

  const groups = useMemo(() => {
    const map = new Map<string, ModelOption[]>();
    for (const m of filtered) {
      const key = m.category ?? 'other';
      map.set(key, [...(map.get(key) ?? []), m]);
    }
    return [...map.entries()];
  }, [filtered]);

  const onQuery = useCallback((e: ChangeEvent<HTMLInputElement>) => setQuery(e.target.value), []);
  const choose = useCallback(
    (e: MouseEvent<HTMLButtonElement>) => {
      const id = e.currentTarget.dataset.id;
      if (id) onPick(id);
    },
    [onPick]
  );
  const submitCustom = useCallback(
    (e: FormEvent) => {
      e.preventDefault();
      const exact = filtered.length === 1 ? filtered[0].id : query.trim();
      if (exact) onPick(exact);
    },
    [filtered, query, onPick]
  );
  const stop = useCallback((e: MouseEvent) => e.stopPropagation(), []);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={stop} role="dialog" aria-label="choose model">
        <div className="panel-title">
          <span className="accent">⬡</span> model <span className="muted">· current {current}</span>
        </div>
        <form onSubmit={submitCustom}>
          <input autoFocus value={query} onChange={onQuery} placeholder="filter or type a model id" spellCheck={false} autoCapitalize="off" />
        </form>
        <div className="model-list">
          {error ? <div className="error">{error}</div> : null}
          {!models && !error ? <div className="muted">loading models…</div> : null}
          {groups.map(([category, items]) => (
            <div key={category}>
              <div className="model-group muted">{category}</div>
              {items.map((m) => (
                <button key={m.id} type="button" data-id={m.id} className={`model-item${m.id === current ? ' active' : ''}`} onClick={choose}>
                  <span className="secondary bold">{m.id}</span>
                  {m.badge ? <span className="accent"> {m.badge}</span> : null}
                  {m.description ? <span className="muted model-desc">{m.description}</span> : null}
                </button>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
