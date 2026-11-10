// Sao lưu / khôi phục / xuất CSV & Anki
import { createEmptyCard } from 'ts-fsrs';
import { cardToStored, db, wordKey, type Word } from './db';
import { numberedToMarked } from './pinyin';
import { dict } from './dict';

function download(name: string, content: string, type: string) {
  const blob = new Blob([content], { type });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

const stamp = () => new Date().toISOString().slice(0, 10);

export async function exportJson() {
  const data = {
    app: 'hoc-tieng-trung',
    version: 1,
    exportedAt: new Date().toISOString(),
    words: await db.words.toArray(),
    reviews: await db.reviews.toArray(),
    stories: await db.stories.toArray(),
  };
  download(`von-tu-${stamp()}.json`, JSON.stringify(data), 'application/json');
}

export async function importJson(file: File, replace: boolean): Promise<string> {
  const data = JSON.parse(await file.text());
  if (data.app !== 'hoc-tieng-trung' || !Array.isArray(data.words)) throw new Error('File không đúng định dạng sao lưu.');
  await db.transaction('rw', db.words, db.reviews, db.stories, async () => {
    if (replace) {
      await db.words.clear();
      await db.reviews.clear();
      await db.stories.clear();
      await db.words.bulkAdd(data.words);
      await db.reviews.bulkAdd(data.reviews || []);
      await db.stories.bulkAdd(data.stories || []);
    } else {
      for (const w of data.words as Word[]) {
        const exists = await db.words.where('key').equals(w.key).first();
        if (!exists) {
          const { id: _id, ...rest } = w;
          await db.words.add(rest);
        }
      }
    }
  });
  return `Đã nhập ${data.words.length} từ${replace ? ' (thay thế toàn bộ)' : ' (gộp, bỏ qua từ trùng)'}.`;
}

const csvCell = (s: string) => (/[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);

export async function exportCsv() {
  const words = await db.words.orderBy('createdAt').toArray();
  const rows = [['hanzi', 'phon_the', 'pinyin', 'han_viet', 'nghia', 'tags', 'ghi_chu']];
  for (const w of words) rows.push([w.simp, w.trad, numberedToMarked(w.pinyin, true), w.hv, w.meaning, w.tags.join(' '), w.note]);
  download(`von-tu-${stamp()}.csv`, '﻿' + rows.map((r) => r.map(csvCell).join(',')).join('\n'), 'text/csv');
}

/** Xuất file TSV để nhập vào Anki (File > Import), mặt trước = chữ Hán, mặt sau = pinyin + nghĩa */
export async function exportAnki() {
  const words = await db.words.orderBy('createdAt').toArray();
  const lines = ['#separator:tab', '#html:true', '#tags column:4'];
  for (const w of words) {
    const back = `${numberedToMarked(w.pinyin, true)}<br>${w.hv ? `<i>${w.hv}</i><br>` : ''}${w.meaning}`;
    lines.push([w.simp, back.replace(/\t|\n/g, ' '), w.trad, w.tags.join(' ')].join('\t'));
  }
  download(`anki-von-tu-${stamp()}.txt`, lines.join('\n'), 'text/plain');
}

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [], cell = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') q = false;
      else cell += c;
    } else if (c === '"') q = true;
    else if (c === ',' || c === '\t') { row.push(cell); cell = ''; }
    else if (c === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; }
    else if (c !== '\r') cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows;
}

/** Nhập CSV: cột 1 = chữ Hán (bắt buộc); có thể có cột pinyin, nghĩa, tags. Thiếu thì tự tra từ điển. */
export async function importCsv(file: File, extraTag: string): Promise<string> {
  const rows = parseCsv((await file.text()).replace(/^﻿/, ''));
  if (!rows.length) return 'File rỗng.';
  const header = rows[0].map((h) => h.trim().toLowerCase());
  const hasHeader = header.includes('hanzi');
  const col = (name: string, fallback: number) => (hasHeader ? header.indexOf(name) : fallback);
  const ci = { hanzi: col('hanzi', 0), nghia: col('nghia', -1), tags: col('tags', -1) };
  let added = 0, skipped = 0;
  for (const r of rows.slice(hasHeader ? 1 : 0)) {
    const hanzi = (r[ci.hanzi] || '').trim();
    if (!hanzi) continue;
    const entries = await dict.lookup(hanzi);
    const e = entries[0];
    if (!e) { skipped++; continue; }
    const tags = [...(ci.tags >= 0 ? (r[ci.tags] || '').split(/\s+/).filter(Boolean) : []), ...(extraTag ? [extraTag] : [])];
    const key = wordKey(e.s, e.p);
    if (await db.words.where('key').equals(key).first()) { skipped++; continue; }
    const card = cardToStored(createEmptyCard(new Date()));
    await db.words.add({
      key, simp: e.s, trad: e.t, pinyin: e.p,
      meaning: (ci.nghia >= 0 && r[ci.nghia]?.trim()) || e.d.slice(0, 4).join('; '),
      hv: e.hv, hsk: e.hn, tags, note: '', createdAt: Date.now(), card, due: card.due, correct: 0, wrong: 0,
    });
    added++;
  }
  return `Đã thêm ${added} từ, bỏ qua ${skipped} (trùng hoặc không có trong từ điển).`;
}
