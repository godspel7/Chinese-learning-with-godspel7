import { useEffect, useState } from 'react';
import { dict } from '../lib/dict';
import { numberedToMarked, syllableTone } from '../lib/pinyin';
import type { DictEntry, Token } from '../lib/types';
import { SpeakButton } from './common';

/** Câu tiếng Trung có pinyin phía trên từng từ; bấm vào từ để tra */
export function SentenceView({
  zh, showPinyin = true, highlight, onWordClick,
}: { zh: string; showPinyin?: boolean; highlight?: string[]; onWordClick?: (e: DictEntry) => void }) {
  const [tokens, setTokens] = useState<Token[] | null>(null);
  useEffect(() => {
    let live = true;
    dict.segment(zh).then((t) => live && setTokens(t));
    return () => { live = false; };
  }, [zh]);

  if (!tokens) return <span className="han sentence">{zh}</span>;
  return (
    <span className="han sentence">
      {tokens.map((t, i) => {
        const hl = highlight?.some((h) => h && (t.w.includes(h) || h.includes(t.w)) && t.entry);
        if (!t.entry) return <span key={i} className="tok punct">{t.w}</span>;
        const syl = t.entry.p.split(' ');
        return (
          <ruby
            key={i}
            className={'tok' + (hl ? ' hl' : '') + (onWordClick ? ' click' : '')}
            onClick={onWordClick ? () => onWordClick(t.entry!) : undefined}
            title={t.entry.d.slice(0, 2).join('; ')}
          >
            {t.w}
            <rt className={showPinyin ? '' : 'hidden'}>
              {syl.map((s, j) => (
                <span key={j} className={'tone' + syllableTone(s)}>{numberedToMarked(s)}</span>
              ))}
            </rt>
          </ruby>
        );
      })}
      <SpeakButton text={zh} small />
    </span>
  );
}
