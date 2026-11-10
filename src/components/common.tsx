import { useEffect, useState, type ReactNode } from 'react';
import { numberedToMarked, syllableToMarked, syllableTone } from '../lib/pinyin';
import { speak } from '../lib/tts';

/** Pinyin tô màu theo thanh điệu */
export function Pinyin({ py, className = '' }: { py: string; className?: string }) {
  const syl = py.split(' ');
  return (
    <span className={'pinyin ' + className}>
      {syl.map((s, i) => (
        <span key={i} className={'tone' + syllableTone(s)}>
          {syllableToMarked(s)}
          {i < syl.length - 1 ? ' ' : ''}
        </span>
      ))}
    </span>
  );
}

export const pinyinText = (py: string) => numberedToMarked(py, true);

export function SpeakButton({ text, small, title = 'Nghe phát âm' }: { text: string; small?: boolean; title?: string }) {
  return (
    <button
      type="button"
      className={'icon-btn speak' + (small ? ' sm' : '')}
      title={title}
      aria-label={title}
      onClick={(e) => {
        e.stopPropagation();
        speak(text);
      }}
    >
      <svg viewBox="0 0 24 24" width={small ? 16 : 20} height={small ? 16 : 20} aria-hidden>
        <path fill="currentColor" d="M3 10v4h4l5 4V6L7 10H3zm13.5 2a4.5 4.5 0 0 0-2.5-4v8a4.5 4.5 0 0 0 2.5-4zM14 3.2v2.1a7 7 0 0 1 0 13.4v2.1a9 9 0 0 0 0-17.6z" />
      </svg>
    </button>
  );
}

export function HskBadge({ hn, ho }: { hn: number; ho?: number }) {
  if (!hn && !ho) return null;
  return (
    <span className="badge hsk" title={`HSK 3.0: ${hn ? (hn === 7 ? '7-9' : hn) : '—'} · HSK cũ: ${ho || '—'}`}>
      HSK {hn ? (hn === 7 ? '7-9' : hn) : ho}
    </span>
  );
}

export function Modal({ open, onClose, title, children, wide }: { open: boolean; onClose: () => void; title: string; children: ReactNode; wide?: boolean }) {
  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div className={'modal' + (wide ? ' wide' : '')} onMouseDown={(e) => e.stopPropagation()} role="dialog" aria-label={title}>
        <div className="modal-head">
          <h3>{title}</h3>
          <button className="icon-btn" onClick={onClose} aria-label="Đóng">✕</button>
        </div>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  );
}

// ---- toast đơn giản ----
let pushToast: (msg: string) => void = () => {};
export const toast = (msg: string) => pushToast(msg);
export function Toaster() {
  const [items, setItems] = useState<{ id: number; msg: string }[]>([]);
  useEffect(() => {
    pushToast = (msg) => {
      const id = Date.now() + Math.random();
      setItems((x) => [...x, { id, msg }]);
      setTimeout(() => setItems((x) => x.filter((i) => i.id !== id)), 2600);
    };
  }, []);
  return (
    <div className="toaster" aria-live="polite">
      {items.map((t) => (
        <div key={t.id} className="toast">{t.msg}</div>
      ))}
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="empty">{children}</div>;
}

export function Spinner({ label = 'Đang tải…' }: { label?: string }) {
  return <div className="spinner-wrap"><span className="spinner" /> {label}</div>;
}
