// Cơ sở dữ liệu cá nhân (IndexedDB qua Dexie): vốn từ, lịch sử ôn tập, cài đặt, bài đọc AI.
import Dexie, { type EntityTable } from 'dexie';
import { createEmptyCard, type Card } from 'ts-fsrs';
import type { DictEntry } from './types';

export interface StoredCard {
  due: number;
  stability: number;
  difficulty: number;
  scheduled_days: number;
  learning_steps: number;
  reps: number;
  lapses: number;
  state: number;
  last_review: number | null;
}

export interface Word {
  id?: number;
  /** khoá duy nhất: giản thể|pinyin */
  key: string;
  simp: string;
  trad: string;
  /** pinyin dạng số "xue2 xi2" */
  pinyin: string;
  /** nghĩa (người dùng có thể sửa) */
  meaning: string;
  hv: string;
  hsk: number;
  tags: string[];
  note: string;
  createdAt: number;
  card: StoredCard;
  /** = card.due, để đánh chỉ mục */
  due: number;
  correct: number;
  wrong: number;
}

export interface ReviewLog {
  id?: number;
  wordId: number;
  at: number;
  /** srs | quiz | write */
  kind: string;
  /** 1-4 với srs; 1 = đúng / 0 = sai với quiz & write */
  rating: number;
  qtype?: string;
}

export interface Setting {
  key: string;
  value: unknown;
}

export interface Story {
  id?: number;
  createdAt: number;
  title: string;
  level: string;
  words: string[];
  sentences: { zh: string; pinyin: string; vi: string }[];
  vocab: { hanzi: string; pinyin: string; vi: string }[];
}

export interface AiCache {
  key: string;
  value: unknown;
  at: number;
}

export const db = new Dexie('hoc-tieng-trung') as Dexie & {
  words: EntityTable<Word, 'id'>;
  reviews: EntityTable<ReviewLog, 'id'>;
  settings: EntityTable<Setting, 'key'>;
  stories: EntityTable<Story, 'id'>;
  aiCache: EntityTable<AiCache, 'key'>;
};

db.version(1).stores({
  words: '++id, &key, simp, createdAt, due, *tags',
  reviews: '++id, wordId, at, kind',
  settings: '&key',
  stories: '++id, createdAt',
  aiCache: '&key',
});

export const cardToStored = (c: Card): StoredCard => ({
  due: new Date(c.due).getTime(),
  stability: c.stability,
  difficulty: c.difficulty,
  scheduled_days: c.scheduled_days,
  learning_steps: c.learning_steps,
  reps: c.reps,
  lapses: c.lapses,
  state: c.state,
  last_review: c.last_review ? new Date(c.last_review).getTime() : null,
});

export const storedToCard = (s: StoredCard): Card => ({
  due: new Date(s.due),
  stability: s.stability,
  difficulty: s.difficulty,
  scheduled_days: s.scheduled_days,
  learning_steps: s.learning_steps,
  reps: s.reps,
  lapses: s.lapses,
  state: s.state as Card['state'],
  last_review: s.last_review ? new Date(s.last_review) : undefined,
});

export const wordKey = (simp: string, pinyin: string) => `${simp}|${pinyin.toLowerCase()}`;

export function newWordFromEntry(e: DictEntry, tags: string[] = [], meaning?: string): Word {
  const card = cardToStored(createEmptyCard(new Date()));
  return {
    key: wordKey(e.s, e.p),
    simp: e.s,
    trad: e.t,
    pinyin: e.p,
    meaning: meaning ?? e.d.slice(0, 4).join('; '),
    hv: e.hv,
    hsk: e.hn,
    tags,
    note: '',
    createdAt: Date.now(),
    card,
    due: card.due,
    correct: 0,
    wrong: 0,
  };
}

export function newCustomWord(simp: string, pinyin: string, meaning: string, hv = '', tags: string[] = []): Word {
  const card = cardToStored(createEmptyCard(new Date()));
  return {
    key: wordKey(simp, pinyin),
    simp, trad: simp, pinyin, meaning, hv, hsk: 0, tags, note: '',
    createdAt: Date.now(), card, due: card.due, correct: 0, wrong: 0,
  };
}

export async function addWord(w: Word): Promise<number | null> {
  const exists = await db.words.where('key').equals(w.key).first();
  if (exists) return null;
  return (await db.words.add(w)) as number;
}

export async function getSetting<T>(key: string, fallback: T): Promise<T> {
  const s = await db.settings.get(key);
  return s === undefined ? fallback : (s.value as T);
}
export const setSetting = (key: string, value: unknown) => db.settings.put({ key, value });

export async function allTags(): Promise<string[]> {
  const keys = await db.words.orderBy('tags').uniqueKeys();
  return (keys as string[]).sort((a, b) => a.localeCompare(b, 'vi'));
}

export async function recordQuiz(wordId: number, correct: boolean, qtype: string, kind = 'quiz') {
  await db.transaction('rw', db.words, db.reviews, async () => {
    const w = await db.words.get(wordId);
    if (!w) return;
    await db.words.update(wordId, correct ? { correct: w.correct + 1 } : { wrong: w.wrong + 1 });
    await db.reviews.add({ wordId, at: Date.now(), kind, rating: correct ? 1 : 0, qtype });
  });
}
