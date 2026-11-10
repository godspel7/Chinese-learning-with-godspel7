import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { aiStory, getApiKey } from '../lib/ai';
import { allTags, db, type Story } from '../lib/db';
import { dict } from '../lib/dict';
import { speak } from '../lib/tts';
import type { DictEntry } from '../lib/types';
import { AddToVocab } from '../components/AddToVocab';
import { Empty, HskBadge, Modal, Pinyin, SpeakButton, Spinner } from '../components/common';
import { SentenceView } from '../components/SentenceView';

const LEVELS = ['Sơ cấp (HSK 1-2)', 'Trung cấp (HSK 3-4)', 'Cao cấp (HSK 5-6)'];
const LENGTHS = ['Ngắn (khoảng 5 câu)', 'Vừa (khoảng 10 câu)', 'Dài (khoảng 15 câu)'];

export default function Reading() {
  const stories = useLiveQuery(() => db.stories.orderBy('createdAt').reverse().toArray(), [], null);
  const [sel, setSel] = useState<number | null>(null);
  const [creating, setCreating] = useState(false);
  const [hasKey, setHasKey] = useState<boolean | null>(null);

  useEffect(() => { getApiKey().then((k) => setHasKey(!!k)); }, []);
  useEffect(() => {
    if (stories && sel === null && stories.length) setSel(stories[0].id!);
  }, [stories, sel]);

  if (!stories || hasKey === null) return <Spinner />;
  const story = stories.find((s) => s.id === sel);

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Bài đọc AI</h1>
          <p className="muted">AI viết đoạn văn ngắn dùng chính các từ trong vốn từ của bạn để luyện đọc hiểu.</p>
        </div>
        <button className="btn primary" onClick={() => setCreating(true)} disabled={!hasKey}>✨ Tạo bài đọc mới</button>
      </div>
      {!hasKey && (
        <div className="notice">Cần nhập Anthropic API key trong <Link to="/cai-dat">Cài đặt</Link> để dùng tính năng AI.</div>
      )}
      <div className="reading-grid">
        <aside className="story-list">
          {stories.length === 0 && <p className="muted">Chưa có bài đọc nào.</p>}
          {stories.map((s) => (
            <button key={s.id} className={'story-item' + (s.id === sel ? ' on' : '')} onClick={() => setSel(s.id!)}>
              <span className="han">{s.title}</span>
              <span className="muted sm">{new Date(s.createdAt).toLocaleDateString('vi-VN')} · {s.level}</span>
            </button>
          ))}
        </aside>
        <main>{story ? <StoryView story={story} onDelete={() => setSel(null)} /> : <Empty>Chọn hoặc tạo một bài đọc.</Empty>}</main>
      </div>
      {creating && <CreateStory onClose={() => setCreating(false)} onCreated={(id) => { setSel(id); setCreating(false); }} />}
    </div>
  );
}

function CreateStory({ onClose, onCreated }: { onClose: () => void; onCreated: (id: number) => void }) {
  const tags = useLiveQuery(allTags, [], []);
  const [tag, setTag] = useState('');
  const [src, setSrc] = useState<'recent' | 'random' | 'due' | 'tag'>('recent');
  const [n, setN] = useState(10);
  const [level, setLevel] = useState(LEVELS[0]);
  const [length, setLength] = useState(LENGTHS[0]);
  const [topic, setTopic] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const create = async () => {
    setBusy(true);
    setErr('');
    try {
      const all = await db.words.toArray();
      let pool = all;
      if (src === 'tag') pool = all.filter((w) => w.tags.includes(tag));
      if (src === 'due') pool = all.filter((w) => w.due <= Date.now());
      if (src === 'recent') pool = [...all].sort((a, b) => b.createdAt - a.createdAt);
      else pool = [...pool].sort(() => Math.random() - 0.5);
      const target = pool.slice(0, n).map((w) => w.simp);
      if (!target.length) throw new Error('Không có từ nào phù hợp. Hãy thêm từ vào vốn từ trước.');
      const s = await aiStory(target, all.map((w) => w.simp), level, length, topic);
      const id = await db.stories.add({ createdAt: Date.now(), title: s.title, level, words: target, sentences: s.sentences, vocab: s.vocab });
      onCreated(id as number);
    } catch (e) {
      setErr((e as Error).message);
      setBusy(false);
    }
  };

  return (
    <Modal open onClose={onClose} title="Tạo bài đọc mới">
      <div className="field"><span>Dùng từ nào trong vốn từ</span>
        <div className="row gap wrap">
          {([['recent', 'Mới học gần đây'], ['random', 'Ngẫu nhiên'], ['due', 'Đến hạn ôn'], ['tag', 'Theo tag']] as const).map(([id, l]) => (
            <button key={id} className={'pill' + (src === id ? ' on' : '')} onClick={() => setSrc(id)} disabled={id === 'tag' && !tags.length}>{l}</button>
          ))}
        </div>
      </div>
      {src === 'tag' && (
        <label className="field"><span>Tag</span>
          <select className="input" value={tag} onChange={(e) => setTag(e.target.value)}>
            <option value="">— chọn —</option>{tags.map((t) => <option key={t}>{t}</option>)}
          </select>
        </label>
      )}
      <label className="field"><span>Số từ cần dùng: {n}</span>
        <input type="range" min={3} max={30} value={n} onChange={(e) => setN(+e.target.value)} />
      </label>
      <label className="field"><span>Trình độ</span>
        <select className="input" value={level} onChange={(e) => setLevel(e.target.value)}>{LEVELS.map((l) => <option key={l}>{l}</option>)}</select>
      </label>
      <label className="field"><span>Độ dài</span>
        <select className="input" value={length} onChange={(e) => setLength(e.target.value)}>{LENGTHS.map((l) => <option key={l}>{l}</option>)}</select>
      </label>
      <label className="field"><span>Chủ đề (tuỳ chọn)</span>
        <input className="input" value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="vd: đi chợ, phỏng vấn xin việc, du lịch Bắc Kinh…" />
      </label>
      {err && <p className="error">{err}</p>}
      <div className="row gap end">
        {busy && <Spinner label="AI đang viết…" />}
        <button className="btn primary" onClick={create} disabled={busy || (src === 'tag' && !tag)}>Tạo</button>
      </div>
    </Modal>
  );
}

