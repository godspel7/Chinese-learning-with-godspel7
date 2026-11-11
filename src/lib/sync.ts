// Đồng bộ vốn từ, lịch sử ôn tập và bài đọc qua một GitHub Gist bí mật.
// Mỗi máy/trình duyệt dùng cùng một token → cùng một gist → cùng dữ liệu.
//
// Cách đồng bộ (so sánh 3 bên): `base` = mã băm của lần đồng bộ gần nhất trên máy này.
//  - chỉ máy này đổi      → đẩy lên gist
//  - chỉ gist đổi          → tải về, thay dữ liệu máy này
//  - cả hai cùng đổi       → gộp (theo từ), rồi đẩy bản gộp lên
import Dexie from 'dexie';
import { db, getSetting, setSetting, type ReviewLog, type Story, type Word } from './db';

const FILE = 'hoc-tieng-trung-sync.json';
const API = 'https://api.github.com';

interface SyncData {
  words: Word[];
  reviews: ReviewLog[];
  stories: Story[];
}

export type SyncState =
  | { kind: 'off' }
  | { kind: 'syncing' }
  | { kind: 'ok'; at: number }
  | { kind: 'error'; msg: string };

let state: SyncState = { kind: 'off' };
const listeners = new Set<(s: SyncState) => void>();
export const getSyncState = () => state;
export function onSyncState(fn: (s: SyncState) => void) {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}
function setState(s: SyncState) {
  state = s;
  listeners.forEach((fn) => fn(s));
}

// ---------- tiện ích ----------

async function readLocal(): Promise<SyncData> {
  return db.transaction('r', db.words, db.reviews, db.stories, async () => ({
    words: await db.words.toArray(),
    reviews: await db.reviews.toArray(),
    stories: await db.stories.toArray(),
  }));
}

/** JSON với khoá được sắp xếp → cùng dữ liệu luôn ra cùng chuỗi, bất kể thứ tự thuộc tính */
function stable(v: unknown): string {
  if (Array.isArray(v)) return '[' + v.map(stable).join(',') + ']';
  if (v && typeof v === 'object') {
    const o = v as Record<string, unknown>;
    return '{' + Object.keys(o).filter((k) => o[k] !== undefined).sort().map((k) => JSON.stringify(k) + ':' + stable(o[k])).join(',') + '}';
  }
  return JSON.stringify(v) ?? 'null';
}

async function hashOf(d: SyncData): Promise<string> {
  const bytes = new TextEncoder().encode(stable([d.words, d.reviews, d.stories]));
  const buf = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join('');
}

async function writeLocal(d: SyncData) {
  await db.transaction('rw', db.words, db.reviews, db.stories, async () => {
    await Promise.all([db.words.clear(), db.reviews.clear(), db.stories.clear()]);
    await db.words.bulkAdd(d.words);
    await db.reviews.bulkAdd(d.reviews);
    await db.stories.bulkAdd(d.stories);
  });
}

async function gh(token: string, path: string, init: RequestInit = {}) {
  const res = await fetch(API + path, {
    ...init,
    cache: 'no-store',
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
    },
  });
  if (res.status === 401) throw new Error('Token GitHub không hợp lệ hoặc đã hết hạn.');
  if (res.status === 403 || res.status === 404) {
    if (path.startsWith('/gists/')) throw Object.assign(new Error('Không tìm thấy gist.'), { notFound: true });
    throw new Error('Token không có quyền "gist".');
  }
  if (!res.ok) throw new Error(`GitHub lỗi ${res.status}`);
  return res.json();
}

interface GistFile { content?: string; truncated?: boolean; raw_url?: string }

async function readGistFile(file: GistFile | undefined): Promise<SyncData | null> {
  if (!file) return null;
  let text = file.content ?? '';
  if (file.truncated && file.raw_url) text = await (await fetch(file.raw_url, { cache: 'no-store' })).text();
  const j = JSON.parse(text);
  if (j.app !== 'hoc-tieng-trung' || !Array.isArray(j.words)) throw new Error('Dữ liệu trên gist không đúng định dạng.');
  return { words: j.words, reviews: j.reviews || [], stories: j.stories || [] };
}

