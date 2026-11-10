import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { allTags, db, recordQuiz, type Word } from '../lib/db';
import { isHanChar } from '../lib/pinyin';
import { Empty, Pinyin, SpeakButton, Spinner } from '../components/common';
import { StrokeAnim, WriteQuiz } from '../components/StrokeOrder';

export default function Writing() {
  const words = useLiveQuery(() => db.words.toArray(), [], null);
  const tags = useLiveQuery(allTags, [], []);
  const [tag, setTag] = useState('');
  const [order, setOrder] = useState<Word[]>([]);
  const [wi, setWi] = useState(0);
  const [ci, setCi] = useState(0);
  const [outline, setOutline] = useState(true);
  const [custom, setCustom] = useState('');
  const [customChars, setCustomChars] = useState<string[] | null>(null);
  const [mistakes, setMistakes] = useState(0);
  const [doneWord, setDoneWord] = useState(false);

  const pool = useMemo(() => (words || []).filter((w) => !tag || w.tags.includes(tag)), [words, tag]);

  useEffect(() => {
    setOrder([...pool].sort(() => Math.random() - 0.5));
    setWi(0); setCi(0); setDoneWord(false); setMistakes(0);
  }, [pool]);

  if (words === null) return <Spinner />;

  const w = order[wi];
  const chars = customChars ?? (w ? [...w.simp].filter(isHanChar) : []);
  const ch = chars[ci];

  const nextWord = () => {
    setCustomChars(null);
    setWi((x) => (x + 1) % Math.max(1, order.length));
    setCi(0); setDoneWord(false); setMistakes(0);
  };

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Luyện viết</h1>
          <p className="muted">Viết từng nét theo đúng thứ tự, sai nét sẽ được nhắc lại.</p>
        </div>
        <form className="row gap" onSubmit={(e) => {
          e.preventDefault();
          const cs = [...custom].filter(isHanChar);
          if (cs.length) { setCustomChars(cs); setCi(0); setDoneWord(false); setMistakes(0); }
        }}>
          <input className="input han" value={custom} onChange={(e) => setCustom(e.target.value)} placeholder="Gõ chữ bất kỳ để luyện…" />
          <button className="btn ghost">Luyện chữ này</button>
        </form>
      </div>

      <div className="toolbar">
        {tags.length > 0 && (
          <select className="input" value={tag} onChange={(e) => setTag(e.target.value)} aria-label="Tag">
            <option value="">Tất cả vốn từ ({words.length})</option>
            {tags.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        )}
        <label className="check"><input type="checkbox" checked={outline} onChange={(e) => setOutline(e.target.checked)} /> Hiện chữ mờ để tô theo</label>
      </div>

      {!ch ? (
        <Empty>Vốn từ đang trống. <Link to="/von-tu">Thêm từ</Link> hoặc gõ một chữ ở ô bên trên để luyện.</Empty>
      ) : (
        <div className="writing-grid">
          <div className="card center-text">
            {!customChars && w && (
              <>
                <div className="flash-mean">{w.meaning}</div>
                <div className="row gap center center-v"><Pinyin py={w.pinyin} className="lg" /><SpeakButton text={w.simp} /></div>
                {w.hv && <div className="hv">{w.hv}</div>}
              </>
            )}
            <div className="write-progress">
              {chars.map((c, k) => (
                <span key={k} className={'han wp ' + (k < ci || doneWord ? 'done' : k === ci ? 'cur' : '')}>{k < ci || doneWord || outline ? c : '?'}</span>
              ))}
            </div>
            {!doneWord ? (
              <WriteQuiz key={`${wi}-${ci}-${customChars?.join('')}-${outline}`} ch={ch} showOutline={outline} size={300}
                onDone={(m) => {
                  const total = mistakes + m;
                  setMistakes(total);
                  if (ci + 1 < chars.length) setCi(ci + 1);
                  else {
                    setDoneWord(true);
                    if (!customChars && w) recordQuiz(w.id!, total <= chars.length * 3, 'write', 'write');
                  }
                }} />
            ) : (
              <div className="feedback ok">
                <b>✓ Hoàn thành — sai {mistakes} nét</b>
                <span className="han fb-han">{chars.join('')}</span>
                <div className="row gap center">
                  <button className="btn ghost" onClick={() => { setCi(0); setDoneWord(false); setMistakes(0); }}>Viết lại</button>
                  <button className="btn primary" autoFocus onClick={nextWord}>Từ tiếp theo →</button>
                </div>
              </div>
            )}
          </div>
          <div className="card">
            <h3>Thứ tự nét</h3>
            <div className="row gap wrap">
              {chars.map((c, k) => <StrokeAnim key={k + c} ch={c} size={120} />)}
            </div>
            {!customChars && order.length > 1 && (
              <button className="btn ghost" onClick={nextWord}>Bỏ qua →</button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
