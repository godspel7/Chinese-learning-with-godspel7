export interface DictEntry {
  /** chỉ số trong từ điển */
  i: number;
  /** giản thể */
  s: string;
  /** phồn thể */
  t: string;
  /** pinyin dạng số, cách nhau bởi khoảng trắng: "xue2 xi2" */
  p: string;
  /** các nghĩa tiếng Việt */
  d: string[];
  /** âm Hán Việt */
  hv: string;
  /** cấp HSK 3.0 (1-7, 7 = 7-9), 0 nếu không có */
  hn: number;
  /** cấp HSK cũ (1-6) */
  ho: number;
  /** hạng phổ biến (nhỏ = phổ biến) */
  r: number;
  /** lượng từ: ["个[ge4]"] */
  cl: string[];
}

export type RawEntry = [string, string, string, string[], string, number, number, number, string[]];

export interface CharInfo {
  ch: string;
  decomposition: string;
  radical: string;
  radicalName: string;
  etymType: string;
  hint: string;
  semantic: string;
  phonetic: string;
  strokes: number;
  enDef: string;
}

export interface Sentence {
  zh: string;
  vi: string;
  en: string;
}

export interface Token {
  w: string;
  entry: DictEntry | null;
}

export type SearchMode = 'auto' | 'pinyin' | 'hanviet' | 'meaning' | 'hanzi';

export interface SearchHit {
  entry: DictEntry;
  /** cách khớp: pinyin / hanviet / meaning / hanzi */
  via: string;
}
