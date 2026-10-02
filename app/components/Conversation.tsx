/*
 * A Morpheus session rendered as a chat: user bubbles, assistant replies with their work folded above.
 */

import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Thread } from 'morpheus/client';
import { fmtDuration } from '../lib/format';
import { Icon } from '../lib/icons';
import { renderMarkdown } from '../lib/markdown';
import { Steps } from './Steps';

const Markdown = memo(function Markdown({ source, className }: { source: string; className: string }) {
  const html = useMemo(() => ({ __html: renderMarkdown(source) }), [source]);
  return <div className={className} dangerouslySetInnerHTML={html} />;
});

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const copy = useCallback(() => {
    void navigator.clipboard?.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    });
  }, [text]);
  return (
    <button type="button" className="ghost-btn" onClick={copy} aria-label="copy reply">
      <Icon name={copied ? 'check' : 'copy'} size={14} />
    </button>
  );
}

const Turn = memo(function Turn({ thread, cwd }: { thread: Thread; cwd: string }) {
  const done = thread.status === 'completed' || thread.status === 'aborted' || thread.status === 'error';
  return (
    <div className="turn">
      <div className="msg-user">
        <div className="bubble">{thread.prompt}</div>
        {thread.status === 'queued' ? <div className="queued">Queued — runs after the current task</div> : null}
      </div>

      {thread.status !== 'queued' ? (
        <div className={`msg-assistant${thread.status === 'error' ? ' is-error' : ''}`}>
          <Steps thread={thread} cwd={cwd} />
          {thread.response ? <Markdown source={thread.response} className="prose" /> : null}
          {done && thread.response ? (
            <div className="msg-foot">
              <CopyButton text={thread.response} />
              <span>{thread.status === 'aborted' ? 'Stopped' : fmtDuration(thread.durationMs ?? 0)}</span>
              {thread.model ? <span>· {thread.model}</span> : null}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
});

export function Conversation({ threads, cwd }: { threads: Thread[]; cwd: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const pinned = useRef(true);

  const onScroll = useCallback(() => {
    const el = ref.current;
    if (el) pinned.current = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
  }, []);

  const last = threads[threads.length - 1];
  const tail = `${threads.length}:${last?.response.length ?? 0}:${last?.steps.length ?? 0}:${last?.status ?? ''}`;
  useEffect(() => {
    const el = ref.current;
    if (el && pinned.current) el.scrollTop = el.scrollHeight;
  }, [tail]);

  return (
    <div className="scroll" ref={ref} onScroll={onScroll}>
      <div className="column conversation">
        {threads.map((t) => (
          <Turn key={t.id} thread={t} cwd={cwd} />
        ))}
      </div>
    </div>
  );
}
