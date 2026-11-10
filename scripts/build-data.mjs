// Dựng database từ dữ liệu thô trong data-raw/ -> public/data/
// Chạy: npm run build:data
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const RAW = path.join(ROOT, 'data-raw');
const OUT = path.join(ROOT, 'public', 'data');
fs.mkdirSync(OUT, { recursive: true });

const read = (f) => fs.readFileSync(path.join(RAW, f), 'utf8');
const isHan = (ch) => /\p{Script=Han}/u.test(ch);
const normPy = (p) => p.toLowerCase().replace(/ü|v/g, 'u:').replace(/\s+/g, '');

// ---------- 1. Hán Việt ----------
console.log('Hán Việt...');
/** trad char -> [{py, hv: string[]}] */
const hvMap = new Map();
for (const line of read('hanviet.csv').split(/\r?\n/).slice(1)) {
  const m = line.match(/^(.+?),"?\[(.*?)\]"?,(.+)$/);
  if (!m) continue;
  const hv = [...m[2].matchAll(/'([^']+)'/g)].map((x) => x[1]);
  if (!hv.length) continue;
  if (!hvMap.has(m[1])) hvMap.set(m[1], []);
  hvMap.get(m[1]).push({ py: m[3].trim().toLowerCase(), hv });
}

// Unihan: kVietnamese (fallback), kTotalStrokes, biến thể phồn/giản
const unihanViet = new Map();
const strokes = new Map();
const cp = (u) => String.fromCodePoint(parseInt(u.slice(2), 16));
for (const f of ['Unihan_Readings.txt', 'Unihan_IRGSources.txt']) {
  for (const line of read(path.join('unihan', f)).split('\n')) {
    const [u, key, val] = line.split('\t');
    if (!u.startsWith('U+')) continue;
    if (key === 'kVietnamese') unihanViet.set(cp(u), val.trim().split(/\s+/));
    else if (key === 'kTotalStrokes') strokes.set(cp(u), parseInt(val));
  }
}

function hvForSyllable(chars, py) {
  for (const ch of chars) {
    const list = hvMap.get(ch);
    if (!list) continue;
    if (py) {
      const p = py.toLowerCase();
      let hit = list.find((x) => x.py === p);
      if (!hit) {
        const bare = p.replace(/\d/g, '');
        hit = list.find((x) => x.py.replace(/\d/g, '') === bare);
      }
      if (hit) return hit.hv;
    }
    const star = list.find((x) => x.py === '*');
    if (star) return star.hv;
    return list[0].hv;
  }
  for (const ch of chars) if (unihanViet.has(ch)) return unihanViet.get(ch).slice(0, 1);
  return null;
}

function hanViet(trad, simp, pinyin) {
  const tc = [...trad], sc = [...simp];
  const sy = pinyin.split(' ');
  const aligned = tc.length === sy.length;
  const parts = [];
  for (let i = 0; i < tc.length; i++) {
    if (!isHan(tc[i])) continue;
    const r = hvForSyllable([tc[i], sc[i]].filter(Boolean), aligned ? sy[i] : null);
    if (!r) return '';
    parts.push(tc.length === 1 ? r.join(', ') : r[0]);
  }
  return parts.join(' ');
}

// ---------- 2. HSK ----------
console.log('HSK...');
const hsk = new Map(); // simp|normPy -> {n, o, q}
const hskBySimp = new Map();
for (const e of JSON.parse(read('hsk.min.json'))) {
  const n = e.l.filter((x) => x[0] === 'n').map((x) => +x.slice(1))[0] || 0;
  const o = e.l.filter((x) => x[0] === 'o').map((x) => +x.slice(1))[0] || 0;
  const q = e.q && e.q < 1000000 ? e.q : 0;
  for (const f of e.f) {
    const info = { n, o, q };
    hsk.set(e.s + '|' + normPy(f.i.n), info);
    if (!hskBySimp.has(e.s)) hskBySimp.set(e.s, info);
  }
}

// ---------- 3. CVDICT ----------
console.log('CVDICT...');
const entries = [];
for (const line of read('CVDICT.u8').split(/\r?\n/)) {
  if (!line || line[0] === '#') continue;
  const m = line.match(/^(\S+) (\S+) \[([^\]]*)\] \/(.*)\/$/);
  if (!m) continue;
  const [, trad, simp, pinyin, rawDefs] = m;
  const defs = [], cl = [];
  for (const d of rawDefs.split('/')) {
    let t = d.trim();
    // lượng từ nằm trong ngoặc giữa nghĩa: "mèo (LT: 隻|只[zhi1])"
    t = t.replace(/\s*\((?:LT|Lượng từ)\s*:\s*([^)]*)\)/gi, (_, inner) => {
      for (const c of inner.split(',')) {
        const mm = c.trim().match(/^(?:(\S+?)\|)?(\S+?)\[([^\]]+)\]$/);
        if (mm) cl.push(mm[2] + '[' + mm[3] + ']');
      }
      return '';
    }).trim();
    if (!t) continue;
    const lt = t.match(/^(?:LT|Lượng từ)\s*:\s*(.*)$/i);
    if (lt) {
      for (const c of lt[1].split(',')) {
        const mm = c.trim().match(/^(?:(\S+?)\|)?(\S+?)\[([^\]]+)\]$/);
        if (mm) cl.push(mm[2] + '[' + mm[3] + ']');
      }
    } else defs.push(t);
  }
  if (!defs.length) continue;
  entries.push({ trad, simp, pinyin, defs, cl });
}
console.log('  entries:', entries.length);

