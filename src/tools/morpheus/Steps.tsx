import { memo, useCallback, useState, type ReactElement } from 'react';
import { describeStep, type CardModel, type QuietItem, type Thread, type ThreadStep } from 'morpheus/client';
import { fmtDuration } from '@/lib/format';
import { useNow } from '@/lib/useNow';
import { Icon, type IconName } from '@/ui/Icon';
import { Markdown } from '@/ui/Markdown';
import { liveLabel } from './labels';

const VERBS: Record<string, [running: string, done: string, icon: IconName]> = {
  read: ['Reading', 'Read', 'file'],
  list: ['Listing', 'Listed', 'folder'],
  search: ['Searching', 'Searched', 'search'],
  outline: ['Skimming', 'Skimmed', 'list'],
  skill: ['Loading skill', 'Loaded skill', 'book'],
  note: ['Noting', 'Noted', 'pencil'],
  edit: ['Editing', 'Edited', 'pencil'],
  write: ['Writing', 'Created', 'file'],
  run: ['Running', 'Ran', 'terminal'],
  fetch: ['Fetching', 'Fetched', 'globe'],
  browse: ['Browsing', 'Browsed', 'globe'],
};

function verbFor(verb: string, running: boolean): { label: string; icon: IconName } {
  const known = VERBS[verb];
  if (known) return { label: running ? known[0] : known[1], icon: known[2] };
  return { label: verb.replace(/_/gu, ' ').replace(/^\w/u, (c) => c.toUpperCase()), icon: 'wrench' };
}

function Detail({ card }: { card: CardModel }) {
  const body = card.body;
  let rows: ReactElement[] = [];
  if (body.type === 'diff') {
    rows = body.rows.map((r, i) =>
      r.kind === 'gap' ? (
        <div key={i} className="dl gap">
          ⋯
        </div>
      ) : (
        <div key={i} className={`dl ${r.kind}`}>
          <span className="dl-n">{r.lineNo ?? ''}</span>
          <span className="dl-m">{r.kind === 'add' ? '+' : r.kind === 'del' ? '−' : ''}</span>
          <span>{r.text}</span>
        </div>
      )
    );
  } else if (body.type === 'code') {
    rows = body.lines.map((line, i) => (
      <div key={i} className="dl add">
        <span className="dl-n">{i + 1}</span>
        <span className="dl-m">+</span>
        <span>{line}</span>
      </div>
    ));
  } else if (body.type === 'text') {
    rows = body.lines.length
      ? body.lines.map((line, i) => (
          <div key={i} className={`dl plain${line.error ? ' err' : ''}`}>
            {line.text || ' '}
          </div>
        ))
      : [
          <div key="none" className="dl plain faint">
            no output
          </div>,
        ];
  }
  if (rows.length === 0) return null;
  return <div className="detail">{rows}</div>;
}

function Meta({ card }: { card: CardModel }) {
  if (card.running) return null;
  if (card.verb === 'edit' && !card.failed && card.added !== undefined) {
    return (
      <span className="step-meta">
        <span className="add">+{card.added}</span> <span className="del">−{card.removed ?? 0}</span>
      </span>
    );
  }
  return card.status ? <span className={`step-meta${card.failed ? ' err' : ''}`}>{card.status}</span> : null;
}

const ToolRow = memo(function ToolRow({ model }: { model: { kind: 'quiet'; item: QuietItem } | { kind: 'card'; card: CardModel } }) {
  const [open, setOpen] = useState(false);
  const toggle = useCallback(() => setOpen((v) => !v), []);

  if (model.kind === 'quiet') {
    const { label, icon } = verbFor(model.item.verb, model.item.running);
    return (
      <div className="step">
        <Icon name={icon} size={14} className="step-icon" />
        <span className="step-text">
          {label} <span className="step-target">{model.item.target}</span>
        </span>
        {model.item.result ? <span className="step-meta">{model.item.result}</span> : null}
      </div>
    );
  }

  const card = model.card;
  const { label, icon } = verbFor(card.verb, card.running);
  const expandable = card.body.type !== 'none';
  return (
    <div className={`step-card${open ? ' open' : ''}${card.failed ? ' failed' : ''}`}>
      <button type="button" className="step" onClick={toggle} disabled={!expandable}>
        <Icon name={card.failed ? 'alert' : icon} size={14} className="step-icon" />
        <span className="step-text">
          {label} <span className="step-target mono">{card.target}</span>
        </span>
        <Meta card={card} />
        {expandable ? <Icon name="chevronRight" size={14} className="step-chevron" /> : null}
      </button>
      {open ? <Detail card={card} /> : null}
    </div>
  );
});

function Thought({ step }: { step: ThreadStep }) {
  const [open, setOpen] = useState(false);
  const toggle = useCallback(() => setOpen((v) => !v), []);
  return (
    <div className={`step-card${open ? ' open' : ''}`}>
      <button type="button" className="step" onClick={toggle}>
        <Icon name="sparkle" size={14} className="step-icon" />
        <span className="step-text">Thought for {fmtDuration(step.durationMs ?? 0)}</span>
        <Icon name="chevronRight" size={14} className="step-chevron" />
      </button>
      {open ? <div className="thought-text">{step.content}</div> : null}
    </div>
  );
}

function Note({ step }: { step: ThreadStep }) {
  return (
    <div className="step note">
      <Icon name="message" size={14} className="step-icon" />
      <Markdown source={step.content ?? ''} className="step-text note-text" />
    </div>
  );
}

export function Steps({ thread, cwd }: { thread: Thread; cwd: string }) {
  const running = thread.status === 'running';
  const now = useNow(running, 500);
  const [override, setOverride] = useState<boolean | null>(null);
  const open = override ?? running;
  const toggle = useCallback(() => setOverride(!open), [open]);

  const visible = thread.steps.filter((s) => s.type !== 'thinking' || s.content?.trim());
  const toolCount = thread.steps.filter((s) => s.type === 'tool').length;
  const active = [...thread.steps].reverse().find((s) => s.isRunning);

  if (!running && visible.length === 0) return null;

  const elapsed = running ? now - thread.startTime : (thread.durationMs ?? 0);
  const summary = running
    ? liveLabel(active, cwd)
    : `Worked for ${fmtDuration(elapsed)}${toolCount ? ` · ${toolCount} step${toolCount === 1 ? '' : 's'}` : ''}`;

  return (
    <div className={`steps${open ? ' open' : ''}`}>
      <button type="button" className="steps-head" onClick={toggle}>
        <span className={running ? 'shimmer' : ''}>{summary}</span>
        {running ? <span className="steps-time">{fmtDuration(elapsed)}</span> : null}
        <Icon name="chevronRight" size={14} className="step-chevron" />
      </button>
      {open ? (
        <div className="steps-body">
          {visible.map((step) => {
            if (step.type === 'thinking') return step.isRunning ? null : <Thought key={step.id} step={step} />;
            if (step.type === 'note') return <Note key={step.id} step={step} />;
            return <ToolRow key={step.id} model={describeStep(step, cwd, now)} />;
          })}
        </div>
      ) : null}
    </div>
  );
}