const fileBody = (d: SyncData) => ({
  files: {
    [FILE]: { content: JSON.stringify({ app: 'hoc-tieng-trung', version: 1, updatedAt: new Date().toISOString(), ...d }) },
  },
});

/** Tìm gist đồng bộ có sẵn trong tài khoản (khi kết nối máy thứ hai) */
async function findGist(token: string): Promise<string | null> {
  for (let page = 1; page <= 10; page++) {
    const list = (await gh(token, `/gists?per_page=100&page=${page}`)) as { id: string; files: Record<string, unknown> }[];
    const hit = list.find((g) => g.files && FILE in g.files);
    if (hit) return hit.id;
    if (list.length < 100) break;
  }
  return null;
}

// ---------- gộp khi cả hai bên cùng thay đổi ----------

const nextId = (xs: { id?: number }[]) => xs.reduce((m, x) => Math.max(m, x.id || 0), 0) + 1;
const activity = (w: Word) => (w.card?.reps || 0) + (w.correct || 0) + (w.wrong || 0);

function merge(local: SyncData, remote: SyncData): SyncData {
  const words = remote.words.map((w) => ({ ...w }));
  const byKey = new Map(words.map((w, i) => [w.key, i]));
  let nextWordId = nextId(words);
  const localIdToKey = new Map(local.words.map((w) => [w.id, w.key]));

  for (const lw of local.words) {
    const i = byKey.get(lw.key);
    if (i === undefined) {
      byKey.set(lw.key, words.length);
      words.push({ ...lw, id: nextWordId++ });
    } else if (activity(lw) > activity(words[i])) {
      words[i] = { ...lw, id: words[i].id }; // bản ở máy này đã ôn nhiều hơn
    }
  }

  const keyToId = new Map(words.map((w) => [w.key, w.id]));
  const remoteIdToKey = new Map(remote.words.map((w) => [w.id, w.key]));
  const sig = (key: string | undefined, r: ReviewLog) => `${key}|${r.at}|${r.kind}`;
  const seen = new Set(remote.reviews.map((r) => sig(remoteIdToKey.get(r.wordId), r)));
  const reviews = [...remote.reviews];
  let nextReviewId = nextId(reviews);
  for (const r of local.reviews) {
    const key = localIdToKey.get(r.wordId);
    const wordId = key !== undefined ? keyToId.get(key) : undefined;
    if (wordId === undefined || seen.has(sig(key, r))) continue;
    reviews.push({ ...r, id: nextReviewId++, wordId });
  }

  const storySig = (s: Story) => `${s.createdAt}|${s.title}`;
  const seenStories = new Set(remote.stories.map(storySig));
  const stories = [...remote.stories];
  let nextStoryId = nextId(stories);
  for (const s of local.stories) if (!seenStories.has(storySig(s))) stories.push({ ...s, id: nextStoryId++ });

  return { words, reviews, stories };
}

// ---------- đồng bộ ----------

let running: Promise<void> | null = null;
let again: boolean | null = null; // null = không cần chạy lại; true/false = onlyIfLocalChanged

/** Đồng bộ ngay. `onlyIfLocalChanged`: bỏ qua nếu máy này không có gì mới (dùng khi dữ liệu vừa thay đổi). */
export function syncNow(onlyIfLocalChanged = false): Promise<void> {
  if (running) {
    again = again === null ? onlyIfLocalChanged : again && onlyIfLocalChanged;
    return running;
  }
  running = doSync(onlyIfLocalChanged)
    .catch((e) => setState({ kind: 'error', msg: (e as Error).message || String(e) }))
    .finally(() => {
      running = null;
      if (again !== null) {
        const only = again;
        again = null;
        void syncNow(only);
      }
    });
  return running;
}

