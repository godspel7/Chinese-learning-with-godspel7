import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { allTags, db, recordQuiz, type Word } from '../lib/db';
import { dict } from '../lib/dict';
import { isHanChar, pinyinAnswerMatches } from '../lib/pinyin';
import { speak } from '../lib/tts';
import { Empty, Pinyin, SpeakButton, Spinner, pinyinText } from '../components/common';
import { WriteQuiz } from '../components/StrokeOrder';

type QType = 'h2m' | 'm2h' | 'h2p' | 'listen' | 'hv' | 'write';
const QTYPES: { id: QType; label: string; desc: string }[] = [
  { id: 'h2m', label: 'Chữ → nghĩa', desc: 'Nhìn chữ Hán, chọn nghĩa đúng' },
  { id: 'm2h', label: 'Nghĩa → chữ', desc: 'Đọc nghĩa, chọn chữ Hán đúng' },
  { id: 'h2p', label: 'Gõ pinyin', desc: 'Gõ pinyin có thanh điệu (ni3hao3 hoặc nǐhǎo)' },
  { id: 'listen', label: 'Nghe', desc: 'Nghe phát âm, chọn chữ Hán' },
  { id: 'hv', label: 'Hán Việt', desc: 'Nhìn chữ Hán, chọn âm Hán Việt' },
  { id: 'write', label: 'Viết tay', desc: 'Đọc nghĩa + pinyin, tự viết chữ' },
];
type Source = 'all' | 'tag' | 'recent' | 'wrong' | 'due';

interface Option { label: string; correct: boolean }
interface Question { word: Word; type: QType; options: Option[] }
interface Result { q: Question; correct: boolean; answer: string }

const shuffle = <T,>(a: T[]) => {
  const b = [...a];
  for (let i = b.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [b[i], b[j]] = [b[j], b[i]];
  }
  return b;
};
const short = (m: string) => m.split(/;\s*/).slice(0, 2).join('; ');

async function buildQuestions(words: Word[], all: Word[], types: QType[]): Promise<Question[]> {
  const qs: Question[] = [];
  for (const w of words) {
    let type = types[Math.floor(Math.random() * types.length)];
    if (type === 'hv' && !w.hv) type = 'h2m';
    const len = [...w.simp].length;
    const others = shuffle(all.filter((o) => o.id !== w.id && o.simp !== w.simp));
    let pool = others.map((o) => ({ simp: o.simp, meaning: o.meaning, hv: o.hv, len: [...o.simp].length }));
    if (pool.length < 8) {
      const extra = await dict.random(10, len, [w.simp, ...pool.map((p) => p.simp)]);
      pool = pool.concat(extra.map((e) => ({ simp: e.s, meaning: e.d.slice(0, 2).join('; '), hv: e.hv, len: [...e.s].length })));
    }
    // ưu tiên phương án nhiễu có cùng số chữ
    pool.sort((a, b) => Number(b.len === len) - Number(a.len === len));
    let options: Option[] = [];
    const pick = (field: 'simp' | 'meaning' | 'hv', correct: string) => {
      const seen = new Set([correct]);
      const wrong: string[] = [];
      for (const p of pool) {
        const v = field === 'meaning' ? short(p.meaning) : p[field];
        if (v && !seen.has(v)) { seen.add(v); wrong.push(v); }
        if (wrong.length === 3) break;
      }
      return shuffle([{ label: correct, correct: true }, ...wrong.map((l) => ({ label: l, correct: false }))]);
    };
    if (type === 'h2m') options = pick('meaning', short(w.meaning));
    else if (type === 'm2h' || type === 'listen') options = pick('simp', w.simp);
    else if (type === 'hv') options = pick('hv', w.hv);
    qs.push({ word: w, type, options });
  }
  return qs;
}

