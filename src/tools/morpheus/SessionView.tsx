'use client';

import { useCallback, useEffect, useMemo, useState, type MouseEvent } from 'react';
import { applySuggestion, type SuggestionItem } from 'morpheus/client';
import { fmtTokens } from '@/lib/format';
import { TopBar } from '@/shell/TopBar';
import type { Autocomplete } from '@/ui/Composer';
import { Composer } from '@/ui/Composer';
import { glyphs } from '@/ui/glyphs';
import { Icon } from '@/ui/Icon';
import { useClient, useSession } from './client';
import { Conversation } from './Conversation';
import { saveLastSession } from './link';
import { ModelPicker } from './ModelPicker';
import { useMorpheus } from './state';

const STARTERS = ['Review my uncommitted changes', 'Explain how this codebase is structured', 'Find and fix a failing test'];
const DEFAULT_CONTEXT_LIMIT = 128_000;

export function SessionView({ sessionId }: { sessionId: string }) {
  const client = useClient();
  const { connection, unlink, refreshSessions, openSession } = useMorpheus();
  const { snapshot, store } = useSession(sessionId);
  const [pickingModel, setPickingModel] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => saveLastSession(sessionId), [sessionId]);

  useEffect(() => {
    if (!store) return;
    return store.onEvent((event) => {
      if (event.type === 'session.switched') openSession(event.to, true);
      else if (event.type === 'ui.request' && event.modal === 'model') setPickingModel(true);
      else if (event.type === 'status' || event.type === 'session.updated') void refreshSessions();
    });
  }, [store, openSession, refreshSessions]);

  const autocomplete = useMemo<Autocomplete>(
    () => ({
      wants: (input, cursor) => input.startsWith('/') || /(^|\s)@\S*$/u.test(input.slice(0, cursor)),
      fetch: async (input, cursor) => (await client.request('autocomplete', { sessionId, input, cursorPos: cursor })).suggestions,
      apply: (input, cursor, item) => applySuggestion(input, cursor, item as SuggestionItem),
    }),
    [client, sessionId]
  );

  const send = useCallback(
    (prompt: string) => {
      client.request('turn.start', { sessionId, prompt }).catch((err: Error) => setNotice(err.message));
    },
    [client, sessionId]
  );
  const stop = useCallback(() => {
    client.request('turn.abort', { sessionId }).catch(() => undefined);
  }, [client, sessionId]);
  const starter = useCallback(
    (e: MouseEvent<HTMLButtonElement>) => {
      const text = e.currentTarget.dataset.prompt;
      if (text) send(text);
    },
    [send]
  );
  const pickModel = useCallback(
    (model: string) => {
      setPickingModel(false);
      client.request('session.setModel', { sessionId, model }).catch((err: Error) => setNotice(err.message));
    },
    [client, sessionId]
  );
  const openModels = useCallback(() => setPickingModel(true), []);
  const closeModels = useCallback(() => setPickingModel(false), []);
  const dismiss = useCallback(() => setNotice(null), []);

  const running = snapshot?.status === 'running';
  const usage = snapshot?.usage;
  const meta = usage?.totalTokens
    ? `${fmtTokens(usage.totalTokens)} tokens · context ${fmtTokens(usage.peakContextTokens)} of ${fmtTokens(usage.contextLimit ?? DEFAULT_CONTEXT_LIMIT)}`
    : undefined;

  return (
    <div className="view">
      <TopBar title={snapshot?.title}>
        {snapshot?.workspace.branch ? (
          <span className="chip chip-branch" title={snapshot.cwd}>
            <Icon name="branch" size={13} />
            {snapshot.workspace.branch}
            {snapshot.workspace.gitStatus && snapshot.workspace.gitStatus !== 'clean' ? <span className="chip-glyph">{glyphs.gitDiff}</span> : null}
          </span>
        ) : null}
        {snapshot ? (
          <button type="button" className="chip chip-btn" onClick={openModels}>
            {snapshot.model.split('/').pop()}
            <Icon name="chevronDown" size={13} />
          </button>
        ) : null}
        <button type="button" className="ghost-btn" onClick={unlink} aria-label="disconnect morpheus">
          <Icon name="logout" size={15} />
        </button>
      </TopBar>

      {connection === 'unauthorized' ? (
        <div className="notice error">
          Morpheus rejected the saved token.
          <button type="button" onClick={unlink}>
            Reconnect
          </button>
        </div>
      ) : connection === 'reconnecting' ? (
        <div className="notice">Reconnecting to Morpheus…</div>
      ) : null}
      {notice ? (
        <button type="button" className="notice error" onClick={dismiss}>
          {notice}
        </button>
      ) : null}

      {!snapshot || snapshot.threads.length === 0 ? (
        <div className="scroll">
          <div className="column session-empty">
            <h1 className="greeting small">What should Morpheus work on?</h1>
            {snapshot ? <p className="faint mono cwd">{snapshot.cwd}</p> : null}
            <div className="starters">
              {STARTERS.map((s) => (
                <button key={s} type="button" className="starter" data-prompt={s} onClick={starter} disabled={!snapshot || connection !== 'open'}>
                  {s}
                </button>
              ))}
            </div>
          </div>
        </div>
      ) : (
        <Conversation threads={snapshot.threads} cwd={snapshot.cwd} />
      )}

      <div className="column composer-dock">
        <Composer
          autocomplete={autocomplete}
          placeholder={running ? 'Add a follow-up — it runs next' : 'Message Morpheus'}
          running={running}
          disabled={connection !== 'open' || !snapshot}
          autoFocus
          meta={meta}
          onSubmit={send}
          onStop={stop}
        />
      </div>

      {pickingModel && snapshot ? <ModelPicker current={snapshot.model} onPick={pickModel} onClose={closeModels} /> : null}
    </div>
  );
}