async function doSync(onlyIfLocalChanged: boolean) {
  const token = await getSetting('gistToken', '');
  if (!token) return setState({ kind: 'off' });
  const base = await getSetting('gistBase', '');
  const local = await readLocal();
  const lh = await hashOf(local);
  if (onlyIfLocalChanged && lh === base) return;
  if (!navigator.onLine) return setState({ kind: 'error', msg: 'Đang ngoại tuyến — sẽ đồng bộ khi có mạng.' });

  setState({ kind: 'syncing' });
  let gistId = await getSetting('gistId', '');
  let remote: SyncData | null = null;
  if (gistId) {
    try {
      const g = await gh(token, `/gists/${gistId}`);
      remote = await readGistFile(g.files?.[FILE]);
    } catch (e) {
      if (!(e as { notFound?: boolean }).notFound) throw e;
      gistId = ''; // gist bị xoá → tìm lại / tạo mới
    }
  }
  if (!gistId) {
    gistId = (await findGist(token)) || '';
    if (gistId) remote = await readGistFile((await gh(token, `/gists/${gistId}`)).files?.[FILE]);
  }

  if (!gistId) {
    const g = await gh(token, '/gists', {
      method: 'POST',
      body: JSON.stringify({ description: 'Học tiếng Trung — dữ liệu đồng bộ (đừng xoá)', public: false, ...fileBody(local) }),
    });
    await setSetting('gistId', g.id);
    await setSetting('gistBase', lh);
    return setState({ kind: 'ok', at: Date.now() });
  }
  await setSetting('gistId', gistId);

  const rh = remote ? await hashOf(remote) : '';
  let result: SyncData;
  let push: boolean;
  if (remote && rh === lh) {
    result = local; push = false;
  } else if (!remote) {
    result = local; push = true;
  } else if (lh === base || (!base && local.words.length === 0)) {
    result = remote; push = false; // chỉ gist có thay đổi
    await writeLocal(remote);
  } else if (rh === base) {
    result = local; push = true; // chỉ máy này có thay đổi
  } else {
    result = merge(local, remote); push = true;
    await writeLocal(result);
  }

  if (push) await gh(token, `/gists/${gistId}`, { method: 'PATCH', body: JSON.stringify(fileBody(result)) });
  await setSetting('gistBase', await hashOf(result));
  setState({ kind: 'ok', at: Date.now() });
}

// ---------- kết nối / ngắt ----------

export async function connectGist(token: string) {
  await setSetting('gistToken', token.trim());
  await setSetting('gistId', '');
  await setSetting('gistBase', '');
  await syncNow();
  if (state.kind === 'error') throw new Error(state.msg);
}

export async function disconnectGist() {
  await setSetting('gistToken', '');
  await setSetting('gistId', '');
  await setSetting('gistBase', '');
  setState({ kind: 'off' });
}

// ---------- tự động ----------

let started = false;
export function startSync() {
  if (started) return;
  started = true;

  // Xin trình duyệt giữ dữ liệu lâu dài, không tự dọn
  navigator.storage?.persist?.().catch(() => {});

  let timer: ReturnType<typeof setTimeout> | undefined;
  const schedule = (ms: number, onlyIfLocalChanged: boolean) => {
    clearTimeout(timer);
    timer = setTimeout(() => void syncNow(onlyIfLocalChanged), ms);
  };

  // Dữ liệu học thay đổi → đẩy lên sau 2 giây
  Dexie.on('storagemutated', (parts: Record<string, unknown>) => {
    if (Object.keys(parts).some((k) => /\/(words|reviews|stories)\//.test(k))) schedule(2000, true);
  });

  // Quay lại tab / có mạng lại → kéo bản mới từ máy khác
  let lastPull = 0;
  const pull = () => {
    if (Date.now() - lastPull < 15000) return;
    lastPull = Date.now();
    schedule(0, false);
  };
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') pull();
    else { clearTimeout(timer); void syncNow(true); } // rời tab → đẩy ngay phần chưa đồng bộ
  });
  window.addEventListener('online', pull);

  pull();
}
