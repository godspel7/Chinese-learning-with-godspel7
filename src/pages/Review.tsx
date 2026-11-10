import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { allTags, db, getSetting, setSetting, type Word } from '../lib/db';
import { dueQueue, GRADES, gradeWord, previewIntervals } from '../lib/srs';
import { speak } from '../lib/tts';
import { Empty, Pinyin, SpeakButton, Spinner } from '../components/common';
import type { Grade } from 'ts-fsrs';

type Dir = 'h2m' | 'm2h' | 'audio';
const DIRS: { id: Dir; label: string }[] = [
  { id: 'h2m', label: 'Chữ Hán → nghĩa' },
  { id: 'm2h', label: 'Nghĩa → chữ Hán' },
  { id: 'audio', label: 'Nghe → nghĩa' },
];

export default function Review() {
  const tags = useLiveQuery(allTags, [], []);
  const [tag, setTag] = useState('');
  const [dir, setDir] = useState<Dir>('h2m');
  const [newLimit, setNewLimit] = useState(20);
  const [queue, setQueue] = useState<Word[] | null>(null);
  const [idx, setIdx] = useState(0);
  const [shown, setShown] = useState(false);
  const [doneCount, setDoneCount] = useState(0);
  const [started, setStarted] = useState(false);

  useEffect(() => {
    getSetting('newPerDay', 20).then(setNewLimit);
    getSetting<Dir>('reviewDir', 'h2m').then(setDir);
  }, []);

  const reload = useCallback(async () => {
    setQueue(null);
    setQueue(await dueQueue(newLimit, tag || undefined));
    setIdx(0);
    setShown(false);
  }, [newLimit, tag]);

  useEffect(() => { reload(); }, [reload]);

  const cur = queue?.[idx];

  useEffect(() => {
    if (started && cur && dir === 'audio' && !shown) speak(cur.simp);
  }, [started, cur, dir, shown]);

  const reveal = () => {
    setShown(true);
    if (cur && dir !== 'audio') speak(cur.simp);
  };

  const grade = useCallback(async (g: Grade) => {
    if (!cur || !queue) return;
    await gradeWord(cur, g);
    const updated = await db.words.get(cur.id!);
    const next = [...queue];
    // nếu từ cần ôn lại ngay trong phiên (dưới 20 phút) thì đưa xuống cuối hàng đợi
    if (updated && updated.due - Date.now() < 20 * 60000) next.push(updated);
    setQueue(next);
    setIdx((i) => i + 1);
    setShown(false);
    setDoneCount((c) => c + 1);
  }, [cur, queue]);

  useEffect(() => {
    if (!started) return;
    const h = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).tagName === 'INPUT') return;
      if (e.code === 'Space' || e.key === 'Enter') { e.preventDefault(); if (!shown) reveal(); }
      else if (shown && ['1', '2', '3', '4'].includes(e.key)) grade(+e.key as Grade);
      else if (e.key.toLowerCase() === 'r' && cur) speak(cur.simp);
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  });

  if (!queue) return <Spinner />;

  if (!started) {
    const news = queue.filter((w) => w.card.state === 0).length;
    return (
      <div className="page narrow">
        <h1>Ôn tập</h1>
        <p className="muted">Thuật toán lặp lại ngắt quãng (FSRS) sẽ hỏi lại từ đúng lúc bạn sắp quên.</p>
        <div className="card setup">
          <div className="big-stat">
            <div><b>{queue.length - news}</b><span>từ cần ôn</span></div>
            <div><b>{news}</b><span>từ mới</span></div>
          </div>
          <div className="field">
            <span>Kiểu thẻ</span>
            <div className="row gap wrap">
              {DIRS.map((d) => (
                <button key={d.id} className={'pill' + (dir === d.id ? ' on' : '')} onClick={() => { setDir(d.id); setSetting('reviewDir', d.id); }}>{d.label}</button>
              ))}
            </div>
          </div>
          {tags.length > 0 && (
            <label className="field"><span>Chỉ ôn tag</span>
              <select className="input" value={tag} onChange={(e) => setTag(e.target.value)}>
                <option value="">Tất cả</option>
                {tags.map((t) => <option key={t}>{t}</option>)}
              </select>
            </label>
          )}
          <label className="field"><span>Số từ mới tối đa mỗi ngày</span>
            <input className="input" type="number" min={0} max={200} value={newLimit}
              onChange={(e) => { const v = Math.max(0, +e.target.value || 0); setNewLimit(v); setSetting('newPerDay', v); }} />
          </label>
          {queue.length ? (
            <button className="btn primary lg" onClick={() => setStarted(true)}>Bắt đầu ôn ({queue.length})</button>
          ) : (
            <Empty>🎉 Không có từ nào cần ôn lúc này. <Link to="/kiem-tra">Làm bài kiểm tra</Link> hoặc <Link to="/von-tu">thêm từ mới</Link>.</Empty>
          )}
        </div>
      </div>
    );
  }

  if (!cur) {
    return (
      <div className="page narrow">
        <div className="card center-text">
          <h2>🎉 Xong phiên ôn tập!</h2>
          <p>Bạn đã ôn {doneCount} lượt.</p>
          <div className="row gap center">
            <button className="btn primary" onClick={() => { setStarted(false); setDoneCount(0); reload(); }}>Về trang ôn tập</button>
            <Link className="btn ghost" to="/kiem-tra">Làm bài kiểm tra</Link>
          </div>
        </div>
      </div>
    );
  }

  const iv = shown ? previewIntervals(cur) : null;
  return (
    <div className="page narrow">
      <div className="progress"><div style={{ width: `${(idx / queue.length) * 100}%` }} /></div>
      <div className="muted sm row between"><span>{idx + 1} / {queue.length}</span>{cur.card.state === 0 && <span className="badge m-new">Từ mới</span>}</div>
      <div className="flash card">
        <div className="flash-front">
          {dir === 'h2m' && <span className="han flash-han">{cur.simp}</span>}
          {dir === 'm2h' && <span className="flash-mean">{cur.meaning}</span>}
          {dir === 'audio' && <button className="btn ghost lg" onClick={() => speak(cur.simp)}>🔊 Nghe lại (R)</button>}
        </div>
        {shown ? (
          <div className="flash-back">
            {dir !== 'h2m' && <span className="han flash-han">{cur.simp}</span>}
            <div className="row gap center center-v"><Pinyin py={cur.pinyin} className="lg" /><SpeakButton text={cur.simp} /></div>
            {cur.hv && <div className="hv">{cur.hv}</div>}
            {dir !== 'm2h' && <div className="flash-mean">{cur.meaning}</div>}
            {cur.trad !== cur.simp && <div className="muted">Phồn thể: <span className="han">{cur.trad}</span></div>}
            {cur.note && <div className="muted">📝 {cur.note}</div>}
            <Link className="link sm" to={`/tra-tu?q=${encodeURIComponent(cur.simp)}`} target="_blank">Xem chi tiết ↗</Link>
          </div>
        ) : (
          <button className="btn primary lg" onClick={reveal}>Hiện đáp án (Space)</button>
        )}
      </div>
      {shown && iv && (
        <div className="grades">
          {GRADES.map((g) => (
            <button key={g.grade} className={'grade ' + g.cls} onClick={() => grade(g.grade)}>
              <b>{g.label}</b>
              <span>{iv[g.grade]}</span>
              <kbd>{g.key}</kbd>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
