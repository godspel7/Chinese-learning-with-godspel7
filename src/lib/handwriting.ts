// Nhận diện chữ viết tay bằng HanziLookupJS (chạy hoàn toàn trên trình duyệt)
declare global {
  interface Window {
    HanziLookup: any;
  }
}

let loading: Promise<void> | null = null;

function loadScript(src: string) {
  return new Promise<void>((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('Không tải được ' + src));
    document.head.appendChild(s);
  });
}

function initData(name: string, url: string) {
  return new Promise<void>((resolve, reject) => {
    window.HanziLookup.init(name, url, (ok: boolean) => (ok ? resolve() : reject(new Error('Lỗi dữ liệu ' + name))));
  });
}

export function loadHandwriting() {
  if (!loading) {
    loading = (async () => {
      await loadScript('/data/hanzilookup.min.js');
      await Promise.all([initData('mmah', '/data/mmah.json'), initData('orig', '/data/orig.json')]);
    })();
    loading.catch(() => (loading = null));
  }
  return loading;
}

export type Stroke = [number, number][];

export async function recognize(strokes: Stroke[], limit = 12): Promise<string[]> {
  await loadHandwriting();
  const HL = window.HanziLookup;
  const analyzed = new HL.AnalyzedCharacter(strokes);
  const run = (name: string) =>
    new Promise<string[]>((resolve) =>
      new HL.Matcher(name).match(analyzed, limit, (m: { character: string }[]) => resolve(m.map((x) => x.character))),
    );
  const [a, b] = await Promise.all([run('mmah'), run('orig')]);
  // trộn kết quả hai bộ dữ liệu, ưu tiên mmah (có vị trí nét)
  const out: string[] = [];
  for (let i = 0; i < limit; i++) {
    for (const c of [a[i], b[i]]) if (c && !out.includes(c)) out.push(c);
  }
  return out.slice(0, limit);
}
