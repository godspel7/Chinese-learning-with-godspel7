/// <reference lib="webworker" />
// Web Worker: nạp từ điển & tìm kiếm ngoài luồng giao diện.
import { DATA_VERSION } from '../lib/dataVersion';
import type { CharInfo, DictEntry, RawEntry, SearchHit, SearchMode, Sentence, Token } from '../lib/types';
import { hasHan, hasVietDiacritics, looksLikePinyin, parsePinyin, pyKeyBare, pyKeyNum, stripViet } from '../lib/pinyin';

const base = self.location.origin;
let raw: RawEntry[] = [];
let pyBare: string[] = [];
let pyNum: string[] = [];
let toneSeq: string[] = [];
let hvL: string[] = [];
let hvPlain: string[] | null = null;
let defsL: string[] = [];
let defsPlain: string[] | null = null;
const wordIndex = new Map<string, number[]>();
let maxWordLen = 1;
let sentences: Sentence[] | null = null;
let chars: Record<string, (string | number)[]> | null = null;

const toEntry = (i: number): DictEntry => {
  const e = raw[i];
  return { i, s: e[0], t: e[1], p: e[2], d: e[3], hv: e[4], hn: e[5], ho: e[6], r: e[7], cl: e[8] };
};

async function load() {
  const res = await fetch(new URL('/data/dict.json?v=' + DATA_VERSION, base));
  raw = await res.json();
  const n = raw.length;
  pyBare = new Array(n);
  pyNum = new Array(n);
  toneSeq = new Array(n);
  hvL = new Array(n);
  defsL = new Array(n);
  for (let i = 0; i < n; i++) {
    const e = raw[i];
    pyNum[i] = pyKeyNum(e[2]);
    pyBare[i] = pyKeyBare(e[2]);
    toneSeq[i] = pyNum[i].replace(/[^1-4]/g, '');
    hvL[i] = e[4].toLowerCase();
    defsL[i] = e[3].join('\n').toLowerCase();
    for (const w of e[0] === e[1] ? [e[0]] : [e[0], e[1]]) {
      const list = wordIndex.get(w);
      if (list) list.push(i);
      else wordIndex.set(w, [i]);
      const len = [...w].length;
      if (len > maxWordLen && len <= 8) maxWordLen = len;
    }
  }
}
const ready = load();

const LEFT = new Set([' ', '\n', '(', ';', ',', '"', '/', '“']);
const RIGHT = new Set([' ', '\n', ')', ';', ',', '.', '!', '?', '"', '/', '”', ':']);

/** Mức khớp nghĩa: 0 = trùng hẳn một nghĩa, 1 = nghĩa bắt đầu bằng q, 3 = chứa q như một cụm từ, -1 = không */
function meaningLevel(hay: string, q: string): number {
  let best = -1;
  let p = hay.indexOf(q);
  while (p >= 0) {
    const l = p === 0 ? '\n' : hay[p - 1];
    const end = p + q.length;
    const r = end >= hay.length ? '\n' : hay[end];
    if (LEFT.has(l) && RIGHT.has(r)) {
      const lvl = l === '\n' ? (r === '\n' ? 0 : 1) : 3;
      if (best < 0 || lvl < best) best = lvl;
      if (best === 0) return 0;
    }
    p = hay.indexOf(q, p + 1);
  }
  return best;
}

function search(qRaw: string, mode: SearchMode, limit: number): SearchHit[] {
  const q = qRaw.trim().toLowerCase().replace(/\s+/g, ' ');
  if (!q) return [];
  const score = new Map<number, number>();
  const via = new Map<number, string>();
  const add = (i: number, s: number, how: string) => {
    const cur = score.get(i);
    if (cur === undefined || s < cur) {
      score.set(i, s);
      via.set(i, how);
    }
  };
  const n = raw.length;

  if (hasHan(q)) {
    if (mode === 'auto' || mode === 'hanzi') {
      for (let i = 0; i < n; i++) {
        const s = raw[i][0], t = raw[i][1];
        if (s === q || t === q) add(i, 0, 'hanzi');
        else if (s.startsWith(q) || t.startsWith(q)) add(i, 1, 'hanzi');
        else if (s.includes(q) || t.includes(q)) add(i, 4, 'hanzi');
      }
    }
  } else {
    const viet = hasVietDiacritics(q);
    // --- pinyin ---
    if ((mode === 'auto' || mode === 'pinyin') && looksLikePinyin(q)) {
      const { bare, tones, hasDigits } = parsePinyin(q);
      const qNum = pyKeyNum(q);
      const toneStr = tones.join('');
      if (bare) {
        for (let i = 0; i < n; i++) {
          if (!pyBare[i].startsWith(bare)) continue;
          if (hasDigits ? !pyNum[i].startsWith(qNum) : toneStr && !toneSeq[i].startsWith(toneStr)) continue;
          add(i, pyBare[i] === bare ? 0 : 2, 'pinyin');
        }
      }
    }
    // --- Hán Việt ---
    if (mode === 'auto' || mode === 'hanviet') {
      const plain = !viet;
      if (plain && !hvPlain) hvPlain = hvL.map(stripViet);
      const arr = plain ? hvPlain! : hvL;
      const qq = plain ? stripViet(q) : q;
      for (let i = 0; i < n; i++) {
        const h = arr[i];
        if (!h) continue;
        if (h === qq || (h.includes(', ') && h.split(', ').includes(qq))) add(i, 0, 'hanviet');
        else if (qq.length >= 2 && h.startsWith(qq + ' ')) add(i, 3, 'hanviet');
      }
    }
    // --- nghĩa tiếng Việt ---
    if (mode === 'meaning' || (mode === 'auto' && (viet || !looksLikePinyin(q)))) {
      const plain = !viet;
      if (plain && !defsPlain) defsPlain = defsL.map(stripViet);
      const arr = plain ? defsPlain! : defsL;
      const qq = plain ? stripViet(q) : q;
      // "con mèo" -> cũng tìm "mèo"; "cái bàn" -> "bàn"
      const m = qq.match(/^(con|cai|cái|chiec|chiếc|su|sự|viec|việc|cuoc|cuộc|nguoi|người|qua|quả|trai|trái|cay|cây|bai|bài) (.+)$/);
      const alt = m ? m[2] : '';
      for (let i = 0; i < n; i++) {
        const hay = arr[i];
        if (hay.indexOf(qq) >= 0) {
          const lvl = meaningLevel(hay, qq);
          if (lvl >= 0) add(i, lvl === 0 ? 1 : lvl + 1, 'meaning');
        }
        if (alt && hay.indexOf(alt) >= 0) {
          const lvl = meaningLevel(hay, alt);
          if (lvl >= 0 && lvl <= 1) add(i, lvl + 2, 'meaning');
        }
      }
    }
  }

  const ids = [...score.keys()];
  ids.sort((a, b) => score.get(a)! * 1e7 + raw[a][7] - (score.get(b)! * 1e7 + raw[b][7]));
  return ids.slice(0, limit).map((i) => ({ entry: toEntry(i), via: via.get(i)! }));
}

