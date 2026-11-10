import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { createEmptyCard } from 'ts-fsrs';
import { addWord, allTags, cardToStored, db, newCustomWord, newWordFromEntry, type Word } from '../lib/db';
import { dict } from '../lib/dict';
import { hasHan, isHanChar, numberedToMarked, parsePinyin, stripViet } from '../lib/pinyin';
import { formatInterval, mastery } from '../lib/srs';
import type { DictEntry } from '../lib/types';
import { TagInput } from '../components/AddToVocab';
import { Empty, Modal, Pinyin, SpeakButton, toast } from '../components/common';

type Sort = 'new' | 'old' | 'wrong' | 'due' | 'pinyin';

export default function Vocab() {
  const words = useLiveQuery(() => db.words.toArray(), [], null);
  const tags = useLiveQuery(allTags, [], []);
  const [tag, setTag] = useState('');
  const [filter, setFilter] = useState('');
  const [sort, setSort] = useState<Sort>('new');
  const [edit, setEdit] = useState<Word | null>(null);
  const [bulk, setBulk] = useState(false);
  const [custom, setCustom] = useState(false);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [bulkTag, setBulkTag] = useState(false);

  const list = useMemo(() => {
    if (!words) return [];
    const f = stripViet(filter.trim().toLowerCase());
    let l = words.filter((w) => (!tag || w.tags.includes(tag)) &&
      (!f || w.simp.includes(f) || w.trad.includes(f) || w.pinyin.replace(/[\d\s]/g, '').includes(f.replace(/\s/g, '')) ||
        stripViet(w.meaning.toLowerCase()).includes(f) || stripViet(w.hv.toLowerCase()).includes(f)));
    const cmp: Record<Sort, (a: Word, b: Word) => number> = {
      new: (a, b) => b.createdAt - a.createdAt,
      old: (a, b) => a.createdAt - b.createdAt,
      wrong: (a, b) => b.wrong - a.wrong || a.correct - b.correct,
      due: (a, b) => a.due - b.due,
      pinyin: (a, b) => a.pinyin.localeCompare(b.pinyin),
    };
    return [...l].sort(cmp[sort]);
  }, [words, tag, filter, sort]);

  const toggle = (id: number) => setSelected((s) => {
    const n = new Set(s);
    if (n.has(id)) n.delete(id); else n.add(id);
    return n;
  });

  const delSelected = async () => {
    if (!confirm(`Xoá ${selected.size} từ khỏi vốn từ? Lịch sử ôn tập của các từ này cũng bị xoá.`)) return;
    const ids = [...selected];
    await db.transaction('rw', db.words, db.reviews, async () => {
      await db.words.bulkDelete(ids);
      await db.reviews.where('wordId').anyOf(ids).delete();
    });
    setSelected(new Set());
    toast(`Đã xoá ${ids.length} từ`);
  };

  if (words === null) return null;
  const now = Date.now();

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Vốn từ của tôi</h1>
          <p className="muted">{words.length} từ{tag && ` · tag “${tag}”: ${list.length}`}</p>
        </div>
        <div className="row gap wrap">
          <button className="btn primary" onClick={() => setBulk(true)}>＋ Thêm từ</button>
          <button className="btn ghost" onClick={() => setCustom(true)}>＋ Từ tự nhập</button>
        </div>
      </div>

      {words.length === 0 ? (
        <Empty>
          <p>Vốn từ đang trống.</p>
          <p>Bấm <b>＋ Thêm từ</b> để dán danh sách các từ đã học, hoặc vào <Link to="/tra-tu">Tra từ</Link> rồi bấm “Thêm vào vốn từ”.</p>
        </Empty>
      ) : (
        <>
          <div className="toolbar">
            <input className="input" placeholder="Lọc theo chữ, pinyin, nghĩa…" value={filter} onChange={(e) => setFilter(e.target.value)} />
            <select className="input" value={sort} onChange={(e) => setSort(e.target.value as Sort)} aria-label="Sắp xếp">
              <option value="new">Mới thêm</option>
              <option value="old">Thêm lâu nhất</option>
              <option value="due">Sắp đến hạn ôn</option>
              <option value="wrong">Hay sai nhất</option>
              <option value="pinyin">Theo pinyin</option>
            </select>
          </div>
          {tags.length > 0 && (
            <div className="tag-filter">
              <button className={'pill' + (!tag ? ' on' : '')} onClick={() => setTag('')}>Tất cả</button>
              {tags.map((t) => (
                <button key={t} className={'pill' + (tag === t ? ' on' : '')} onClick={() => setTag(t)}>{t}</button>
              ))}
            </div>
          )}
          {selected.size > 0 && (
            <div className="selbar">
              <span>Đã chọn {selected.size}</span>
              <button className="btn ghost sm" onClick={() => setBulkTag(true)}>Gắn tag</button>
              <button className="btn danger sm" onClick={delSelected}>Xoá</button>
              <button className="btn ghost sm" onClick={() => setSelected(new Set())}>Bỏ chọn</button>
            </div>
          )}
          <table className="vocab-table">
            <thead>
              <tr>
                <th><input type="checkbox" aria-label="Chọn tất cả" checked={list.length > 0 && list.every((w) => selected.has(w.id!))}
                  onChange={(e) => setSelected(e.target.checked ? new Set(list.map((w) => w.id!)) : new Set())} /></th>
                <th>Từ</th><th>Pinyin</th><th>Hán Việt</th><th>Nghĩa</th><th>Tag</th><th>Mức độ</th><th>Ôn lại</th><th>Đúng/Sai</th><th></th>
              </tr>
            </thead>
            <tbody>
              {list.map((w) => {
                const m = mastery(w);
                return (
                  <tr key={w.id}>
                    <td><input type="checkbox" checked={selected.has(w.id!)} onChange={() => toggle(w.id!)} aria-label={'Chọn ' + w.simp} /></td>
                    <td><Link to={`/tra-tu?q=${encodeURIComponent(w.simp)}`} className="han vt-han">{w.simp}</Link> <SpeakButton text={w.simp} small /></td>
                    <td><Pinyin py={w.pinyin} /></td>
                    <td className="muted">{w.hv}</td>
                    <td className="vt-mean">{w.meaning}{w.note && <div className="muted sm">📝 {w.note}</div>}</td>
                    <td>{w.tags.map((t) => <span key={t} className="tag sm">{t}</span>)}</td>
                    <td><span className={'badge ' + m.cls}>{m.label}</span></td>
                    <td className="muted sm">{w.card.state === 0 ? 'chưa học' : w.due <= now ? 'đến hạn' : formatInterval(w.due - now)}</td>
                    <td className="sm"><span className="good">{w.correct}</span> / <span className="error">{w.wrong}</span></td>
                    <td><button className="btn ghost sm" onClick={() => setEdit(w)}>Sửa</button></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </>
      )}

      {edit && <EditWord word={edit} onClose={() => setEdit(null)} />}
      {bulk && <BulkAdd onClose={() => setBulk(false)} />}
      {custom && <CustomWord onClose={() => setCustom(false)} />}
      {bulkTag && (
        <BulkTag ids={[...selected]} onClose={() => { setBulkTag(false); setSelected(new Set()); }} />
      )}
    </div>
  );
}

function EditWord({ word, onClose }: { word: Word; onClose: () => void }) {
  const [meaning, setMeaning] = useState(word.meaning);
  const [tags, setTags] = useState(word.tags);
  const [note, setNote] = useState(word.note);
  const save = async () => {
    await db.words.update(word.id!, { meaning, tags, note });
    toast('Đã lưu');
    onClose();
  };
  const reset = async () => {
    if (!confirm('Đặt lại tiến độ ôn tập của từ này về “mới”?')) return;
    const card = cardToStored(createEmptyCard(new Date()));
    await db.words.update(word.id!, { card, due: card.due, correct: 0, wrong: 0 });
    toast('Đã đặt lại tiến độ');
    onClose();
  };
  const del = async () => {
    if (!confirm(`Xoá 「${word.simp}」 khỏi vốn từ?`)) return;
    await db.words.delete(word.id!);
    await db.reviews.where('wordId').equals(word.id!).delete();
    toast('Đã xoá');
    onClose();
  };
  return (
    <Modal open onClose={onClose} title={`Sửa 「${word.simp}」`}>
      <p><Pinyin py={word.pinyin} /> {word.hv && <span className="muted">· {word.hv}</span>}</p>
      <label className="field"><span>Nghĩa</span><textarea rows={3} value={meaning} onChange={(e) => setMeaning(e.target.value)} /></label>
      <div className="field"><span>Tag</span><TagInput value={tags} onChange={setTags} /></div>
      <label className="field"><span>Ghi chú</span><input value={note} onChange={(e) => setNote(e.target.value)} /></label>
      <div className="row gap between">
        <div className="row gap">
          <button className="btn danger" onClick={del}>Xoá</button>
          <button className="btn ghost" onClick={reset}>Đặt lại tiến độ</button>
        </div>
        <div className="row gap">
          <button className="btn ghost" onClick={onClose}>Huỷ</button>
          <button className="btn primary" onClick={save}>Lưu</button>
        </div>
      </div>
    </Modal>
  );
}

function BulkTag({ ids, onClose }: { ids: number[]; onClose: () => void }) {
  const [tags, setTags] = useState<string[]>([]);
  const apply = async () => {
    await db.transaction('rw', db.words, async () => {
      for (const id of ids) {
        const w = await db.words.get(id);
        if (w) await db.words.update(id, { tags: [...new Set([...w.tags, ...tags])] });
      }
    });
    toast(`Đã gắn tag cho ${ids.length} từ`);
    onClose();
  };
  return (
    <Modal open onClose={onClose} title={`Gắn tag cho ${ids.length} từ`}>
      <TagInput value={tags} onChange={setTags} />
      <div className="row gap end"><button className="btn primary" onClick={apply} disabled={!tags.length}>Gắn tag</button></div>
    </Modal>
  );
}

interface BulkRow { input: string; meaning: string; options: DictEntry[]; pick: number; exists: boolean }

/** Thêm nhiều từ: dán danh sách, mỗi dòng một từ (có thể kèm "| nghĩa riêng") */
function BulkAdd({ onClose }: { onClose: () => void }) {
  const [text, setText] = useState('');
  const [rows, setRows] = useState<BulkRow[] | null>(null);
  const [tags, setTags] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  const parse = async () => {
    setBusy(true);
    const lines = text.split(/\n/).map((l) => l.trim()).filter(Boolean);
    const items: { w: string; m: string }[] = [];
    for (const l of lines) {
      const [w, m = ''] = l.split(/\s*[|\t]\s*/);
      // một dòng có thể chứa nhiều từ cách nhau bởi dấu phẩy / khoảng trắng
      const parts = hasHan(w) ? w.split(/[\s,，、;；]+/).filter(Boolean) : [w];
      for (const p of parts) items.push({ w: p, m: parts.length === 1 ? m : '' });
    }
    const existing = new Set((await db.words.toArray()).map((w) => w.key));
    const out: BulkRow[] = [];
    for (const it of items) {
      let options = await dict.lookup(it.w);
      if (!options.length && !hasHan(it.w)) options = (await dict.search(it.w, 'auto', 5)).map((h) => h.entry);
      out.push({ input: it.w, meaning: it.m, options, pick: 0, exists: !!options[0] && existing.has(`${options[0].s}|${options[0].p.toLowerCase()}`) });
    }
    setRows(out);
    setBusy(false);
  };

  const save = async () => {
    if (!rows) return;
    let added = 0;
    for (const r of rows) {
      const e = r.options[r.pick];
      if (!e) continue;
      if (await addWord(newWordFromEntry(e, tags, r.meaning || undefined))) added++;
    }
    toast(`Đã thêm ${added} từ vào vốn từ`);
    onClose();
  };

  return (
    <Modal open onClose={onClose} title="Thêm từ vào vốn từ" wide>
      {!rows ? (
        <>
          <p className="muted">
            Dán các từ bạn đã học, mỗi dòng một từ (hoặc cách nhau bởi dấu phẩy). Có thể ghi nghĩa riêng sau dấu <code>|</code>, ví dụ: <code>学习 | học tập</code>.
            Nghĩa, pinyin và âm Hán Việt được tự điền từ từ điển.
          </p>
          <textarea className="bulk-text han" rows={10} value={text} onChange={(e) => setText(e.target.value)} placeholder={'你好\n学习 | học\n谢谢, 再见, 朋友'} autoFocus />
          <div className="field"><span>Gắn tag cho tất cả (tuỳ chọn)</span><TagInput value={tags} onChange={setTags} /></div>
          <div className="row gap end">
            <button className="btn ghost" onClick={onClose}>Huỷ</button>
            <button className="btn primary" onClick={parse} disabled={!text.trim() || busy}>{busy ? 'Đang tra…' : 'Tra & xem trước'}</button>
          </div>
        </>
      ) : (
        <>
          <table className="bulk-table">
            <thead><tr><th>Từ</th><th>Cách đọc / nghĩa</th><th></th></tr></thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i} className={!r.options.length ? 'missing' : ''}>
                  <td className="han">{r.input}</td>
                  <td>
                    {!r.options.length ? (
                      <span className="error">Không có trong từ điển — dùng “Từ tự nhập”.</span>
                    ) : r.options.length === 1 ? (
                      <span><Pinyin py={r.options[0].p} /> · {r.meaning || r.options[0].d.slice(0, 3).join('; ')}</span>
                    ) : (
                      <select className="input" value={r.pick} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, pick: +e.target.value } : x)))}>
                        {r.options.map((o, j) => (
                          <option key={o.i} value={j}>{o.s} {numberedToMarked(o.p, true)} — {o.d.slice(0, 2).join('; ')}</option>
                        ))}
                      </select>
                    )}
                  </td>
                  <td>{r.exists && <span className="muted sm">đã có</span>}
                    <button className="icon-btn" aria-label="Bỏ" onClick={() => setRows(rows.filter((_, j) => j !== i))}>✕</button></td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="row gap end">
            <button className="btn ghost" onClick={() => setRows(null)}>← Sửa danh sách</button>
            <button className="btn primary" onClick={save}>Thêm {rows.filter((r) => r.options.length && !r.exists).length} từ</button>
          </div>
        </>
      )}
    </Modal>
  );
}

