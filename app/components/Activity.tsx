/*
 * Tool activity column: the TUI's right panel. Reads/searches collapse into strips, edits/commands get cards.
 * Card models come from morpheus/client's describeStep, the same code the TUI uses.
 */

import { memo, useCallback, useMemo, useState, type ReactElement } from 'react';
import { describeStep, type CardModel, type QuietItem, type Thread } from 'morpheus/client';
import { useNow } from '../lib/morpheus';

const BODY_LIMITS = { diff: 10, code: 6, text: 6 } as const;

type Block = { type: 'strip'; id: string; items: QuietItem[] } | { type: 'card'; id: string; card: CardModel };

function toBlocks(thread: Thread, cwd: string, now: number): Block[] {
  const blocks: Block[] = [];
  for (const step of thread.steps) {
    if (step.type !== 'tool') continue;
    const model = describeStep(step, cwd, now);
    if (model.kind === 'card') {
      blocks.push({ type: 'card', id: step.id, card: model.card });
      continue;
    }
    const last = blocks[blocks.length - 1];
    if (last?.type === 'strip') last.items.push(model.item);
    else blocks.push({ type: 'strip', id: step.id, items: [model.item] });
  }
  return blocks;
}

function verbClass(card: CardModel): string {
  if (card.failed) return 'error';
  switch (card.verb) {
    case 'edit':
      return 'accent-bright';
    case 'write':
      return 'add';
    case 'run':
      return 'warning';
    case 'fetch':
      return 'hunk';
    default:
      return 'secondary';
  }
}

function Strip({ items }: { items: QuietItem[] }) {
  const groups = useMemo(() => {
    const out: { verb: string; targets: string[]; running: boolean; result: string }[] = [];
    for (const item of items) {
      const last = out[out.length - 1];
      if (last && last.verb === item.verb && item.verb !== 'search') {
        last.targets.push(item.target);
        last.running ||= item.running;
      } else {
        out.push({ verb: item.verb, targets: [item.target], running: item.running, result: item.result });
      }
    }
    return out;
  }, [items]);

  return (
    <div className="strip">
      {groups.map((g, i) => (
        <span key={i} className="strip-unit">
          {i > 0 ? <span className="border-fg"> · </span> : null}
          <span className="muted">{g.verb} </span>
          <span className="secondary">
            {g.targets.join(', ')}
            {g.verb === 'search' && g.result ? ` ${g.result.split(' · ')[0]}` : ''}
          </span>
          {g.running ? <span className="accent"> …</span> : null}
        </span>
      ))}
    </div>
  );
}

function CardStatus({ card }: { card: CardModel }) {
  if (card.running) return <span className="accent italic">{card.status}</span>;
  if (card.verb === 'edit' && !card.failed && card.added !== undefined) {
    return (
      <span>
        <span className="add bold">+{card.added}</span> <span className="del bold">−{card.removed ?? 0}</span>
      </span>
    );
  }
  return card.status ? <span className={card.failed ? 'error' : 'muted'}>{card.status}</span> : null;
}

