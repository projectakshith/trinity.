import { useCallback, useEffect, useRef, useState, type ChangeEvent, type KeyboardEvent, type MouseEvent } from 'react';
import { Icon } from './Icon';

export interface Suggestion {
  id: string;
  label: string;
  detail?: string;
  insertText: string;
  replaceRange?: { start: number; end: number };
}

export interface Autocomplete {
  wants: (input: string, cursor: number) => boolean;
  fetch: (input: string, cursor: number) => Promise<Suggestion[]>;
  apply: (input: string, cursor: number, item: Suggestion) => { newValue: string; newCursorPos: number };
}

interface ComposerProps {
  autocomplete?: Autocomplete;
  placeholder: string;
  running?: boolean;
  disabled?: boolean;
  autoFocus?: boolean;
  toolLabel?: string;
  meta?: string;
  onSubmit: (text: string) => void;
  onStop?: () => void;
}

const SUGGEST_DELAY_MS = 90;

export function Composer({ autocomplete, placeholder, running = false, disabled = false, autoFocus = false, toolLabel, meta, onSubmit, onStop }: ComposerProps) {
  const [value, setValue] = useState('');
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [selected, setSelected] = useState(0);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const ticketRef = useRef(0);

  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 240)}px`;
  }, [value]);

  useEffect(() => {
    if (autoFocus && window.matchMedia('(pointer: fine)').matches) inputRef.current?.focus();
  }, [autoFocus]);

  const suggest = useCallback(
    (input: string, cursor: number) => {
      const ticket = ++ticketRef.current;
      if (!autocomplete?.wants(input, cursor)) {
        setSuggestions([]);
        return;
      }
      setTimeout(() => {
        if (ticket !== ticketRef.current) return;
        autocomplete
          .fetch(input, cursor)
          .then((items) => {
            if (ticket !== ticketRef.current) return;
            setSuggestions(items.slice(0, 7));
            setSelected(0);
          })
          .catch(() => setSuggestions([]));
      }, SUGGEST_DELAY_MS);
    },
    [autocomplete]
  );

  const onChange = useCallback(
    (e: ChangeEvent<HTMLTextAreaElement>) => {
      setValue(e.target.value);
      suggest(e.target.value, e.target.selectionStart ?? e.target.value.length);
    },
    [suggest]
  );

  const accept = useCallback(
    (item: Suggestion) => {
      if (!autocomplete) return;
      const el = inputRef.current;
      const { newValue, newCursorPos } = autocomplete.apply(value, el?.selectionStart ?? value.length, item);
      setValue(newValue);
      setSuggestions([]);
      ticketRef.current++;
      requestAnimationFrame(() => {
        el?.focus();
        el?.setSelectionRange(newCursorPos, newCursorPos);
      });
    },
    [autocomplete, value]
  );

  const submit = useCallback(() => {
    const text = value.trim();
    if (!text || disabled) return;
    onSubmit(text);
    setValue('');
    setSuggestions([]);
    ticketRef.current++;
  }, [value, disabled, onSubmit]);

  const onKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      if (suggestions.length > 0) {
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
          e.preventDefault();
          const step = e.key === 'ArrowDown' ? 1 : -1;
          setSelected((s) => (s + step + suggestions.length) % suggestions.length);
          return;
        }
        if (e.key === 'Tab' || (e.key === 'Enter' && !e.shiftKey && suggestions[selected]?.insertText.trim() !== value.trim())) {
          e.preventDefault();
          accept(suggestions[selected]);
          return;
        }
      }
      if (e.key === 'Escape') {
        if (suggestions.length > 0) setSuggestions([]);
        else if (running) onStop?.();
        return;
      }
      if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
        e.preventDefault();
        submit();
      }
    },
    [suggestions, selected, value, accept, running, onStop, submit]
  );

  const pick = useCallback(
    (e: MouseEvent<HTMLButtonElement>) => {
      e.preventDefault();
      const item = suggestions[Number(e.currentTarget.dataset.index)];
      if (item) accept(item);
    },
    [suggestions, accept]
  );

  const showStop = running && !value.trim() && Boolean(onStop);

  return (
    <div className="composer-wrap">
      {suggestions.length > 0 ? (
        <ul className="menu suggestions" role="listbox">
          {suggestions.map((s, i) => (
            <li key={s.id} role="option" aria-selected={i === selected}>
              <button type="button" data-index={i} className={i === selected ? 'active' : ''} onMouseDown={pick}>
                <span className="mono">{s.label}</span>
                {s.detail ? <span className="faint"> {s.detail}</span> : null}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      <div className={`composer${toolLabel ? '' : ' inline'}${disabled ? ' is-disabled' : ''}`}>
        <textarea
          ref={inputRef}
          rows={1}
          value={value}
          onChange={onChange}
          onKeyDown={onKeyDown}
          placeholder={placeholder}
          disabled={disabled}
          spellCheck={false}
          autoCapitalize="sentences"
        />
        <div className="composer-bar">
          {toolLabel ? (
            <span className="tool-chip">
              <span className="tool-dot" />
              {toolLabel}
            </span>
          ) : null}
          {showStop ? (
            <button type="button" className="round-btn stop" onClick={onStop} aria-label="stop">
              <Icon name="stop" size={14} />
            </button>
          ) : (
            <button type="button" className="round-btn" onClick={submit} disabled={disabled || !value.trim()} aria-label={running ? 'queue message' : 'send'}>
              <Icon name="arrowUp" size={16} />
            </button>
          )}
        </div>
      </div>
      {meta ? <div className="composer-meta">{meta}</div> : null}
    </div>
  );
}