function StoryView({ story, onDelete }: { story: Story; onDelete: () => void }) {
  const [showPy, setShowPy] = useState(true);
  const [showTr, setShowTr] = useState(false);
  const [revealed, setRevealed] = useState<Set<number>>(new Set());
  const [word, setWord] = useState<DictEntry | null>(null);
  const [vocabEntries, setVocabEntries] = useState<(DictEntry | null)[]>([]);

  useEffect(() => {
    Promise.all(story.vocab.map((v) => dict.lookup(v.hanzi).then((r) => r[0] || null))).then(setVocabEntries);
    setRevealed(new Set());
  }, [story]);

  const del = async () => {
    if (!confirm('Xoá bài đọc này?')) return;
    await db.stories.delete(story.id!);
    onDelete();
  };

  return (
    <article className="card story">
      <div className="row between center-v wrap gap">
        <h2 className="han">{story.title} <SpeakButton text={story.sentences.map((s) => s.zh).join('')} title="Đọc cả bài" /></h2>
        <div className="row gap">
          <label className="check"><input type="checkbox" checked={showPy} onChange={(e) => setShowPy(e.target.checked)} /> Pinyin</label>
          <label className="check"><input type="checkbox" checked={showTr} onChange={(e) => setShowTr(e.target.checked)} /> Bản dịch</label>
          <button className="btn ghost sm" onClick={del}>Xoá</button>
        </div>
      </div>
      <p className="muted sm">Từ luyện: <span className="han">{story.words.join('、')}</span> · Bấm vào từ bất kỳ để tra.</p>
      <div className="story-body">
        {story.sentences.map((s, k) => (
          <div key={k} className="story-sent">
            <SentenceView zh={s.zh} showPinyin={showPy} highlight={story.words} onWordClick={setWord} />
            {showTr || revealed.has(k) ? (
              <div className="ex-tr">{s.vi}</div>
            ) : (
              <button className="link sm" onClick={() => setRevealed(new Set(revealed).add(k))}>Xem nghĩa</button>
            )}
          </div>
        ))}
      </div>
      <button className="btn ghost sm" onClick={() => speak(story.sentences.map((s) => s.zh).join(''))}>🔊 Nghe cả bài</button>
      {story.vocab.length > 0 && (
        <>
          <h3>Từ mới trong bài</h3>
          <ul className="story-vocab">
            {story.vocab.map((v, k) => (
              <li key={k}>
                <span className="han">{v.hanzi}</span> <span className="muted">{v.pinyin}</span> — {v.vi}
                {vocabEntries[k] && <AddToVocab entry={vocabEntries[k]!} compact />}
              </li>
            ))}
          </ul>
        </>
      )}
      {word && (
        <Modal open onClose={() => setWord(null)} title="Tra nhanh">
          <div className="quick">
            <span className="han huge">{word.s}</span>
            <div className="row gap center-v"><Pinyin py={word.p} className="lg" /><SpeakButton text={word.s} /><HskBadge hn={word.hn} ho={word.ho} /></div>
            {word.hv && <div className="hv">Hán Việt: <b>{word.hv}</b></div>}
            <ol className="defs">{word.d.slice(0, 6).map((d, k) => <li key={k}>{d}</li>)}</ol>
            <div className="row gap">
              <AddToVocab entry={word} />
              <Link className="btn ghost" to={`/tra-tu?q=${encodeURIComponent(word.s)}&id=${word.i}`}>Xem chi tiết</Link>
            </div>
          </div>
        </Modal>
      )}
    </article>
  );
}