function CardBody({ card, expanded }: { card: CardModel; expanded: boolean }) {
  const body = card.body;
  let rows: ReactElement[] = [];
  let limit: number = BODY_LIMITS.text;
  let keepTail = false;

  if (body.type === 'diff') {
    limit = BODY_LIMITS.diff;
    rows = body.rows.map((r, i) =>
      r.kind === 'gap' ? (
        <div key={i} className="diff-row gap">
          ⋯
        </div>
      ) : (
        <div key={i} className={`diff-row ${r.kind}`}>
          <span className="ln">{r.lineNo ?? ''}</span>
          <span className="mk">{r.kind === 'add' ? '+' : r.kind === 'del' ? '−' : ' '}</span>
          <span className="code">{r.text}</span>
        </div>
      )
    );
  } else if (body.type === 'code') {
    limit = BODY_LIMITS.code;
    rows = body.lines.map((line, i) => (
      <div key={i} className="diff-row add">
        <span className="ln">{i + 1}</span>
        <span className="mk"> </span>
        <span className="code">{line}</span>
      </div>
    ));
  } else if (body.type === 'text') {
    keepTail = body.keep === 'tail';
    rows = body.lines.length
      ? body.lines.map((line, i) => (
          <div key={i} className={`text-row${line.error ? ' error' : ''}`}>
            {line.text || ' '}
          </div>
        ))
      : [
          <div key="none" className="text-row muted italic">
            (no output)
          </div>,
        ];
  } else if (card.running) {
    rows = [
      <div key="wait" className="text-row muted">
        ⋯
      </div>,
    ];
  }

  const hidden = expanded ? 0 : Math.max(0, rows.length - limit);
  const shown = hidden === 0 ? rows : keepTail ? rows.slice(-limit) : rows.slice(0, limit);
  return (
    <>
      {hidden > 0 && keepTail ? <div className="text-row muted italic">⋯ {hidden} earlier lines</div> : null}
      {shown}
      {hidden > 0 && !keepTail ? <div className="text-row muted italic">{hidden} more lines</div> : null}
    </>
  );
}

const Card = memo(function Card({ card }: { card: CardModel }) {
  const [expanded, setExpanded] = useState(false);
  const toggle = useCallback(() => setExpanded((v) => !v), []);
  const state = card.failed ? 'failed' : card.running ? 'running' : 'done';
  return (
    <div className={`card ${state}`}>
      <button type="button" className="card-head" onClick={toggle}>
        <span className={`bold ${verbClass(card)}`}>{card.verb}</span>
        <span className={`card-target${card.targetIsPath ? ' path' : ''}`}>
          <bdi>{card.target}</bdi>
        </span>
        <CardStatus card={card} />
      </button>
      {card.body.type !== 'none' || card.running ? (
        <div className="card-body">
          <CardBody card={card} expanded={expanded} />
        </div>
      ) : null}
    </div>
  );
});

function Turn({ thread, cwd, defaultOpen }: { thread: Thread; cwd: string; defaultOpen: boolean }) {
  const [openOverride, setOpenOverride] = useState<boolean | null>(null);
  const open = openOverride ?? defaultOpen;
  const toggle = useCallback(() => setOpenOverride(!open), [open]);
  const now = useNow(thread.status === 'running', 500);
  const blocks = useMemo(() => toBlocks(thread, cwd, now), [thread, cwd, now]);
  const calls = thread.steps.filter((s) => s.type === 'tool');
  const failed = calls.filter((s) => s.isError).length;
  if (calls.length === 0) return null;

  return (
    <section className="turn">
      <button type="button" className="turn-head" onClick={toggle}>
        <span className="muted">
          {open ? '▾' : '▸'} turn {thread.index} ·
        </span>
        <span className="secondary turn-prompt">{thread.prompt.replace(/\s+/gu, ' ')}</span>
        <span className={failed ? 'error' : 'muted'}>
          · {calls.length} call{calls.length === 1 ? '' : 's'}
          {failed ? ` · ${failed} failed` : ''}
        </span>
      </button>
      {open
        ? blocks.map((b) => (b.type === 'strip' ? <Strip key={b.id} items={b.items} /> : <Card key={b.id} card={b.card} />))
        : null}
    </section>
  );
}

export function Activity({ threads, cwd }: { threads: Thread[]; cwd: string }) {
  const withTools = threads.filter((t) => t.steps.some((s) => s.type === 'tool'));
  const lastId = withTools[withTools.length - 1]?.id;
  return (
    <div className="activity">
      <div className="panel-title">
        <span className="accent">◈</span> tool calls &amp; telemetry
      </div>
      {withTools.length === 0 ? (
        <div className="empty muted">
          no tool calls yet
          <br />
          reads, edits and commands show up here
        </div>
      ) : (
        withTools.map((t) => <Turn key={t.id} thread={t} cwd={cwd} defaultOpen={t.id === lastId || t.status === 'running'} />)
      )}
    </div>
  );
}
