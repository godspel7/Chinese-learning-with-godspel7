import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { dict } from '../lib/dict';
import type { DictEntry, SearchHit, SearchMode } from '../lib/types';
import { SearchBox } from '../components/SearchBox';
import { WordDetail } from '../components/WordDetail';
import { AddToVocab } from '../components/AddToVocab';
import { Empty, HskBadge, Pinyin, Spinner } from '../components/common';

export default function Lookup() {
  const [params, setParams] = useSearchParams();
  const q = params.get('q') || '';
  const sel = params.get('id');
  const [mode, setMode] = useState<SearchMode>((params.get('m') as SearchMode) || 'auto');
  const [text, setText] = useState(q);
  const [hits, setHits] = useState<SearchHit[] | null>(null);
  const [entry, setEntry] = useState<DictEntry | null>(null);

  useEffect(() => setText(q), [q]);

  useEffect(() => {
    if (!q.trim()) { setHits([]); return; }
    let live = true;
    setHits(null);
    dict.search(q, mode, 80).then((r) => live && setHits(r));
    return () => { live = false; };
  }, [q, mode]);

  useEffect(() => {
    if (sel == null) {
      if (hits && hits.length) setEntry(hits[0].entry);
      else if (hits) setEntry(null);
      return;
    }
    const fromHits = hits?.find((h) => h.entry.i === +sel)?.entry;
    if (fromHits) setEntry(fromHits);
    else dict.lookup(q).then((r) => setEntry(r.find((x) => x.i === +sel) || r[0] || null));
  }, [sel, hits, q]);

  const go = (query: string, id?: number) => {
    const p: Record<string, string> = { q: query };
    if (id != null) p.id = String(id);
    if (mode !== 'auto') p.m = mode;
    setParams(p);
  };

  const navigateWord = async (w: string) => {
    const r = await dict.lookup(w);
    go(w, r[0]?.i);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <div className="lookup">
      <SearchBox
        value={text}
        onChange={setText}
        mode={mode}
        onModeChange={(m) => { setMode(m); }}
        onSubmit={(v) => go(v)}
        onPick={(e) => go(e.s, e.i)}
        autoFocus
        big
      />
      {!q ? (
        <Empty>
          <p className="han muted huge-empty">查</p>
          <p>Tra theo <b>chữ Hán</b>, <b>pinyin</b> (<code>xuexi</code>, <code>xue2xi2</code>, <code>xuéxí</code>), <b>âm Hán Việt</b> (<code>học tập</code>) hoặc <b>nghĩa tiếng Việt</b>.</p>
          <p className="muted">Không gõ được chữ Hán? Bấm <b>✍ Viết tay</b> rồi vẽ chữ bằng chuột.</p>
        </Empty>
      ) : (
        <div className="lookup-grid">
          <aside className="results">
            {hits === null ? (
              <Spinner label="Đang tìm…" />
            ) : hits.length === 0 ? (
              <Empty>Không tìm thấy kết quả cho “{q}”.</Empty>
            ) : (
              <>
                <div className="muted sm results-count">{hits.length >= 80 ? '80+' : hits.length} kết quả</div>
                <ul>
                  {hits.map((h) => (
                    <li key={h.entry.i} className={entry?.i === h.entry.i ? 'on' : ''} onClick={() => go(q, h.entry.i)}>
                      <div className="res-top">
                        <span className="han res-han">{h.entry.s}</span>
                        <Pinyin py={h.entry.p} />
                        <HskBadge hn={h.entry.hn} ho={h.entry.ho} />
                      </div>
                      {h.entry.hv && <div className="res-hv">{h.entry.hv}</div>}
                      <div className="res-def">{h.entry.d.slice(0, 3).join('; ')}</div>
                      <div className="res-add"><AddToVocab entry={h.entry} compact /></div>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </aside>
          <main className="detail-pane">{entry ? <WordDetail entry={entry} onNavigate={navigateWord} /> : null}</main>
        </div>
      )}
    </div>
  );
}
