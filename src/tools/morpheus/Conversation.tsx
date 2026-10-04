import { memo, useCallback, useEffect, useRef, useState } from 'react';
import type { Thread } from 'morpheus/client';
import { fmtDuration } from '@/lib/format';
import { Icon } from '@/ui/Icon';
import { glyphs } from '@/ui/glyphs';
import { Markdown } from '@/ui/Markdown';
import { Steps } from './Steps';

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
  const [glyph, tone] =
    thread.status === 'running' ? [glyphs.running, 'on'] : thread.status === 'error' ? [glyphs.error, 'bad'] : thread.status === 'aborted' ? [glyphs.bulletOpen, 'faint'] : [glyphs.bullet, 'on'];
  return (
    <div className="turn">
      <div className="turn-row turn-user">
        <span className="glyph turn-glyph">{glyphs.bulletOpen}</span>
        <div className="turn-body">
          <div className="turn-prompt">{thread.prompt}</div>
          {thread.status === 'queued' ? <div className="queued">{glyphs.pending} Queued, runs after the current task</div> : null}
        </div>
      </div>

      {thread.status !== 'queued' ? (
        <div className={`turn-row msg-assistant${thread.status === 'error' ? ' is-error' : ''}`}>
          <span className={`glyph turn-glyph ${tone}`}>{glyph}</span>
          <div className="turn-body">
            <Steps thread={thread} cwd={cwd} />
            {thread.response ? <Markdown source={thread.response} className="prose" /> : null}
            {done && thread.response ? (
              <div className="msg-foot">
                <CopyButton text={thread.response} />
                <span>{thread.status === 'aborted' ? 'Stopped' : fmtDuration(thread.durationMs ?? 0)}</span>
                {thread.model ? <span>· {thread.model.split('/').pop()}</span> : null}
              </div>
            ) : null}
          </div>
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
