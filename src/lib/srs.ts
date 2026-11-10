// Ôn tập ngắt quãng với thuật toán FSRS
import { fsrs, Rating, type Grade } from 'ts-fsrs';
import { cardToStored, db, storedToCard, type ReviewLog, type Word } from './db';

const scheduler = fsrs({ enable_fuzz: true, request_retention: 0.9 });

export const GRADES: { grade: Grade; label: string; key: string; cls: string }[] = [
  { grade: Rating.Again, label: 'Quên', key: '1', cls: 'again' },
  { grade: Rating.Hard, label: 'Khó', key: '2', cls: 'hard' },
  { grade: Rating.Good, label: 'Nhớ', key: '3', cls: 'good' },
  { grade: Rating.Easy, label: 'Dễ', key: '4', cls: 'easy' },
];

export function previewIntervals(w: Word): Record<number, string> {
  const now = new Date();
  const prev = scheduler.repeat(storedToCard(w.card), now);
  const out: Record<number, string> = {};
  for (const g of GRADES) out[g.grade] = formatInterval(new Date(prev[g.grade].card.due).getTime() - now.getTime());
  return out;
}

export function formatInterval(ms: number): string {
  const m = Math.round(ms / 60000);
  if (m < 60) return `${Math.max(1, m)} phút`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} giờ`;
  const d = Math.round(h / 24);
  if (d < 31) return `${d} ngày`;
  const mo = Math.round(d / 30);
  if (mo < 12) return `${mo} tháng`;
  return `${(d / 365).toFixed(1)} năm`;
}

export async function gradeWord(w: Word, grade: Grade) {
  const res = scheduler.next(storedToCard(w.card), new Date(), grade);
  const card = cardToStored(res.card);
  await db.transaction('rw', db.words, db.reviews, async () => {
    await db.words.update(w.id!, { card, due: card.due });
    await db.reviews.add({ wordId: w.id!, at: Date.now(), kind: 'srs', rating: grade });
  });
}

export const STATE_LABEL = ['Mới', 'Đang học', 'Ôn tập', 'Học lại'];

/** Mức thuộc: mới / đang học / đã nhớ / thành thạo */
export function mastery(w: Word): { label: string; cls: string } {
  if (w.card.state === 0) return { label: 'Mới', cls: 'm-new' };
  if (w.card.state !== 2) return { label: 'Đang học', cls: 'm-learning' };
  if (w.card.scheduled_days >= 21) return { label: 'Thành thạo', cls: 'm-mastered' };
  return { label: 'Đã nhớ', cls: 'm-known' };
}

/** Danh sách từ cần ôn hôm nay (từ mới bị giới hạn theo ngày) */
export async function dueQueue(newLimit: number, tag?: string): Promise<Word[]> {
  const now = Date.now();
  let due = await db.words.where('due').belowOrEqual(now).toArray();
  if (tag) due = due.filter((w) => w.tags.includes(tag));
  const reviews = due.filter((w) => w.card.state !== 0).sort((a, b) => a.due - b.due);
  const startOfDay = new Date(); startOfDay.setHours(0, 0, 0, 0);
  // số từ mới đã học hôm nay = số từ có lần ôn đầu tiên hôm nay
  const todayLogs = await db.reviews.where('at').aboveOrEqual(startOfDay.getTime()).filter((r) => r.kind === 'srs').toArray();
  const ids = new Set(todayLogs.map((r) => r.wordId));
  let newToday = 0;
  for (const id of ids) {
    const first = await db.reviews.where('wordId').equals(id).filter((r) => r.kind === 'srs').first();
    if (first && first.at >= startOfDay.getTime()) newToday++;
  }
  const news = due.filter((w) => w.card.state === 0).sort((a, b) => a.createdAt - b.createdAt)
    .slice(0, Math.max(0, newLimit - newToday));
  // xen kẽ từ mới vào giữa các từ ôn
  const out: Word[] = [];
  let ni = 0;
  reviews.forEach((w, i) => {
    out.push(w);
    if (i % 4 === 3 && ni < news.length) out.push(news[ni++]);
  });
  while (ni < news.length) out.push(news[ni++]);
  return out;
}

const DAY = 86400000;
const dayStart = (t: number) => { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime(); };

/** Số ngày học liên tiếp */
export function computeStreak(logs: ReviewLog[]): number {
  const days = new Set(logs.map((l) => dayStart(l.at)));
  let d = dayStart(Date.now());
  if (!days.has(d)) d -= DAY; // hôm nay chưa học thì tính đến hôm qua
  let s = 0;
  while (days.has(d)) { s++; d -= DAY; }
  return s;
}

