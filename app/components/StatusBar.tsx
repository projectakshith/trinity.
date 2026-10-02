/*
 * Bottom status line, same metrics as the TUI: state · elapsed · steps · context · api tokens · queue.
 */

import type { SessionSnapshot } from 'morpheus/client';
import { fmtClock, fmtTokens } from '../lib/format';
import { useNow } from '../lib/morpheus';

const DEFAULT_MAX_STEPS = 25;

export function StatusBar({ session }: { session: SessionSnapshot }) {
  const running = session.status === 'running';
  const now = useNow(running, 1000);
  const current = [...session.threads].reverse().find((t) => t.status !== 'queued');
  const elapsedMs = current ? (current.status === 'running' ? now - current.startTime : (current.durationMs ?? 0)) : 0;
  const usage = session.usage;
  const label = running ? 'running' : session.status === 'aborted' ? 'stopped' : session.status;

  return (
    <div className="statusbar">
      <span className={`status-label ${session.status}`}>
        {running ? <span className="spinner" aria-hidden="true" /> : null}
        {label}
      </span>
      <span className="secondary metrics">
        {'· ◷ '}
        {fmtClock(Math.floor(elapsedMs / 1000))}
        {' · step '}
        {current?.stepCount ?? 0}/{session.maxSteps ?? DEFAULT_MAX_STEPS}
        {' · ctx '}
        {fmtTokens(usage?.peakContextTokens)}/{usage?.contextLimit ? `${Math.round(usage.contextLimit / 1000)}k` : '128k'}
        {' · api '}
        {fmtTokens(usage?.totalTokens)}
        {session.queued > 0 ? ` · +${session.queued}q` : ''}
      </span>
      <span className="muted hints">{running ? '/command · type to queue · [esc] stop' : '/model switch · /help · [esc] stop'}</span>
    </div>
  );
}