export default function Quiz() {
  const words = useLiveQuery(() => db.words.toArray(), [], null);
  const tags = useLiveQuery(allTags, [], []);
  const [source, setSource] = useState<Source>('all');
  const [tag, setTag] = useState('');
  const [count, setCount] = useState(10);
  const [types, setTypes] = useState<QType[]>(['h2m', 'm2h', 'h2p', 'listen']);
  const [qs, setQs] = useState<Question[] | null>(null);
  const [i, setI] = useState(0);
  const [results, setResults] = useState<Result[]>([]);
  const [answered, setAnswered] = useState<Result | null>(null);
  const [building, setBuilding] = useState(false);

  if (words === null) return <Spinner />;

  const start = async (subset?: Word[]) => {
    setBuilding(true);
    let pool = words;
    if (!subset) {
      if (source === 'tag' && tag) pool = words.filter((w) => w.tags.includes(tag));
      if (source === 'recent') pool = [...words].sort((a, b) => b.createdAt - a.createdAt).slice(0, Math.max(count, 20));
      if (source === 'wrong') pool = [...words].filter((w) => w.wrong > 0).sort((a, b) => b.wrong - b.correct * 0.5 - (a.wrong - a.correct * 0.5));
      if (source === 'due') pool = words.filter((w) => w.due <= Date.now());
    }
    const chosen = subset ?? (source === 'wrong' ? pool.slice(0, count) : shuffle(pool).slice(0, count));
    const q = await buildQuestions(chosen, words, types);
    setQs(shuffle(q));
    setI(0);
    setResults([]);
    setAnswered(null);
    setBuilding(false);
  };

  const answer = async (correct: boolean, ans: string) => {
    if (!qs || answered) return;
    const r = { q: qs[i], correct, answer: ans };
    setAnswered(r);
    setResults((x) => [...x, r]);
    await recordQuiz(qs[i].word.id!, correct, qs[i].type, qs[i].type === 'write' ? 'write' : 'quiz');
    if (qs[i].type !== 'listen' && qs[i].type !== 'write') speak(qs[i].word.simp);
  };

  const next = () => {
    setAnswered(null);
    setI((x) => x + 1);
  };

  // --- màn hình cấu hình ---
  if (!qs) {
    return (
      <div className="page narrow">
        <h1>Kiểm tra nhanh</h1>
        {words.length < 4 ? (
          <Empty>Cần ít nhất 4 từ trong vốn từ để tạo bài kiểm tra. <Link to="/von-tu">Thêm từ</Link></Empty>
        ) : (
          <div className="card setup">
            <div className="field">
              <span>Lấy từ</span>
              <div className="row gap wrap">
                {([['all', 'Tất cả'], ['recent', 'Mới thêm gần đây'], ['wrong', 'Hay sai'], ['due', 'Đến hạn ôn'], ['tag', 'Theo tag']] as [Source, string][]).map(([id, l]) => (
                  <button key={id} className={'pill' + (source === id ? ' on' : '')} onClick={() => setSource(id)} disabled={id === 'tag' && !tags.length}>{l}</button>
                ))}
              </div>
            </div>
            {source === 'tag' && (
              <label className="field"><span>Tag</span>
                <select className="input" value={tag} onChange={(e) => setTag(e.target.value)}>
                  <option value="">— chọn tag —</option>
                  {tags.map((t) => <option key={t}>{t}</option>)}
                </select>
              </label>
            )}
            <div className="field">
              <span>Số câu</span>
              <div className="row gap">
                {[5, 10, 20, 30, 50].map((n) => (
                  <button key={n} className={'pill' + (count === n ? ' on' : '')} onClick={() => setCount(n)}>{n}</button>
                ))}
              </div>
            </div>
            <div className="field">
              <span>Dạng câu hỏi</span>
              <div className="qtypes">
                {QTYPES.map((t) => (
                  <label key={t.id} className={'qtype' + (types.includes(t.id) ? ' on' : '')}>
                    <input type="checkbox" checked={types.includes(t.id)}
                      onChange={(e) => setTypes(e.target.checked ? [...types, t.id] : types.filter((x) => x !== t.id))} />
                    <b>{t.label}</b><span>{t.desc}</span>
                  </label>
                ))}
              </div>
            </div>
            <button className="btn primary lg" disabled={!types.length || building || (source === 'tag' && !tag)} onClick={() => start()}>
              {building ? 'Đang tạo…' : 'Bắt đầu'}
            </button>
          </div>
        )}
      </div>
    );
  }

  // --- kết quả ---
  if (i >= qs.length) {
    const right = results.filter((r) => r.correct).length;
    const wrong = results.filter((r) => !r.correct);
    return (
      <div className="page narrow">
        <div className="card center-text">
          <h2>Kết quả: {right}/{results.length}</h2>
          <div className="score-ring" style={{ ['--p' as string]: `${(right / Math.max(1, results.length)) * 100}` }}>
            <span>{Math.round((right / Math.max(1, results.length)) * 100)}%</span>
          </div>
        </div>
        {wrong.length > 0 && (
          <div className="card">
            <h3>Các từ trả lời sai</h3>
            <ul className="wrong-list">
              {wrong.map((r, k) => (
                <li key={k}>
                  <span className="han">{r.q.word.simp}</span> <Pinyin py={r.q.word.pinyin} /> — {r.q.word.meaning}
                  {r.answer && <span className="muted sm"> (bạn trả lời: {r.answer})</span>}
                </li>
              ))}
            </ul>
          </div>
        )}
        <div className="row gap center">
          {wrong.length > 0 && <button className="btn primary" onClick={() => start(wrong.map((r) => r.q.word))}>Làm lại câu sai</button>}
          <button className="btn ghost" onClick={() => setQs(null)}>Bài mới</button>
        </div>
      </div>
    );
  }

  const q = qs[i];
  return (
    <div className="page narrow">
      <div className="progress"><div style={{ width: `${(i / qs.length) * 100}%` }} /></div>
      <div className="row between muted sm">
        <span>Câu {i + 1}/{qs.length} · {QTYPES.find((t) => t.id === q.type)?.label}</span>
        <span className="good">✓ {results.filter((r) => r.correct).length}</span>
      </div>
      <QuestionView key={i} q={q} answered={answered} onAnswer={answer} onNext={next} />
    </div>
  );
}

