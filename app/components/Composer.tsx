/*
 * Prompt input. Autocomplete comes from the daemon (same engine as the TUI: /commands, @files, history, intents).
 */

import { useCallback, useEffect, useRef, useState, type ChangeEvent, type KeyboardEvent, type MouseEvent } from 'react';
import { applySuggestion, type SuggestionItem } from 'morpheus/client';
import { useClient } from '../lib/morpheus';

interface ComposerProps {
  sessionId: string;
  running: boolean;
  disabled: boolean;
  onSubmit: (text: string) => void;
  onStop: () => void;
}

const AUTOCOMPLETE_DELAY_MS = 90;

function wantsSuggestions(input: string, cursor: number): boolean {
  if (input.startsWith('/')) return true;
  const before = input.slice(0, cursor);
  return /(^|\s)@\S*$/u.test(before);
}

export function Composer({ sessionId, running, disabled, onSubmit, onStop }: ComposerProps) {
  const client = useClient();
  const [value, setValue] = useState('');
  const [suggestions, setSuggestions] = useState<SuggestionItem[]>([]);
  const [selected, setSelected] = useState(0);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const requestRef = useRef(0);

  const resize = useCallback(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 220)}px`;
  }, []);

  useEffect(resize, [value, resize]);

  const refreshSuggestions = useCallback(
    (input: string, cursor: number) => {
      const ticket = ++requestRef.current;
      if (!wantsSuggestions(input, cursor)) {
        setSuggestions([]);
        return;
      }
      setTimeout(() => {
        if (ticket !== requestRef.current) return;
        client
          .request('autocomplete', { sessionId, input, cursorPos: cursor })
          .then((res) => {
            if (ticket !== requestRef.current) return;
            setSuggestions(res.suggestions.slice(0, 8));
            setSelected(0);
          })
          .catch(() => setSuggestions([]));
      }, AUTOCOMPLETE_DELAY_MS);
    },
    [client, sessionId]
  );

  const onChange = useCallback(
    (e: ChangeEvent<HTMLTextAreaElement>) => {
      setValue(e.target.value);
      refreshSuggestions(e.target.value, e.target.selectionStart ?? e.target.value.length);
    },
    [refreshSuggestions]
  );

  const accept = useCallback(
    (item: SuggestionItem) => {
      const el = inputRef.current;
      const cursor = el?.selectionStart ?? value.length;
      const { newValue, newCursorPos } = applySuggestion(value, cursor, item);
      setValue(newValue);
      setSuggestions([]);
      requestRef.current++;
      requestAnimationFrame(() => {
        el?.focus();
        el?.setSelectionRange(newCursorPos, newCursorPos);
      });
    },
    [value]
  );

  const submit = useCallback(() => {
    const text = value.trim();
    if (!text || disabled) return;
    onSubmit(text);
    setValue('');
    setSuggestions([]);
    requestRef.current++;
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
        else if (running) onStop();
        return;
      }
      if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
        e.preventDefault();
        submit();
      }
    },
    [suggestions, selected, value, accept, running, onStop, submit]
  );

  const pick = useCallback((e: MouseEvent<HTMLButtonElement>) => {
    const index = Number(e.currentTarget.dataset.index);
    if (suggestions[index]) accept(suggestions[index]);
  }, [suggestions, accept]);

  const showStop = running && !value.trim();

  return (
    <div className="composer">
      {suggestions.length > 0 ? (
        <ul className="suggestions" role="listbox">
          {suggestions.map((s, i) => (
            <li key={s.id} role="option" aria-selected={i === selected}>
              <button type="button" data-index={i} className={i === selected ? 'active' : ''} onMouseDown={pick}>
                <span className={`cat cat-${s.category}`}>{s.label}</span>
                {s.detail ? <span className="muted"> {s.detail}</span> : null}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      <div className="composer-row">
        <span className="accent prompt-glyph">❯</span>
        <textarea
          ref={inputRef}
          rows={1}
          value={value}
          onChange={onChange}
          onKeyDown={onKeyDown}
          placeholder={running ? 'type to queue · /command · esc to stop' : 'ask morpheus · /command · @file'}
          disabled={disabled}
          spellCheck={false}
          autoCapitalize="off"
          autoCorrect="off"
        />
        {showStop ? (
          <button type="button" className="send stop" onClick={onStop}>
            stop
          </button>
        ) : (
          <button type="button" className="send" onClick={submit} disabled={disabled || !value.trim()}>
            {running ? 'queue' : 'send'}
          </button>
        )}
      </div>
    </div>
  );
}
