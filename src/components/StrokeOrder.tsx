import { useEffect, useRef, useState } from 'react';
import HanziWriter from 'hanzi-writer';

function cssVar(name: string, fallback: string) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
}

/** Hoạt hình thứ tự nét cho 1 chữ */
export function StrokeAnim({ ch, size = 140 }: { ch: string; size?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const writer = useRef<HanziWriter | null>(null);
  const [err, setErr] = useState(false);

  useEffect(() => {
    if (!ref.current) return;
    ref.current.innerHTML = '';
    setErr(false);
    writer.current = HanziWriter.create(ref.current, ch, {
      width: size,
      height: size,
      padding: 6,
      strokeColor: cssVar('--ink', '#222'),
      radicalColor: cssVar('--accent', '#c0392b'),
      outlineColor: cssVar('--grid', '#ddd'),
      strokeAnimationSpeed: 1.2,
      delayBetweenStrokes: 220,
      showCharacter: true,
      onLoadCharDataError: () => setErr(true),
    });
    return () => { writer.current = null; };
  }, [ch, size]);

  return (
    <div className="stroke-box">
      <div ref={ref} className="tian" style={{ width: size, height: size }} onClick={() => writer.current?.animateCharacter()} title="Bấm để xem lại" />
      {err ? (
        <span className="muted sm">Chưa có dữ liệu nét</span>
      ) : (
        <button className="btn ghost sm" onClick={() => writer.current?.animateCharacter()}>▶ Thứ tự nét</button>
      )}
    </div>
  );
}

/** Luyện viết: tự viết lại chữ, được chấm theo từng nét */
export function WriteQuiz({
  ch, size = 260, showOutline = true, onDone, hintAfter = 3,
}: { ch: string; size?: number; showOutline?: boolean; hintAfter?: number; onDone?: (mistakes: number) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const writer = useRef<HanziWriter | null>(null);
  const [mistakes, setMistakes] = useState(0);
  const [done, setDone] = useState(false);
  const [err, setErr] = useState(false);
  const doneRef = useRef(onDone);
  doneRef.current = onDone;

  const start = () => {
    setMistakes(0);
    setDone(false);
    writer.current?.quiz({
      showHintAfterMisses: hintAfter,
      onMistake: (d) => setMistakes(d.totalMistakes),
      onComplete: (d) => {
        setDone(true);
        doneRef.current?.(d.totalMistakes);
      },
    });
  };

  useEffect(() => {
    if (!ref.current) return;
    ref.current.innerHTML = '';
    setErr(false);
    writer.current = HanziWriter.create(ref.current, ch, {
      width: size,
      height: size,
      padding: 10,
      showCharacter: false,
      showOutline,
      strokeColor: cssVar('--ink', '#222'),
      outlineColor: cssVar('--grid', '#ddd'),
      drawingColor: cssVar('--accent', '#c0392b'),
      highlightColor: cssVar('--good', '#2e7d32'),
      drawingWidth: 6,
      onLoadCharDataError: () => setErr(true),
    });
    start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ch, size, showOutline]);

  if (err) return <div className="muted">Chưa có dữ liệu nét cho chữ {ch}.</div>;
  return (
    <div className="write-quiz">
      <div ref={ref} className="tian big" style={{ width: size, height: size }} />
      <div className="row gap center">
        <span className={mistakes ? 'error' : 'muted'}>Sai: {mistakes} nét</span>
        {done && <span className="good">✓ Hoàn thành</span>}
      </div>
      <div className="row gap center">
        <button className="btn ghost sm" onClick={() => writer.current?.animateCharacter({ onComplete: start })}>Xem mẫu</button>
        <button className="btn ghost sm" onClick={start}>Viết lại</button>
      </div>
    </div>
  );
}
