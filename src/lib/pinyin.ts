// Tiện ích pinyin: chuyển số thanh <-> dấu thanh, chuẩn hoá để tìm kiếm.

const MARKS: Record<string, string[]> = {
  a: ['ā', 'á', 'ǎ', 'à'],
  e: ['ē', 'é', 'ě', 'è'],
  i: ['ī', 'í', 'ǐ', 'ì'],
  o: ['ō', 'ó', 'ǒ', 'ò'],
  u: ['ū', 'ú', 'ǔ', 'ù'],
  ü: ['ǖ', 'ǘ', 'ǚ', 'ǜ'],
};

const UNMARK: Record<string, [string, number]> = {};
for (const [base, arr] of Object.entries(MARKS)) arr.forEach((m, i) => (UNMARK[m] = [base, i + 1]));

/** "xue2" -> "xué", "nu:3" -> "nǚ", "de5" -> "de" */
export function syllableToMarked(syl: string): string {
  const m = syl.match(/^([A-Za-zü:]+)([1-5])$/);
  if (!m) return syl.replace(/u:/g, 'ü').replace(/v/g, 'ü');
  let s = m[1].replace(/u:/g, 'ü').replace(/U:/g, 'Ü');
  const tone = +m[2];
  if (tone === 5) return s;
  const lower = s.toLowerCase();
  let idx = -1;
  if (lower.includes('a')) idx = lower.indexOf('a');
  else if (lower.includes('e')) idx = lower.indexOf('e');
  else if (lower.includes('ou')) idx = lower.indexOf('o');
  else {
    for (let i = lower.length - 1; i >= 0; i--) {
      if ('aeiouü'.includes(lower[i])) { idx = i; break; }
    }
  }
  if (idx < 0) return s;
  const ch = lower[idx];
  let marked = MARKS[ch][tone - 1];
  if (s[idx] !== ch) marked = marked.toUpperCase();
  return s.slice(0, idx) + marked + s.slice(idx + 1);
}

/** "xue2 xi2" -> "xuéxí" (gộp như từ điển) hoặc giữ khoảng trắng nếu spaced=true */
export function numberedToMarked(py: string, spaced = false): string {
  const parts = py.split(' ').map(syllableToMarked);
  return spaced ? parts.join(' ') : parts.join('');
}

export function syllableTone(syl: string): number {
  const m = syl.match(/([1-5])$/);
  return m ? +m[1] : 5;
}

/**
 * Phân tích chuỗi pinyin người dùng gõ (có dấu "xuéxí", có số "xue2xi2" hoặc không thanh "xuexi").
 * Trả về phần chữ (không thanh) và dãy thanh điệu theo thứ tự xuất hiện (bỏ thanh nhẹ 5).
 */
export function parsePinyin(text: string): { bare: string; tones: number[]; hasDigits: boolean } {
  let bare = '';
  const tones: number[] = [];
  let hasDigits = false;
  for (const c of text.normalize('NFC').toLowerCase()) {
    if (UNMARK[c]) {
      const [base, tone] = UNMARK[c];
      bare += base === 'ü' ? 'v' : base;
      tones.push(tone);
    } else if (c === 'ü') bare += 'v';
    else if (/[1-4]/.test(c)) { tones.push(+c); hasDigits = true; }
    else if (c === '5') hasDigits = true;
    else if (/[a-z]/.test(c)) bare += c;
    else if (c === ':' && bare.endsWith('u')) bare = bare.slice(0, -1) + 'v';
  }
  return { bare, tones, hasDigits };
}

/** chuỗi có thể là pinyin không (chỉ chữ latin, dấu thanh, số 1-5, khoảng trắng) */
export function looksLikePinyin(text: string): boolean {
  return /^[a-zA-Zāáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜüv:1-5\s']+$/.test(text.trim());
}

/** chuẩn hoá chuỗi pinyin số "Xue2 xi2"/"nu:3" về dạng khoá: "xue2xi2", "nv3" */
export function pyKeyNum(py: string): string {
  return py.toLowerCase().replace(/u:/g, 'v').replace(/ü/g, 'v').replace(/[\s'·-]/g, '');
}
export function pyKeyBare(py: string): string {
  return pyKeyNum(py).replace(/[1-5]/g, '');
}

/** So sánh đáp án pinyin người dùng gõ với đáp án đúng (pinyin số của từ điển). Thanh nhẹ có thể bỏ qua. */
export function pinyinAnswerMatches(input: string, correctNumbered: string): boolean {
  const a = parsePinyin(input);
  const b = parsePinyin(correctNumbered);
  return a.bare === b.bare && a.tones.join() === b.tones.join();
}

const VI_DIACRITICS =/[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]/i;
export const hasVietDiacritics = (s: string) => VI_DIACRITICS.test(s);
export function stripViet(s: string): string {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D');
}

export const isHanChar = (ch: string) => /\p{Script=Han}/u.test(ch);
export const hasHan = (s: string) => /\p{Script=Han}/u.test(s);

/** Lượng từ dạng "个[ge4]" -> {hanzi:"个", pinyin:"gè"} */
export function parseClassifier(cl: string) {
  const m = cl.match(/^(.+)\[(.+)\]$/);
  return m ? { hanzi: m[1], pinyin: numberedToMarked(m[2]) } : { hanzi: cl, pinyin: '' };
}
