import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, getSetting } from '../lib/db';
import { computeStreak, dueQueue } from '../lib/srs';
import type { SearchMode } from '../lib/types';
import { SearchBox } from '../components/SearchBox';
import { Pinyin, SpeakButton } from '../components/common';

export default function Home() {
  const nav = useNavigate();
  const [q, setQ] = useState('');
  const [mode, setMode] = useState<SearchMode>('auto');
  const total = useLiveQuery(() => db.words.count(), [], 0);
  const recent = useLiveQuery(() => db.words.orderBy('createdAt').reverse().limit(8).toArray(), [], []);
  const logs = useLiveQuery(() => db.reviews.where('at').above(Date.now() - 400 * 86400000).toArray(), [], []);
  const [due, setDue] = useState<number | null>(null);
  const [newCount, setNewCount] = useState(0);

  useEffect(() => {
    (async () => {
      const q = await dueQueue(await getSetting('newPerDay', 20));
      setDue(q.filter((w) => w.card.state !== 0).length);
      setNewCount(q.filter((w) => w.card.state === 0).length);
    })();
  }, [total, logs.length]);

  const streak = computeStreak(logs);
  const todayStart = new Date().setHours(0, 0, 0, 0);
  const today = logs.filter((l) => l.at >= todayStart).length;

  return (
    <div className="page home">
      <section className="hero">
        <h1><span className="han">你好</span>! Hôm nay học gì nào?</h1>
        <SearchBox
          value={q} onChange={setQ} mode={mode} onModeChange={setMode}
          onSubmit={(v) => v.trim() && nav(`/tra-tu?q=${encodeURIComponent(v)}${mode !== 'auto' ? `&m=${mode}` : ''}`)}
          onPick={(e) => nav(`/tra-tu?q=${encodeURIComponent(e.s)}&id=${e.i}`)}
          autoFocus big
        />
      </section>

      <section className="home-cards">
        <Link to="/on-tap" className="home-card primary">
          <span className="hc-num">{due ?? '…'}</span>
          <span className="hc-label">từ cần ôn{newCount ? ` · ${newCount} từ mới` : ''}</span>
          <span className="hc-cta">Ôn tập ngay →</span>
        </Link>
        <Link to="/kiem-tra" className="home-card">
          <span className="hc-num">📝</span>
          <span className="hc-label">Kiểm tra nhanh từ vốn từ</span>
          <span className="hc-cta">Làm bài →</span>
        </Link>
        <Link to="/thong-ke" className="home-card">
          <span className="hc-num">{streak}🔥</span>
          <span className="hc-label">ngày liên tiếp · hôm nay {today} lượt</span>
          <span className="hc-cta">Thống kê →</span>
        </Link>
        <Link to="/von-tu" className="home-card">
          <span className="hc-num">{total}</span>
          <span className="hc-label">từ trong vốn từ</span>
          <span className="hc-cta">Quản lý →</span>
        </Link>
      </section>

      <section className="card">
        <div className="row between center-v">
          <h3>Mới thêm gần đây</h3>
          <Link to="/von-tu" className="link sm">Xem tất cả</Link>
        </div>
        {recent.length === 0 ? (
          <p className="muted">Chưa có từ nào. Tra một từ rồi bấm <b>＋ Thêm vào vốn từ</b>, hoặc vào <Link to="/von-tu">Vốn từ</Link> để dán cả danh sách.</p>
        ) : (
          <div className="recent-grid">
            {recent.map((w) => (
              <Link key={w.id} to={`/tra-tu?q=${encodeURIComponent(w.simp)}`} className="recent">
                <span className="han">{w.simp}</span>
                <Pinyin py={w.pinyin} className="sm" />
                <span className="muted sm ellipsis">{w.meaning}</span>
                <SpeakButton text={w.simp} small />
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
