import { useEffect, useState } from 'react';
import { dict } from '../lib/dict';
import { aiExamples, aiTranslate, type AiSentence } from '../lib/ai';
import { db } from '../lib/db';
import { isHanChar, parseClassifier } from '../lib/pinyin';
import type { CharInfo, DictEntry, Sentence } from '../lib/types';
import { AddToVocab } from './AddToVocab';
import { HskBadge, Pinyin, SpeakButton, Spinner } from './common';
import { SentenceView } from './SentenceView';
import { StrokeAnim } from './StrokeOrder';

const ETYM: Record<string, string> = {
  pictophonetic: 'Hình thanh',
  ideographic: 'Hội ý',
  pictographic: 'Tượng hình',
};

const IDC = /[⿰⿱⿲⿳⿴⿵⿶⿷⿸⿹⿺⿻？]/g;

export function WordDetail({ entry, onNavigate }: { entry: DictEntry; onNavigate: (word: string) => void }) {
  const [readings, setReadings] = useState<DictEntry[]>([]);
  const [chars, setChars] = useState<CharInfo[]>([]);
  const [charHv, setCharHv] = useState<Record<string, string>>({});
  const [sents, setSents] = useState<Sentence[] | null>(null);
  const [related, setRelated] = useState<DictEntry[]>([]);
  const [showPy, setShowPy] = useState(true);
  const [ai, setAi] = useState<AiSentence[] | null>(null);
  const [aiState, setAiState] = useState<'' | 'loading' | string>('');
  const [trans, setTrans] = useState<Record<string, string>>({});

  const hanChars = [...entry.s].filter(isHanChar);
  const uniqueChars = [...new Set(hanChars)];

  useEffect(() => {
    let live = true;
    setSents(null);
    setAi(null);
    setAiState('');
    dict.lookup(entry.s).then((r) => live && setReadings(r.filter((x) => x.i !== entry.i)));
    dict.chars(uniqueChars).then((c) => live && setChars(c));
    Promise.all(uniqueChars.map((c) => dict.lookup(c))).then((rs) => {
      if (!live) return;
      const m: Record<string, string> = {};
      rs.forEach((r, i) => (m[uniqueChars[i]] = [...new Set(r.map((x) => x.hv).filter(Boolean))].join(', ')));
      setCharHv(m);
    });
    dict.sentences([entry.s, entry.t], 8).then((s) => live && setSents(s));
    dict.containing(uniqueChars.length === 1 ? uniqueChars[0] : entry.s, 24).then((r) => live && setRelated(r));
    db.aiCache.get(`ex:${entry.s}|${entry.p}`).then((c) => live && c && setAi(c.value as AiSentence[]));
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entry.i]);

  const runAi = async () => {
    setAiState('loading');
    try {
      const known = (await db.words.toArray()).map((w) => w.simp);
      setAi(await aiExamples(entry.s, entry.p, entry.d.slice(0, 3).join('; '), known));
      setAiState('');
    } catch (e) {
      setAiState(String((e as Error).message));
    }
  };

  const translate = async (zh: string) => {
    setTrans((t) => ({ ...t, [zh]: '…' }));
    try {
      const vi = await aiTranslate(zh);
      setTrans((t) => ({ ...t, [zh]: vi }));
    } catch (e) {
      setTrans((t) => ({ ...t, [zh]: '⚠ ' + (e as Error).message }));
    }
  };

  return (
    <article className="detail">
      <header className="detail-head">
        <div className="detail-word">
          <span className="han huge">{entry.s}</span>
          {entry.t !== entry.s && <span className="han trad" title="Phồn thể">{entry.t}</span>}
        </div>
        <div className="detail-meta">
          <div className="row gap wrap center-v">
            <Pinyin py={entry.p} className="lg" />
            <SpeakButton text={entry.s} />
            <HskBadge hn={entry.hn} ho={entry.ho} />
          </div>
          {entry.hv && <div className="hv">Hán Việt: <b>{entry.hv}</b></div>}
          <div className="row gap wrap"><AddToVocab entry={entry} /></div>
        </div>
      </header>

      <section>
        <ol className="defs">
          {entry.d.map((d, i) => <li key={i}>{d}</li>)}
        </ol>
        {entry.cl.length > 0 && (
          <p className="cl">
            Lượng từ:{' '}
            {entry.cl.map((c, i) => {
              const { hanzi, pinyin } = parseClassifier(c);
              return (
                <button key={i} className="link han-link" onClick={() => onNavigate(hanzi)}>
                  <span className="han">{hanzi}</span> <span className="muted">{pinyin}</span>
                </button>
              );
            })}
          </p>
        )}
        {readings.length > 0 && (
          <div className="readings">
            <h4>Cách đọc khác</h4>
            {readings.map((r) => (
              <div key={r.i} className="reading">
                <Pinyin py={r.p} /> {r.hv && <span className="muted">({r.hv})</span>} — {r.d.slice(0, 3).join('; ')}
                <AddToVocab entry={r} compact />
              </div>
            ))}
          </div>
        )}
      </section>

      <section>
        <h3>Chữ & cách viết</h3>
        <div className="char-grid">
          {chars.map((c) => (
            <div key={c.ch} className="char-card">
              <StrokeAnim ch={c.ch} />
              <div className="char-info">
                <div className="row gap center-v">
                  <button className="link han big-char" onClick={() => onNavigate(c.ch)}>{c.ch}</button>
                  {charHv[c.ch] && <b className="hv-tag">{charHv[c.ch]}</b>}
                </div>
                <dl>
                  {c.strokes > 0 && (<><dt>Số nét</dt><dd>{c.strokes}</dd></>)}
                  {c.radical && (
                    <><dt>Bộ thủ</dt><dd><button className="link han" onClick={() => onNavigate(c.radical)}>{c.radical}</button> {c.radicalName && `(bộ ${c.radicalName})`}</dd></>
                  )}
                  {c.decomposition && c.decomposition.replace(IDC, '').length > 1 && (
                    <><dt>Cấu tạo</dt><dd>
                      {[...c.decomposition.replace(IDC, '')].map((p, i) => (
                        <button key={i} className="link han comp" onClick={() => onNavigate(p)}>{p}</button>
                      ))}
                    </dd></>
                  )}
                  {c.etymType && (
                    <><dt>Loại</dt><dd>
                      {ETYM[c.etymType] || c.etymType}
                      {c.etymType === 'pictophonetic' && c.semantic && c.phonetic && (
                        <> — nghĩa từ <span className="han">{c.semantic}</span>, âm từ <span className="han">{c.phonetic}</span></>
                      )}
                    </dd></>
                  )}
                  {c.hint && (<><dt>Gợi nhớ</dt><dd className="muted" lang="en">{c.hint}</dd></>)}
                </dl>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section>
        <div className="row between center-v">
          <h3>Câu ví dụ</h3>
          <label className="check"><input type="checkbox" checked={showPy} onChange={(e) => setShowPy(e.target.checked)} /> Hiện pinyin</label>
        </div>
        {ai && (
          <ul className="examples ai">
            {ai.map((s, i) => (
              <li key={i}>
                <SentenceView zh={s.zh} showPinyin={showPy} highlight={[entry.s, entry.t]} onWordClick={(e) => onNavigate(e.s)} />
                <div className="ex-tr">{s.vi}</div>
              </li>
            ))}
          </ul>
        )}
        <div className="row gap center-v ai-row">
          {!ai && (
            <button className="btn ghost sm" onClick={runAi} disabled={aiState === 'loading'}>
              ✨ Tạo câu ví dụ bằng AI
            </button>
          )}
          {aiState === 'loading' && <Spinner label="AI đang viết câu…" />}
          {aiState && aiState !== 'loading' && <span className="error">{aiState}</span>}
        </div>
        {sents === null ? (
          <Spinner />
        ) : sents.length === 0 ? (
          !ai && <p className="muted">Chưa có câu ví dụ trong kho. Thử tạo bằng AI.</p>
        ) : (
          <ul className="examples">
            {sents.map((s, i) => (
              <li key={i}>
                <SentenceView zh={s.zh} showPinyin={showPy} highlight={[entry.s, entry.t]} onWordClick={(e) => onNavigate(e.s)} />
                {s.vi ? (
                  <div className="ex-tr">{s.vi}</div>
                ) : trans[s.zh] ? (
                  <div className="ex-tr">{trans[s.zh]}</div>
                ) : (
                  <div className="ex-tr en">
                    <span lang="en">{s.en}</span>{' '}
                    <button className="link sm" onClick={() => translate(s.zh)}>Dịch tiếng Việt (AI)</button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      {related.length > 0 && (
        <section>
          <h3>Từ có chứa {uniqueChars.length === 1 ? <span className="han">「{uniqueChars[0]}」</span> : <span className="han">「{entry.s}」</span>}</h3>
          <div className="related">
            {related.map((r) => (
              <button key={r.i} className="rel" onClick={() => onNavigate(r.s)}>
                <span className="han">{r.s}</span>
                <Pinyin py={r.p} className="sm" />
                <span className="rel-def">{r.d[0]}</span>
              </button>
            ))}
          </div>
        </section>
      )}
    </article>
  );
}
