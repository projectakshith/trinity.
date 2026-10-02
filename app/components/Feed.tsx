/*
 * Conversation feed, styled after the Morpheus TUI's left column.
 */

import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Thread, ThreadStep } from 'morpheus/client';
import { actionLabel, fmtSeconds } from '../lib/format';
import { renderMarkdown } from '../lib/markdown';
import { useNow } from '../lib/morpheus';

const QUOTES = ["I know why you're here.", 'The answer is out there, and it will find you.', 'Dodge this.', "It's the question that drives us."];

export function Hero() {
  const quote = useMemo(() => QUOTES[Math.floor(Math.random() * QUOTES.length)], []);
  return (
    <div className="hero">
      <pre className="hero-art">
        <span className="hero-mark">T/</span>
        {'  '}
        <span className="hero-dots">●●</span>
        {'  01    '}
        <span className="hero-name">TRINITY</span>
        {'\n              '}
        <span className="muted">interface for morpheus</span>
      </pre>
      <p className="hero-quote">“{quote}”</p>
    </div>
  );
}

const Markdown = memo(function Markdown({ source }: { source: string }) {
  const html = useMemo(() => ({ __html: renderMarkdown(source) }), [source]);
  return <div className="md" dangerouslySetInnerHTML={html} />;
});

function Thought({ step }: { step: ThreadStep }) {
  const [open, setOpen] = useState(false);
  const toggle = useCallback(() => setOpen((v) => !v), []);
  const content = step.content?.trim() ?? '';
  const glimpse = useMemo(() => {
    const first = content.split('\n')[0]?.replace(/^#+\s*/u, '').replace(/[`*_]/gu, '').trim() ?? '';
    return first.length > 48 ? `${first.slice(0, 47)}…` : first;
  }, [content]);
  const secs = fmtSeconds(step.durationMs ?? 0);

  return (
    <div className={`thought${open ? ' open' : ''}`}>
      <button type="button" className="thought-head" onClick={toggle}>
        {open ? (
          <>
            <span className="secondary">◆ thought ({secs})</span> <span className="accent">[-]</span>
          </>
        ) : (
          <>
            <span className="muted">◇ thought ({secs})</span>
            {glimpse ? <span className="muted italic"> · “{glimpse}”</span> : null}
            <span className="border-fg"> [+]</span>
          </>
        )}
      </button>
      {open ? (
        <div className="thought-body">
          {content.split('\n').map((line, i) => (
            <div key={i}>{line || ' '}</div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function Note({ step }: { step: ThreadStep }) {
  return (
    <div className="note">
      <span className="accent">›</span>
      <Markdown source={step.content ?? ''} />
    </div>
  );
}

function RunningLine({ thread, cwd }: { thread: Thread; cwd: string }) {
  const now = useNow(true, 200);
  const active = thread.steps.find((s) => s.type === 'tool' && s.isRunning) ?? thread.steps.find((s) => s.type === 'thinking' && s.isRunning);
  const label = active ? actionLabel(active, cwd, now) : `cooking (${fmtSeconds(now - thread.startTime)})...`;
  return (
    <div className="running-line">
      <span className="pulse" aria-hidden="true">
        <i />
        <i />
        <i />
      </span>
      <span className="accent-bright italic">{label}</span>
    </div>
  );
}

const ThreadView = memo(function ThreadView({ thread, cwd }: { thread: Thread; cwd: string }) {
  const timeline = thread.steps.filter((s) => (s.type === 'thinking' && !s.isRunning) || s.type === 'note');
  const showResponse = Boolean(thread.response) || thread.isStreaming;

  return (
    <article className={`thread status-${thread.status}`}>
      <header className="prompt">
        <div>
          <span className="accent">❯ </span>
          <span className="secondary bold">you</span>
        </div>
        <div className="prompt-text">{thread.prompt}</div>
      </header>

      {timeline.length > 0 ? (
        <div className="timeline">
          {timeline.map((step) => (step.type === 'note' ? <Note key={step.id} step={step} /> : <Thought key={step.id} step={step} />))}
        </div>
      ) : null}

      {thread.status === 'queued' ? <div className="queued">[queued behind active task · waiting for turn]</div> : null}

      {showResponse ? (
        <section className="response">
          <div className="accent-bright bold">▰ morpheus</div>
          <Markdown source={thread.response} />
        </section>
      ) : null}

      {thread.status === 'running' ? <RunningLine thread={thread} cwd={cwd} /> : null}
    </article>
  );
});

export function Feed({ threads, cwd }: { threads: Thread[]; cwd: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const pinned = useRef(true);

  const onScroll = useCallback(() => {
    const el = ref.current;
    if (el) pinned.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
  }, []);

  const last = threads[threads.length - 1];
  const tail = `${threads.length}:${last?.response.length ?? 0}:${last?.steps.length ?? 0}:${last?.status ?? ''}`;
  useEffect(() => {
    const el = ref.current;
    if (el && pinned.current) el.scrollTop = el.scrollHeight;
  }, [tail]);

  return (
    <div className="feed" ref={ref} onScroll={onScroll}>
      <Hero />
      {threads.map((t) => (
        <ThreadView key={t.id} thread={t} cwd={cwd} />
      ))}
    </div>
  );
}
