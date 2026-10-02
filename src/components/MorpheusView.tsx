/*
 * One Morpheus session: conversation, composer, model and workspace context.
 */

import { useCallback, useEffect, useState, type MouseEvent } from 'react';
import type { ConnectionState } from 'morpheus/client';
import { fmtTokens } from '../lib/format';
import { Icon } from '../lib/icons';
import { useClient, useSession } from '../lib/morpheus';
import { Composer } from './Composer';
import { Conversation } from './Conversation';
import { ModelPicker } from './ModelPicker';
import { TopBar } from './TopBar';

const STARTERS = ['Review my uncommitted changes', 'Explain how this codebase is structured', 'Find and fix a failing test'];

interface MorpheusViewProps {
  sessionId: string | null;
  connection: ConnectionState;
  onMenu: () => void;
  onSwitchSession: (id: string) => void;
  onSessionsChanged: () => void;
  onRepair: () => void;
}

export function MorpheusView({ sessionId, connection, onMenu, onSwitchSession, onSessionsChanged, onRepair }: MorpheusViewProps) {
  const client = useClient();
  const { snapshot, store } = useSession(sessionId);
  const [pickingModel, setPickingModel] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (!store) return;
    return store.onEvent((event) => {
      if (event.type === 'session.switched') onSwitchSession(event.to);
      else if (event.type === 'ui.request' && event.modal === 'model') setPickingModel(true);
      else if (event.type === 'status' || event.type === 'session.updated') onSessionsChanged();
    });
  }, [store, onSwitchSession, onSessionsChanged]);

  const send = useCallback(
    (prompt: string) => {
      if (!sessionId) return;
      client.request('turn.start', { sessionId, prompt }).catch((err: Error) => setNotice(err.message));
    },
    [client, sessionId]
  );
  const stop = useCallback(() => {
    if (sessionId) client.request('turn.abort', { sessionId }).catch(() => {});
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
      if (sessionId) client.request('session.setModel', { sessionId, model }).catch((err: Error) => setNotice(err.message));
    },
    [client, sessionId]
  );
  const openModels = useCallback(() => setPickingModel(true), []);
  const closeModels = useCallback(() => setPickingModel(false), []);
  const dismiss = useCallback(() => setNotice(null), []);

  const running = snapshot?.status === 'running';
  const usage = snapshot?.usage;
  const meta = usage?.totalTokens
    ? `${fmtTokens(usage.totalTokens)} tokens · context ${fmtTokens(usage.peakContextTokens)} of ${fmtTokens(usage.contextLimit ?? 128_000)}`
    : undefined;
  const empty = !snapshot || snapshot.threads.length === 0;

  return (
    <div className="view">
      <TopBar onMenu={onMenu} title={snapshot?.title}>
        {snapshot?.workspace.branch ? (
          <span className="chip chip-branch" title={snapshot.cwd}>
            <Icon name="branch" size={13} />
            {snapshot.workspace.branch}
            {snapshot.workspace.gitStatus && snapshot.workspace.gitStatus !== 'clean' ? <span className="chip-dot" /> : null}
          </span>
        ) : null}
        {snapshot ? (
          <button type="button" className="chip chip-btn" onClick={openModels}>
            {snapshot.model.split('/').pop()}
            <Icon name="chevronDown" size={13} />
          </button>
        ) : null}
      </TopBar>

      {connection === 'unauthorized' ? (
        <div className="notice error">
          Morpheus rejected the saved token.
          <button type="button" onClick={onRepair}>
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

      {empty ? (
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
          sessionId={sessionId}
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
