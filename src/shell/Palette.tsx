'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent, type KeyboardEvent, type MouseEvent } from 'react';
import { askTool, tools } from '@/tools/registry';
import type { PaletteItem, Tool } from '@/tools/types';
import { glyphs } from '@/ui/glyphs';
import { Icon } from '@/ui/Icon';
import { useShell } from './AppShell';

const LIMIT = 40;
const none = (): PaletteItem[] => [];

function ToolItems({ tool, onItems }: { tool: Tool; onItems: (id: string, items: PaletteItem[]) => void }) {
  const items = (tool.usePalette ?? none)();
  useEffect(() => onItems(tool.id, items), [tool.id, items, onItems]);
  return null;
}

function matches(item: PaletteItem, words: string[]): boolean {
  const hay = `${item.label} ${item.detail ?? ''} ${item.group}`.toLowerCase();
  return words.every((w) => hay.includes(w));
}

export function Palette({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const { isDark, toggleTheme } = useShell();
  const ask = askTool?.useAsk?.();
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(0);
  const [toolItems, setToolItems] = useState<Record<string, PaletteItem[]>>({});
  const listRef = useRef<HTMLDivElement>(null);

  const onItems = useCallback((id: string, items: PaletteItem[]) => setToolItems((prev) => (prev[id] === items ? prev : { ...prev, [id]: items })), []);

  const base = useMemo<PaletteItem[]>(
    () => [
      { id: 'go:home', group: 'Go to', label: 'Home', glyph: glyphs.bullet, run: () => router.push('/') },
      ...tools.map((t) => ({ id: `go:${t.id}`, group: 'Go to', label: t.name, detail: t.description, glyph: glyphs.bulletOpen, run: () => router.push(t.href) })),
      { id: 'theme', group: 'Settings', label: isDark ? 'Switch to light mode' : 'Switch to dark mode', glyph: glyphs.chip, run: toggleTheme },
    ],
    [router, isDark, toggleTheme]
  );

  const items = useMemo(() => {
    const words = query.trim().toLowerCase().split(/\s+/u).filter(Boolean);
    const fromTools = tools.flatMap((t) => toolItems[t.id] ?? []);
    const all = [...fromTools, ...base];
    const found = words.length ? all.filter((i) => matches(i, words)) : all;
    const text = query.trim();
    const askItem: PaletteItem[] =
      text && ask && askTool ? [{ id: 'ask', group: 'Ask', label: text, detail: `Start a ${askTool.name} task`, glyph: glyphs.bullet, run: () => ask.submit(text) }] : [];
    return [...found.slice(0, LIMIT), ...askItem];
  }, [query, toolItems, base, ask]);

  const groups = useMemo(() => {
    const map = new Map<string, { item: PaletteItem; index: number }[]>();
    items.forEach((item, index) => map.set(item.group, [...(map.get(item.group) ?? []), { item, index }]));
    return [...map.entries()];
  }, [items]);

  useEffect(() => setSelected(0), [query]);

  useEffect(() => {
    listRef.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' });
  }, [selected]);

  const run = useCallback(
    (item: PaletteItem | undefined) => {
      if (!item) return;
      onClose();
      item.run();
    },
    [onClose]
  );

  const onKeyDown = useCallback(
    (e: KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        const step = e.key === 'ArrowDown' ? 1 : -1;
        setSelected((s) => (items.length ? (s + step + items.length) % items.length : 0));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        run(items[selected]);
      } else if (e.key === 'Escape') {
        onClose();
      }
    },
    [items, selected, run, onClose]
  );

  const onQuery = useCallback((e: ChangeEvent<HTMLInputElement>) => setQuery(e.target.value), []);
  const onPick = useCallback((e: MouseEvent<HTMLButtonElement>) => run(items[Number(e.currentTarget.dataset.index)]), [items, run]);
  const onHover = useCallback((e: MouseEvent<HTMLButtonElement>) => setSelected(Number(e.currentTarget.dataset.index)), []);
  const stop = useCallback((e: MouseEvent) => e.stopPropagation(), []);

  return (
    <div className="palette-backdrop" onClick={onClose}>
      {tools.map((t) => (t.usePalette ? <ToolItems key={t.id} tool={t} onItems={onItems} /> : null))}
      <div className="palette" onClick={stop} role="dialog" aria-label="Command palette">
        <div className="palette-input">
          <span className="palette-mark">{glyphs.bullet}</span>
          <input
            autoFocus
            value={query}
            onChange={onQuery}
            onKeyDown={onKeyDown}
            placeholder={ask ? 'Search, jump, or ask Trinity…' : 'Search or jump…'}
            spellCheck={false}
            autoCapitalize="off"
          />
          <kbd>esc</kbd>
        </div>
        <div className="palette-list" ref={listRef} role="listbox">
          {items.length === 0 ? <p className="palette-empty">Nothing matches.</p> : null}
          {groups.map(([group, entries]) => (
            <section key={group}>
              <h3 className="eyebrow">{group}</h3>
              {entries.map(({ item, index }) => (
                <button
                  key={item.id}
                  type="button"
                  role="option"
                  aria-selected={index === selected}
                  data-index={index}
                  className="palette-item"
                  onClick={onPick}
                  onMouseMove={onHover}
                >
                  <span className="glyph palette-glyph">{item.glyph ?? glyphs.bulletOpen}</span>
                  <span className="palette-label">{item.label}</span>
                  {item.detail ? <span className="palette-detail">{item.detail}</span> : null}
                  <Icon name="arrowRight" size={14} className="palette-enter" />
                </button>
              ))}
            </section>
          ))}
        </div>
        <div className="palette-foot">
          <span>
            <kbd>↑</kbd>
            <kbd>↓</kbd> move
          </span>
          <span>
            <kbd>↵</kbd> open
          </span>
          <span>
            <kbd>⌘K</kbd> toggle
          </span>
        </div>
      </div>
    </div>
  );
}
