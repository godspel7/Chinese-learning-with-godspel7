import { useEffect, useRef, useState } from 'react';
import { dict } from '../lib/dict';
import type { DictEntry, SearchHit, SearchMode } from '../lib/types';
import { HandwritingPad } from './HandwritingPad';
import { HskBadge, Pinyin } from './common';

export const MODES: { id: SearchMode; label: string }[] = [
  { id: 'auto', label: 'Tự động' },
  { id: 'pinyin', label: 'Pinyin' },
  { id: 'hanviet', label: 'Hán Việt' },
  { id: 'meaning', label: 'Nghĩa' },
];

const VIA: Record<string, string> = { pinyin: 'pinyin', hanviet: 'Hán Việt', meaning: 'nghĩa', hanzi: 'chữ' };

interface Props {
  value: string;
  onChange: (v: string) => void;
  mode: SearchMode;
  onModeChange: (m: SearchMode) => void;
  onSubmit: (q: string) => void;
  onPick: (e: DictEntry) => void;
  autoFocus?: boolean;
  big?: boolean;
}

export function SearchBox({ value, onChange, mode, onModeChange, onSubmit, onPick, autoFocus, big }: Props) {
  const [sugg, setSugg] = useState<SearchHit[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [hw, setHw] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const reqId = useRef(0);

  useEffect(() => {
    const q = value.trim();
    if (!q) { setSugg([]); return; }
    const id = ++reqId.current;
    const t = setTimeout(async () => {
      const r = await dict.search(q, mode, 8);
      if (id === reqId.current) { setSugg(r); setActive(-1); }
    }, 90);
    return () => clearTimeout(t);
  }, [value, mode]);

  const pick = (e: DictEntry) => {
    setOpen(false);
    onPick(e);
  };

  return (
    <div className={'searchbox' + (big ? ' big' : '')}>
      <div className="search-row">
        <div className="search-input-wrap">
          <svg className="search-ico" viewBox="0 0 24 24" width="20" height="20" aria-hidden>
            <path fill="currentColor" d="M10 2a8 8 0 0 1 6.3 12.9l5.4 5.4-1.4 1.4-5.4-5.4A8 8 0 1 1 10 2zm0 2a6 6 0 1 0 0 12 6 6 0 0 0 0-12z" />
          </svg>
          <input
            ref={input}
            className="search-input"
            value={value}
            autoFocus={autoFocus}
            placeholder="Gõ chữ Hán, pinyin (nihao / ni3hao3 / nǐhǎo), âm Hán Việt hoặc nghĩa…"
            onChange={(e) => { onChange(e.target.value); setOpen(true); }}
            onBlur={() => setTimeout(() => setOpen(false), 150)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') { e.preventDefault(); setOpen(true); setActive((a) => Math.min(a + 1, sugg.length - 1)); }
              else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(a - 1, -1)); }
              else if (e.key === 'Enter') {
                if (open && active >= 0 && sugg[active]) pick(sugg[active].entry);
                else { setOpen(false); onSubmit(value); }
              } else if (e.key === 'Escape') setOpen(false);
            }}
            aria-autocomplete="list"
            aria-expanded={open && sugg.length > 0}
          />
          {value && (
            <button className="icon-btn clear-btn" aria-label="Xoá" onClick={() => { onChange(''); input.current?.focus(); }}>✕</button>
          )}
          {open && sugg.length > 0 && (
            <ul className="suggest" role="listbox">
              {sugg.map((h, i) => (
                <li
                  key={h.entry.i}
                  role="option"
                  aria-selected={i === active}
                  className={i === active ? 'active' : ''}
                  onMouseDown={(e) => { e.preventDefault(); pick(h.entry); }}
                  onMouseEnter={() => setActive(i)}
                >
                  <span className="han sg-han">{h.entry.s}</span>
                  <Pinyin py={h.entry.p} className="sg-py" />
                  {h.entry.hv && <span className="sg-hv">{h.entry.hv}</span>}
                  <span className="sg-def">{h.entry.d.slice(0, 2).join('; ')}</span>
                  <HskBadge hn={h.entry.hn} ho={h.entry.ho} />
                  <span className="sg-via">{VIA[h.via]}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
        <button className={'btn ' + (hw ? 'primary' : 'ghost')} onClick={() => setHw((x) => !x)} title="Viết tay">
          ✍ Viết tay
        </button>
      </div>
      <div className="mode-row" role="radiogroup" aria-label="Kiểu tra">
        {MODES.map((m) => (
          <button key={m.id} role="radio" aria-checked={mode === m.id} className={'pill' + (mode === m.id ? ' on' : '')} onClick={() => onModeChange(m.id)}>
            {m.label}
          </button>
        ))}
      </div>
      {hw && (
        <div className="hw-wrap">
          <HandwritingPad onPick={(c) => { onChange(value + c); setOpen(true); input.current?.focus(); }} />
        </div>
      )}
    </div>
  );
}
