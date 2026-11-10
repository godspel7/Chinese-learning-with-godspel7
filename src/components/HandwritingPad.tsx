import { useEffect, useRef, useState } from 'react';
import { loadHandwriting, recognize, type Stroke } from '../lib/handwriting';

/** Bảng viết tay: vẽ chữ bằng chuột / bút cảm ứng, gợi ý chữ Hán khớp nhất */
export function HandwritingPad({ onPick, size = 260 }: { onPick: (ch: string) => void; size?: number }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const strokes = useRef<Stroke[]>([]);
  const current = useRef<Stroke | null>(null);
  const [cands, setCands] = useState<string[]>([]);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');

  useEffect(() => {
    loadHandwriting().then(() => setStatus('ready'), () => setStatus('error'));
  }, []);

  const redraw = () => {
    const c = canvas.current!;
    const ctx = c.getContext('2d')!;
    const dpr = window.devicePixelRatio || 1;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, size, size);
    // lưới chữ điền
    const css = getComputedStyle(c);
    ctx.strokeStyle = css.getPropertyValue('--grid').trim() || '#e5d9c8';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(size / 2, 0); ctx.lineTo(size / 2, size);
    ctx.moveTo(0, size / 2); ctx.lineTo(size, size / 2);
    ctx.moveTo(0, 0); ctx.lineTo(size, size);
    ctx.moveTo(size, 0); ctx.lineTo(0, size);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.strokeStyle = css.getPropertyValue('--ink').trim() || '#222';
    ctx.lineWidth = 5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (const s of [...strokes.current, ...(current.current ? [current.current] : [])]) {
      ctx.beginPath();
      s.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
      if (s.length === 1) ctx.lineTo(s[0][0] + 0.1, s[0][1]);
      ctx.stroke();
    }
  };

  useEffect(() => {
    const c = canvas.current!;
    const dpr = window.devicePixelRatio || 1;
    c.width = size * dpr;
    c.height = size * dpr;
    redraw();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [size]);

  const pos = (e: React.PointerEvent): [number, number] => {
    const r = canvas.current!.getBoundingClientRect();
    return [Math.round(((e.clientX - r.left) / r.width) * size), Math.round(((e.clientY - r.top) / r.height) * size)];
  };

  const run = async () => {
    if (!strokes.current.length) return setCands([]);
    try {
      setCands(await recognize(strokes.current));
    } catch {
      setStatus('error');
    }
  };

  const clear = () => {
    strokes.current = [];
    redraw();
    setCands([]);
  };

  return (
    <div className="hw-pad">
      <canvas
        ref={canvas}
        className="hw-canvas"
        style={{ width: size, height: size }}
        onPointerDown={(e) => {
          (e.target as HTMLElement).setPointerCapture(e.pointerId);
          current.current = [pos(e)];
          redraw();
        }}
        onPointerMove={(e) => {
          if (!current.current) return;
          current.current.push(pos(e));
          redraw();
        }}
        onPointerUp={() => {
          if (current.current) strokes.current.push(current.current);
          current.current = null;
          redraw();
          run();
        }}
      />
      <div className="hw-side">
        <div className="hw-cands">
          {status === 'loading' && <span className="muted">Đang tải bộ nhận diện…</span>}
          {status === 'error' && <span className="error">Không tải được dữ liệu nhận diện.</span>}
          {status === 'ready' && !cands.length && <span className="muted">Viết một chữ vào ô bên trái</span>}
          {cands.map((c) => (
            <button key={c} className="hw-cand han" onClick={() => { onPick(c); clear(); }}>
              {c}
            </button>
          ))}
        </div>
        <div className="row gap">
          <button className="btn ghost sm" onClick={() => { strokes.current.pop(); redraw(); run(); }}>↶ Xoá nét</button>
          <button className="btn ghost sm" onClick={clear}>Xoá hết</button>
        </div>
      </div>
    </div>
  );
}