function lookup(word: string): DictEntry[] {
  return (wordIndex.get(word) || []).map(toEntry);
}

function bestEntry(word: string): DictEntry | null {
  const l = wordIndex.get(word);
  return l ? toEntry(l[0]) : null;
}

/** Tách câu thành từ (khớp dài nhất) */
function segment(text: string): Token[] {
  const cs = [...text];
  const out: Token[] = [];
  for (let i = 0; i < cs.length;) {
    let len = Math.min(maxWordLen, cs.length - i);
    for (; len > 1; len--) if (wordIndex.has(cs.slice(i, i + len).join(''))) break;
    const w = cs.slice(i, i + len).join('');
    out.push({ w, entry: hasHan(w) ? bestEntry(w) : null });
    i += len;
  }
  return out;
}

function containing(ch: string, limit: number): DictEntry[] {
  const out: DictEntry[] = [];
  for (let i = 0; i < raw.length && out.length < limit; i++) {
    const e = raw[i];
    if (e[7] >= 200000) break;
    if (e[0] !== ch && (e[0].includes(ch) || e[1].includes(ch))) out.push(toEntry(i));
  }
  return out;
}

async function getSentences(words: string[], limit: number): Promise<Sentence[]> {
  if (!sentences) {
    const res = await fetch(new URL('/data/sentences.json?v=' + DATA_VERSION, base));
    const arr: [string, string, string][] = await res.json();
    sentences = arr.map(([zh, vi, en]) => ({ zh, vi, en }));
  }
  const ws = words.filter(Boolean);
  const out: Sentence[] = [];
  const minLen = Math.max(...ws.map((w) => w.length)) + 3;
  for (const s of sentences) {
    if (s.zh.length < minLen) continue;
    if (ws.some((w) => s.zh.includes(w))) {
      out.push(s);
      if (out.length >= limit) break;
    }
  }
  return out;
}

async function charInfo(list: string[]): Promise<CharInfo[]> {
  if (!chars) chars = await (await fetch(new URL('/data/chars.json?v=' + DATA_VERSION, base))).json();
  return list.map((ch) => {
    const c = chars![ch] || ['', '', '', '', '', '', '', 0, ''];
    return {
      ch,
      decomposition: c[0] as string,
      radical: c[1] as string,
      radicalName: c[2] as string,
      etymType: c[3] as string,
      hint: c[4] as string,
      semantic: c[5] as string,
      phonetic: c[6] as string,
      strokes: c[7] as number,
      enDef: c[8] as string,
    };
  });
}

/** Lấy ngẫu nhiên các từ HSK làm phương án nhiễu cho bài kiểm tra */
function randomEntries(count: number, charLen: number, exclude: string[]): DictEntry[] {
  const ex = new Set(exclude);
  const out: DictEntry[] = [];
  const seen = new Set<string>();
  let tries = 0;
  const pool = Math.min(raw.length, 15000);
  while (out.length < count && tries < 5000) {
    tries++;
    const i = Math.floor(Math.random() * pool);
    const e = raw[i];
    if (!e[5] || ex.has(e[0]) || seen.has(e[0])) continue;
    if (charLen && [...e[0]].length !== charLen && tries < 3000) continue;
    seen.add(e[0]);
    out.push(toEntry(i));
  }
  return out;
}

type Req = { id: number; type: string; args: any[] };

self.onmessage = async (ev: MessageEvent<Req>) => {
  const { id, type, args } = ev.data;
  try {
    await ready;
    let result: unknown;
    switch (type) {
      case 'ping': result = raw.length; break;
      case 'search': result = search(args[0], args[1], args[2]); break;
      case 'lookup': result = lookup(args[0]); break;
      case 'segment': result = segment(args[0]); break;
      case 'containing': result = containing(args[0], args[1]); break;
      case 'sentences': result = await getSentences(args[0], args[1]); break;
      case 'chars': result = await charInfo(args[0]); break;
      case 'random': result = randomEntries(args[0], args[1], args[2]); break;
      case 'byIndex': result = (args[0] as number[]).map(toEntry); break;
      default: throw new Error('unknown ' + type);
    }
    self.postMessage({ id, result });
  } catch (e) {
    self.postMessage({ id, error: String(e) });
  }
};
