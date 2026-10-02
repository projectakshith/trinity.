import { useCallback, useEffect, useMemo, useState, type ChangeEvent, type FormEvent, type MouseEvent } from 'react';
import { Icon } from '@/ui/Icon';
import { useClient } from './client';

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
      <div className="modal" onClick={stop} role="dialog" aria-label="Choose a model">
        <div className="modal-head">
          <h2 className="serif-title small">Choose a model</h2>
          <button type="button" className="ghost-btn" onClick={onClose} aria-label="close">
            <Icon name="x" size={16} />
          </button>
        </div>
        <form onSubmit={submitCustom} className="search-field">
          <Icon name="search" size={15} className="faint" />
          <input autoFocus value={query} onChange={onQuery} placeholder="Search models or type an id" spellCheck={false} autoCapitalize="off" />
        </form>
        <div className="model-list">
          {error ? <p className="form-error">{error}</p> : null}
          {!models && !error ? <p className="faint">Loading models…</p> : null}
          {groups.map(([category, items]) => (
            <div key={category} className="model-group">
              <h3>{category}</h3>
              {items.map((m) => (
                <button key={m.id} type="button" data-id={m.id} className={`model-item${m.id === current ? ' active' : ''}`} onClick={choose}>
                  <span className="model-text">
                    <span className="model-name">{m.id.split('/').pop()}</span>
                    {m.description ? <span className="model-desc">{m.description}</span> : null}
                  </span>
                  {m.id === current ? <Icon name="check" size={16} /> : null}
                </button>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
