import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { addWord, allTags, db, newWordFromEntry, wordKey } from '../lib/db';
import type { DictEntry } from '../lib/types';
import { Modal, toast } from './common';

export function TagInput({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  const tags = useLiveQuery(allTags, [], []);
  const [text, setText] = useState('');
  const add = (t: string) => {
    const v = t.trim().replace(/,$/, '');
    if (v && !value.includes(v)) onChange([...value, v]);
    setText('');
  };
  const suggestions = tags.filter((t) => !value.includes(t) && t.toLowerCase().includes(text.toLowerCase())).slice(0, 12);
  return (
    <div className="tag-input">
      <div className="tag-list">
        {value.map((t) => (
          <span key={t} className="tag">
            {t}
            <button aria-label={'Bỏ ' + t} onClick={() => onChange(value.filter((x) => x !== t))}>✕</button>
          </span>
        ))}
        <input
          value={text}
          placeholder={value.length ? '' : 'Thêm tag (Enter)…'}
          onChange={(e) => (e.target.value.endsWith(',') ? add(e.target.value) : setText(e.target.value))}
          onKeyDown={(e) => {
            if (e.key === 'Enter') { e.preventDefault(); add(text); }
            else if (e.key === 'Backspace' && !text && value.length) onChange(value.slice(0, -1));
          }}
          onBlur={() => text && add(text)}
        />
      </div>
      {suggestions.length > 0 && (
        <div className="tag-sugg">
          {suggestions.map((t) => (
            <button key={t} className="pill sm" onClick={() => add(t)}>+ {t}</button>
          ))}
        </div>
      )}
    </div>
  );
}

let lastTags: string[] = [];

export function AddToVocab({ entry, compact }: { entry: DictEntry; compact?: boolean }) {
  const key = wordKey(entry.s, entry.p);
  const existing = useLiveQuery(() => db.words.where('key').equals(key).first(), [key]);
  const [open, setOpen] = useState(false);
  const [meaning, setMeaning] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [note, setNote] = useState('');

  useEffect(() => {
    if (open) {
      setMeaning(entry.d.slice(0, 4).join('; '));
      setTags(lastTags);
      setNote('');
    }
  }, [open, entry]);

  if (existing)
    return <span className={'badge saved' + (compact ? ' sm' : '')} title="Đã có trong vốn từ">✓ Trong vốn từ</span>;

  const save = async () => {
    const w = newWordFromEntry(entry, tags, meaning.trim() || entry.d[0]);
    w.note = note;
    const id = await addWord(w);
    lastTags = tags;
    setOpen(false);
    toast(id ? `Đã thêm 「${entry.s}」 vào vốn từ` : 'Từ này đã có trong vốn từ');
  };

  return (
    <>
      <button className={'btn primary' + (compact ? ' sm' : '')} onClick={(e) => { e.stopPropagation(); setOpen(true); }}>
        ＋ {compact ? 'Thêm' : 'Thêm vào vốn từ'}
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title={`Thêm 「${entry.s}」 vào vốn từ`}>
        <label className="field">
          <span>Nghĩa (bạn có thể sửa cho dễ nhớ)</span>
          <textarea rows={3} value={meaning} onChange={(e) => setMeaning(e.target.value)} />
        </label>
        <div className="field">
          <span>Tag (bài học, chủ đề…)</span>
          <TagInput value={tags} onChange={setTags} />
        </div>
        <label className="field">
          <span>Ghi chú</span>
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Mẹo nhớ, ngữ cảnh gặp từ…" />
        </label>
        <div className="row gap end">
          <button className="btn ghost" onClick={() => setOpen(false)}>Huỷ</button>
          <button className="btn primary" onClick={save}>Lưu</button>
        </div>
      </Modal>
    </>
  );
}