// ---------- 4. Tatoeba: câu ví dụ + tần suất ----------
console.log('Tatoeba...');
const loadSent = (f) => {
  const m = new Map();
  for (const line of read(f).split('\n')) {
    const [id, , text] = line.split('\t');
    if (text) m.set(id, text.trim());
  }
  return m;
};
const cmn = loadSent('cmn_sentences.tsv');
const vie = loadSent('vie_sentences.tsv');
const engIds = new Set();
const cmnEng = new Map(), cmnVie = new Map();
for (const line of read('cmn-eng_links.tsv').split('\n')) {
  const [a, b] = line.split('\t');
  if (a && b && !cmnEng.has(a)) { cmnEng.set(a, b.trim()); engIds.add(b.trim()); }
}
for (const line of read('cmn-vie_links.tsv').split('\n')) {
  const [a, b] = line.split('\t');
  if (a && b && vie.has(b.trim()) && !cmnVie.has(a)) cmnVie.set(a, vie.get(b.trim()));
}
console.log('  reading english sentences...');
const eng = new Map();
{
  const txt = read('eng_sentences.tsv');
  let i = 0;
  while (i < txt.length) {
    let j = txt.indexOf('\n', i); if (j < 0) j = txt.length;
    const t1 = txt.indexOf('\t', i);
    const id = txt.slice(i, t1);
    if (engIds.has(id)) eng.set(id, txt.slice(txt.indexOf('\t', t1 + 1) + 1, j).trim());
    i = j + 1;
  }
}
const sentences = [];
for (const [id, zh] of cmn) {
  const vi = cmnVie.get(id) || '';
  const en = cmnEng.has(id) ? eng.get(cmnEng.get(id)) || '' : '';
  if (!vi && !en) continue;
  if ([...zh].length > 40) continue;
  sentences.push([zh, vi, en]);
}
// ưu tiên câu có tiếng Việt, rồi câu ngắn
sentences.sort((a, b) => (b[1] ? 1 : 0) - (a[1] ? 1 : 0) || a[0].length - b[0].length);
console.log('  sentences:', sentences.length);

// tần suất từ trong corpus bằng tách từ tham lam (longest match)
const wordSet = new Set();
let maxLen = 1;
for (const e of entries) {
  wordSet.add(e.simp); wordSet.add(e.trad);
  maxLen = Math.max(maxLen, [...e.simp].length);
}
maxLen = Math.min(maxLen, 8);
const corpusCount = new Map();
for (const zh of cmn.values()) {
  const cs = [...zh];
  for (let i = 0; i < cs.length;) {
    let len = Math.min(maxLen, cs.length - i);
    for (; len > 1; len--) if (wordSet.has(cs.slice(i, i + len).join(''))) break;
    const w = cs.slice(i, i + len).join('');
    if (wordSet.has(w)) corpusCount.set(w, (corpusCount.get(w) || 0) + 1);
    i += len;
  }
}

// ---------- 5. Gộp & xếp hạng ----------
console.log('Merge...');
const isJunk = (e) => /^(họ |biến thể|dạng (cổ|phồn thể|khác)|xem |cũng viết là|giống như)/i.test(e.defs[0]);
const isProper = (e) => /[A-Z]/.test(e.pinyin);
const out = entries.map((e) => {
  const h = hsk.get(e.simp + '|' + normPy(e.pinyin)) || null;
  const cnt = (corpusCount.get(e.simp) || 0) + (e.trad !== e.simp ? corpusCount.get(e.trad) || 0 : 0);
  let rank;
  if (h && h.q) rank = h.q;
  else if (h) rank = 40000;
  else if (cnt) rank = 50000 - Math.min(cnt, 9999);
  else rank = 100000 + [...e.simp].length * 1000;
  if (isJunk(e)) rank += 200000;
  else if (isProper(e) && !h) rank += 20000;
  return [
    e.simp, e.trad, e.pinyin, e.defs,
    hanViet(e.trad, e.simp, e.pinyin),
    h ? h.n : 0, h ? h.o : 0, rank, e.cl,
  ];
});
out.sort((a, b) => a[7] - b[7]);
const hvMissing = out.filter((e) => !e[4] && [...e[0]].some(isHan)).length;
console.log('  missing hanviet:', hvMissing);
fs.writeFileSync(path.join(OUT, 'dict.json'), JSON.stringify(out));