function QuestionView({ q, answered, onAnswer, onNext }: {
  q: Question; answered: Result | null; onAnswer: (c: boolean, a: string) => void; onNext: () => void;
}) {
  const [typed, setTyped] = useState('');
  const [chosen, setChosen] = useState<string | null>(null);
  const [charIdx, setCharIdx] = useState(0);
  const mistakes = useRef(0);
  const w = q.word;
  const chars = [...w.simp].filter(isHanChar);

  useEffect(() => {
    if (q.type === 'listen') speak(w.simp);
  }, [q, w.simp]);

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (answered && e.key === 'Enter') { e.preventDefault(); onNext(); }
      else if (!answered && q.options.length && ['1', '2', '3', '4'].includes(e.key) && (e.target as HTMLElement).tagName !== 'INPUT') {
        const o = q.options[+e.key - 1];
        if (o) { setChosen(o.label); onAnswer(o.correct, o.correct ? '' : o.label); }
      }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  });

  const prompt = () => {
    switch (q.type) {
      case 'h2m': case 'h2p': case 'hv':
        return <span className="han flash-han">{w.simp}</span>;
      case 'm2h':
        return <span className="flash-mean">{w.meaning}</span>;
      case 'listen':
        return <button className="btn ghost lg" onClick={() => speak(w.simp)}>🔊 Nghe lại</button>;
      case 'write':
        return (
          <div>
            <div className="flash-mean">{w.meaning}</div>
            <Pinyin py={w.pinyin} className="lg" />
          </div>
        );
    }
  };

  return (
    <div className="card quiz-card">
      <div className="quiz-prompt">{prompt()}</div>

      {q.options.length > 0 && (
        <div className="options">
          {q.options.map((o, k) => {
            const state = answered ? (o.correct ? 'right' : chosen === o.label ? 'wrong' : 'dim') : '';
            return (
              <button key={k} className={'option ' + state + (q.type === 'm2h' || q.type === 'listen' ? ' han' : '')} disabled={!!answered}
                onClick={() => { setChosen(o.label); onAnswer(o.correct, o.correct ? '' : o.label); }}>
                <kbd>{k + 1}</kbd> {o.label}
              </button>
            );
          })}
        </div>
      )}

      {q.type === 'h2p' && (
        <form className="row gap center" onSubmit={(e) => {
          e.preventDefault();
          if (answered || !typed.trim()) return;
          onAnswer(pinyinAnswerMatches(typed, w.pinyin), typed);
        }}>
          <input className="input lg" autoFocus value={typed} onChange={(e) => setTyped(e.target.value)} disabled={!!answered}
            placeholder="vd: xue2xi2 hoặc xuéxí" aria-label="Pinyin" />
          {!answered && <button className="btn primary">Kiểm tra</button>}
        </form>
      )}

      {q.type === 'write' && !answered && chars[charIdx] && (
        <div className="center-text">
          <p className="muted">Chữ {charIdx + 1}/{chars.length}</p>
          <WriteQuiz key={charIdx} ch={chars[charIdx]} showOutline={false} size={240}
            onDone={(m) => {
              mistakes.current += m;
              if (charIdx + 1 < chars.length) setCharIdx(charIdx + 1);
              else onAnswer(mistakes.current <= chars.length * 3, mistakes.current ? `sai ${mistakes.current} nét` : '');
            }} />
          <button className="btn ghost sm" onClick={() => onAnswer(false, 'không nhớ')}>Không nhớ</button>
        </div>
      )}

      {answered && (
        <div className={'feedback ' + (answered.correct ? 'ok' : 'bad')}>
          <b>{answered.correct ? '✓ Chính xác!' : '✗ Chưa đúng'}</b>
          <div className="row gap center center-v wrap">
            <span className="han fb-han">{w.simp}</span>
            <Pinyin py={w.pinyin} className="lg" />
            <SpeakButton text={w.simp} />
            {w.hv && <span className="muted">{w.hv}</span>}
          </div>
          <div>{w.meaning}</div>
          {q.type === 'h2p' && !answered.correct && <div className="muted">Đáp án: <b>{pinyinText(w.pinyin)}</b> (bạn gõ: {typed})</div>}
          <button className="btn primary" autoFocus onClick={onNext}>Tiếp (Enter)</button>
        </div>
      )}
    </div>
  );
}