function CustomWord({ onClose }: { onClose: () => void }) {
  const [simp, setSimp] = useState('');
  const [py, setPy] = useState('');
  const [meaning, setMeaning] = useState('');
  const [hv, setHv] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const ok = [...simp].some(isHanChar) && py.trim() && meaning.trim();
  const save = async () => {
    // chuẩn hoá pinyin về dạng số nếu người dùng gõ dấu
    let pinyin = py.trim();
    if (!/\d/.test(pinyin)) {
      const syl = pinyin.split(/\s+/);
      pinyin = syl.map((s) => { const p = parsePinyin(s); return p.bare + (p.tones[0] || 5); }).join(' ');
    }
    const id = await addWord(newCustomWord(simp.trim(), pinyin, meaning.trim(), hv.trim(), tags));
    toast(id ? 'Đã thêm' : 'Từ này đã có');
    onClose();
  };
  return (
    <Modal open onClose={onClose} title="Thêm từ tự nhập">
      <p className="muted">Dùng cho từ không có trong từ điển (tên riêng, tiếng lóng…).</p>
      <label className="field"><span>Chữ Hán</span><input className="han" value={simp} onChange={(e) => setSimp(e.target.value)} /></label>
      <label className="field"><span>Pinyin (cách nhau bởi dấu cách: <code>nǐ hǎo</code> hoặc <code>ni3 hao3</code>)</span><input value={py} onChange={(e) => setPy(e.target.value)} /></label>
      <label className="field"><span>Nghĩa</span><input value={meaning} onChange={(e) => setMeaning(e.target.value)} /></label>
      <label className="field"><span>Hán Việt (tuỳ chọn)</span><input value={hv} onChange={(e) => setHv(e.target.value)} /></label>
      <div className="field"><span>Tag</span><TagInput value={tags} onChange={setTags} /></div>
      <div className="row gap end"><button className="btn primary" disabled={!ok} onClick={save}>Thêm</button></div>
    </Modal>
  );
}