// ---------- 6. Chữ (bộ thủ, cấu tạo, số nét) ----------
console.log('Chars...');
const RADICAL_VARIANTS = {
  '氵': 'thủy', '亻': 'nhân', '扌': 'thủ', '忄': 'tâm', '艹': 'thảo', '讠': 'ngôn', '钅': 'kim', '饣': 'thực',
  '纟': 'mịch', '辶': 'sước', '阝': 'phụ / ấp', '犭': 'khuyển', '礻': 'thị', '衤': 'y', '刂': 'đao', '冫': 'băng',
  '灬': 'hỏa', '爫': 'trảo', '罒': 'võng', '⺮': 'trúc', '覀': 'á', '牜': 'ngưu', '⺈': 'đao', '彐': 'kệ',
  '糹': 'mịch', '釒': 'kim', '飠': 'thực', '訁': 'ngôn', '⻊': 'túc', '𧾷': 'túc', '⺌': 'tiểu', '⺊': 'bốc',
  '丬': 'tường', '⺍': 'tiểu', '⺧': 'ngưu', '⺶': 'dương', '⺷': 'dương', '⺼': 'nhục', '⻖': 'phụ', '⻏': 'ấp',
  '⺗': 'tâm', '⺡': 'thủy', '⺘': 'thủ', '⺅': 'nhân', '⺨': 'khuyển', '⺪': 'sơ', '⺫': 'võng', '⻗': 'vũ',
  '⻌': 'sước', '⻍': 'sước', '⻎': 'sước', '⺤': 'trảo', '⺥': 'trảo', '⺦': 'sửu', '⺩': 'ngọc', '王': 'ngọc / vương',
  '月': 'nguyệt / nhục', '⺝': 'nguyệt', '⺺': 'duật', '⺻': 'duật', '⺾': 'thảo', '⺿': 'thảo', '⻀': 'thảo',
  '⻂': 'y', '⻃': 'á', '⻄': 'á', '⻅': 'kiến', '⻆': 'giác', '⻈': 'ngôn', '⻉': 'bối', '⻋': 'xa', '⻐': 'kim',
  '⻓': 'trường', '⻔': 'môn', '⻚': 'hiệt', '⻛': 'phong', '⻜': 'phi', '⻝': 'thực', '⻢': 'mã', '⻥': 'ngư',
  '⻦': 'điểu', '⻧': 'lỗ', '⻨': 'mạch', '⻩': 'hoàng', '⻬': 'tề', '⻮': 'xỉ', '⻯': 'long', '⻳': 'quy',
};
const charsInDict = new Set();
for (const e of out) for (const ch of [...e[0], ...e[1]]) if (isHan(ch)) charsInDict.add(ch);
const singleHv = new Map(); // char -> hv của mục 1 chữ phổ biến nhất
for (const e of out) {
  if ([...e[0]].length === 1 && e[4] && !singleHv.has(e[0])) singleHv.set(e[0], e[4].split(', ')[0]);
  if ([...e[1]].length === 1 && e[4] && !singleHv.has(e[1])) singleHv.set(e[1], e[4].split(', ')[0]);
}
const radName = (r) => RADICAL_VARIANTS[r] || singleHv.get(r) || (hvMap.get(r)?.[0]?.hv[0]) || (unihanViet.get(r)?.[0]) || '';
const chars = {};
for (const line of read('makemeahanzi.txt').split('\n')) {
  if (!line.trim()) continue;
  const c = JSON.parse(line);
  if (!charsInDict.has(c.character)) continue;
  const et = c.etymology || {};
  chars[c.character] = [
    c.decomposition && c.decomposition !== '？' ? c.decomposition : '',
    c.radical || '', radName(c.radical || ''),
    et.type || '', et.hint || '', et.semantic || '', et.phonetic || '',
    strokes.get(c.character) || 0,
    c.definition || '',
  ];
}
for (const ch of charsInDict) {
  if (!chars[ch]) chars[ch] = ['', '', '', '', '', '', '', strokes.get(ch) || 0, ''];
}
fs.writeFileSync(path.join(OUT, 'chars.json'), JSON.stringify(chars));
fs.writeFileSync(path.join(OUT, 'sentences.json'), JSON.stringify(sentences));

// ---------- 7. Dữ liệu nhận diện chữ viết tay ----------
for (const f of ['mmah.json', 'orig.json', 'hanzilookup.min.js']) {
  fs.copyFileSync(path.join(RAW, f), path.join(OUT, f));
}
for (const f of fs.readdirSync(OUT)) {
  console.log('  ', f, (fs.statSync(path.join(OUT, f)).size / 1e6).toFixed(2), 'MB');
}
console.log('Xong.');

// phiên bản dữ liệu (để service worker / trình duyệt tải lại khi database thay đổi)
import crypto from 'node:crypto';
const hash = crypto.createHash('sha1');
for (const f of ['dict.json', 'chars.json', 'sentences.json']) hash.update(fs.readFileSync(path.join(OUT, f)));
fs.writeFileSync(path.join(ROOT, 'src', 'lib', 'dataVersion.ts'), `export const DATA_VERSION = '${hash.digest('hex').slice(0, 10)}';\n`);
