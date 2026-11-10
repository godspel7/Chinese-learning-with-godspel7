import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, type ReviewLog, type Word } from '../lib/db';
import { computeStreak, mastery } from '../lib/srs';
import { Empty, Pinyin, Spinner } from '../components/common';

const DAY = 86400000;
const dayStart = (t: number) => { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime(); };
const fmtDay = (t: number) => new Date(t).toLocaleDateString('vi-VN', { weekday: 'short', day: 'numeric', month: 'numeric' });

export default function Stats() {
  const words = useLiveQuery(() => db.words.toArray(), [], null);
  const logs = useLiveQuery(() => db.reviews.toArray(), [], null);
  if (!words || !logs) return <Spinner />;
  if (!words.length) return <div className="page"><h1>Thống kê</h1><Empty>Chưa có dữ liệu. <Link to="/von-tu">Thêm từ</Link> và bắt đầu ôn tập nhé.</Empty></div>;
  return <StatsView words={words} logs={logs} />;
}

function StatsView({ words, logs }: { words: Word[]; logs: ReviewLog[] }) {
  const today = dayStart(Date.now());
  const streak = computeStreak(logs);
  const todayCount = logs.filter((l) => l.at >= today).length;
  const recentQuiz = logs.filter((l) => l.kind !== 'srs' && l.at >= today - 29 * DAY);
  const acc = recentQuiz.length ? Math.round((recentQuiz.filter((l) => l.rating === 1).length / recentQuiz.length) * 100) : null;

  const levels = useMemo(() => {
    const m: Record<string, number> = { 'Mới': 0, 'Đang học': 0, 'Đã nhớ': 0, 'Thành thạo': 0 };
    words.forEach((w) => m[mastery(w).label]++);
    return m;
  }, [words]);

  const hardest = useMemo(() => [...words].filter((w) => w.wrong > 0 || w.card.lapses > 0)
    .sort((a, b) => (b.wrong + b.card.lapses * 2) / (b.correct + b.wrong + b.card.reps + 1) - (a.wrong + a.card.lapses * 2) / (a.correct + a.wrong + a.card.reps + 1))
    .slice(0, 12), [words]);

  const tagCounts = useMemo(() => {
    const m = new Map<string, { n: number; known: number }>();
    for (const w of words) for (const t of w.tags.length ? w.tags : ['(không tag)']) {
      const c = m.get(t) || { n: 0, known: 0 };
      c.n++;
      if (w.card.state === 2) c.known++;
      m.set(t, c);
    }
    return [...m.entries()].sort((a, b) => b[1].n - a[1].n);
  }, [words]);

  return (
    <div className="page viz-root">
      <h1>Thống kê</h1>
      <div className="tiles">
        <div className="tile"><span className="tile-label">Tổng số từ</span><b className="tile-num">{words.length}</b></div>
        <div className="tile"><span className="tile-label">Chuỗi ngày học</span><b className="tile-num">{streak} <small>ngày</small></b></div>
        <div className="tile"><span className="tile-label">Lượt học hôm nay</span><b className="tile-num">{todayCount}</b></div>
        <div className="tile"><span className="tile-label">Tỉ lệ đúng (30 ngày)</span><b className="tile-num">{acc === null ? '—' : `${acc}%`}</b></div>
      </div>
      <div className="tiles four">
        {Object.entries(levels).map(([k, v]) => (
          <div key={k} className="tile sm"><span className="tile-label">{k}</span><b className="tile-num">{v}</b></div>
        ))}
      </div>

      <section className="card">
        <h3>Hoạt động 20 tuần qua</h3>
        <Heatmap logs={logs} />
      </section>

      <section className="card">
        <h3>Số từ đến hạn ôn trong 14 ngày tới</h3>
        <Forecast words={words} />
      </section>

      <div className="two-col">
        <section className="card">
          <h3>Từ khó nhất</h3>
          {hardest.length === 0 ? <p className="muted">Chưa có từ nào bị sai. Tuyệt!</p> : (
            <table className="simple-table">
              <thead><tr><th>Từ</th><th>Nghĩa</th><th className="num">Sai</th><th className="num">Quên</th></tr></thead>
              <tbody>
                {hardest.map((w) => (
                  <tr key={w.id}>
                    <td><Link className="han" to={`/tra-tu?q=${encodeURIComponent(w.simp)}`}>{w.simp}</Link> <Pinyin py={w.pinyin} className="sm" /></td>
                    <td className="sm">{w.meaning.split(/;\s*/)[0]}</td>
                    <td className="num">{w.wrong}</td>
                    <td className="num">{w.card.lapses}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
        <section className="card">
          <h3>Theo tag</h3>
          <table className="simple-table">
            <thead><tr><th>Tag</th><th className="num">Số từ</th><th className="num">Đã nhớ</th></tr></thead>
            <tbody>
              {tagCounts.map(([t, c]) => (
                <tr key={t}><td>{t}</td><td className="num">{c.n}</td><td className="num">{c.known} <span className="muted sm">({Math.round((c.known / c.n) * 100)}%)</span></td></tr>
              ))}
            </tbody>
          </table>
        </section>
      </div>
    </div>
  );
}

function Tooltip({ tip }: { tip: { x: number; y: number; text: string } | null }) {
  if (!tip) return null;
  return <div className="viz-tip" style={{ left: tip.x, top: tip.y }}>{tip.text}</div>;
}

function Heatmap({ logs }: { logs: ReviewLog[] }) {
  const [tip, setTip] = useState<{ x: number; y: number; text: string } | null>(null);
  const weeks = 20;
  const today = dayStart(Date.now());
  // bắt đầu từ thứ Hai của tuần (weeks-1) trước
  const dow = (new Date(today).getDay() + 6) % 7;
  const start = today - (dow + (weeks - 1) * 7) * DAY;
  const counts = new Map<number, number>();
  for (const l of logs) {
    const d = dayStart(l.at);
    if (d >= start) counts.set(d, (counts.get(d) || 0) + 1);
  }
  const max = Math.max(1, ...counts.values());
  const level = (n: number) => (n === 0 ? 0 : Math.min(4, Math.ceil((n / max) * 4)));
  const cell = 14, gap = 3, left = 28, top = 18;
  const cells = [];
  const months: { x: number; label: string }[] = [];
  for (let w = 0; w < weeks; w++) {
    for (let d = 0; d < 7; d++) {
      const t = start + (w * 7 + d) * DAY;
      if (t > today) continue;
      if (new Date(t).getDate() === 1 || (w === 0 && d === 0)) {
        const x = left + w * (cell + gap);
        const label = `Th${new Date(t).getMonth() + 1}`;
        // tránh nhãn tháng chồng lên nhau: nhãn mới thay nhãn quá gần trước đó
        if (months.length && x - months[months.length - 1].x < 34) months[months.length - 1] = { x, label };
        else months.push({ x, label });
      }
      const n = counts.get(t) || 0;
      cells.push(
        <rect key={t} x={left + w * (cell + gap)} y={top + d * (cell + gap)} width={cell} height={cell} rx={3}
          className={'hm l' + level(n)}
          onMouseEnter={(e) => {
            const r = (e.currentTarget.ownerSVGElement!.parentElement as HTMLElement).getBoundingClientRect();
            const b = e.currentTarget.getBoundingClientRect();
            setTip({ x: b.left - r.left + cell / 2, y: b.top - r.top, text: `${fmtDay(t)}: ${n} lượt` });
          }}
          onMouseLeave={() => setTip(null)}
        >
          <title>{`${fmtDay(t)}: ${n} lượt`}</title>
        </rect>,
      );
    }
  }
  const width = left + weeks * (cell + gap);
  return (
    <div className="viz-wrap">
      <svg viewBox={`0 0 ${width} ${top + 7 * (cell + gap)}`} width={width} role="img" aria-label="Lịch hoạt động học tập">
        {months.map((m, i) => <text key={i} x={m.x} y={11} className="viz-axis">{m.label}</text>)}
        {['T2', '', 'T4', '', 'T6', '', 'CN'].map((d, i) => d && <text key={i} x={0} y={top + i * (cell + gap) + 11} className="viz-axis">{d}</text>)}
        {cells}
      </svg>
      <div className="hm-legend muted sm">
        Ít {[0, 1, 2, 3, 4].map((l) => <span key={l} className={'hm-key l' + l} />)} Nhiều
      </div>
      <Tooltip tip={tip} />
    </div>
  );
}

function Forecast({ words }: { words: Word[] }) {
  const [tip, setTip] = useState<{ x: number; y: number; text: string } | null>(null);
  const today = dayStart(Date.now());
  const days = 14;
  const counts = new Array(days).fill(0);
  for (const w of words) {
    if (w.card.state === 0) continue;
    const idx = Math.max(0, Math.floor((dayStart(w.due) - today) / DAY));
    if (idx < days) counts[idx]++;
  }
  const max = Math.max(1, ...counts);
  const niceMax = Math.max(4, Math.ceil(max / 4) * 4);
  const H = 160, barW = 26, gap = 10, left = 30, bottom = 22;
  const width = left + days * (barW + gap);
  const y = (v: number) => H - bottom - (v / niceMax) * (H - bottom - 10);
  return (
    <div className="viz-wrap">
      <svg viewBox={`0 0 ${width} ${H}`} width="100%" style={{ maxWidth: width }} role="img" aria-label="Biểu đồ số từ đến hạn ôn">
        {[0, niceMax / 2, niceMax].map((v) => (
          <g key={v}>
            <line x1={left} x2={width} y1={y(v)} y2={y(v)} className={v === 0 ? 'viz-base' : 'viz-grid'} />
            <text x={left - 6} y={y(v) + 4} textAnchor="end" className="viz-axis">{v}</text>
          </g>
        ))}
        {counts.map((c, i) => {
          const x = left + gap / 2 + i * (barW + gap);
          const h = H - bottom - y(c);
          const label = i === 0 ? 'Hôm nay' : fmtDay(today + i * DAY);
          return (
            <g key={i}
              onMouseEnter={() => setTip({ x: x + barW / 2, y: y(c) - 4, text: `${label}: ${c} từ` })}
              onMouseLeave={() => setTip(null)}>
              <rect x={x - gap / 2} y={0} width={barW + gap} height={H - bottom} fill="transparent" />
              {c > 0 && <path className="viz-bar" d={barPath(x, y(c), barW, h)} />}
              {(i === 0 || i % 2 === 0) && (
                <text x={x + barW / 2} y={H - 6} textAnchor="middle" className="viz-axis">{i === 0 ? 'Nay' : new Date(today + i * DAY).getDate()}</text>
              )}
              <title>{`${label}: ${c} từ`}</title>
            </g>
          );
        })}
      </svg>
      <Tooltip tip={tip} />
    </div>
  );
}

/** cột có góc bo 4px ở đầu, đáy vuông bám trục */
function barPath(x: number, yTop: number, w: number, h: number) {
  const r = Math.min(4, h, w / 2);
  const yb = yTop + h;
  return `M${x},${yb} L${x},${yTop + r} Q${x},${yTop} ${x + r},${yTop} L${x + w - r},${yTop} Q${x + w},${yTop} ${x + w},${yTop + r} L${x + w},${yb} Z`;
}
