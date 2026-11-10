// Client gọi Web Worker từ điển
import type { CharInfo, DictEntry, SearchHit, SearchMode, Sentence, Token } from './types';

const worker = new Worker(new URL('../workers/dict.worker.ts', import.meta.url), { type: 'module' });
let seq = 0;
const pending = new Map<number, { resolve: (v: any) => void; reject: (e: any) => void }>();
worker.onmessage = (ev) => {
  const { id, result, error } = ev.data;
  const p = pending.get(id);
  if (!p) return;
  pending.delete(id);
  if (error) p.reject(new Error(error));
  else p.resolve(result);
};

function call<T>(type: string, ...args: unknown[]): Promise<T> {
  const id = ++seq;
  return new Promise<T>((resolve, reject) => {
    pending.set(id, { resolve, reject });
    worker.postMessage({ id, type, args });
  });
}

export const dict = {
  ready: () => call<number>('ping'),
  search: (q: string, mode: SearchMode = 'auto', limit = 60) => call<SearchHit[]>('search', q, mode, limit),
  lookup: (word: string) => call<DictEntry[]>('lookup', word),
  segment: (text: string) => call<Token[]>('segment', text),
  containing: (ch: string, limit = 30) => call<DictEntry[]>('containing', ch, limit),
  sentences: (words: string[], limit = 6) => call<Sentence[]>('sentences', words, limit),
  chars: (list: string[]) => call<CharInfo[]>('chars', list),
  random: (count: number, charLen: number, exclude: string[]) => call<DictEntry[]>('random', count, charLen, exclude),
};
