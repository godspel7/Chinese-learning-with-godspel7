import { lazy, Suspense, useEffect, useState } from 'react';
import { createHashRouter, NavLink, Outlet, RouterProvider, useRouteError } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from './lib/db';
import { dict } from './lib/dict';
import { Spinner, Toaster } from './components/common';
import Home from './pages/Home';
import Lookup from './pages/Lookup';

const Vocab = lazy(() => import('./pages/Vocab'));
const Review = lazy(() => import('./pages/Review'));
const Quiz = lazy(() => import('./pages/Quiz'));
const Writing = lazy(() => import('./pages/Writing'));
const Reading = lazy(() => import('./pages/Reading'));
const Stats = lazy(() => import('./pages/Stats'));
const Settings = lazy(() => import('./pages/Settings'));

const NAV = [
  { to: '/', label: 'Trang chủ', icon: '⌂', end: true },
  { to: '/tra-tu', label: 'Tra từ', icon: '查' },
  { to: '/von-tu', label: 'Vốn từ', icon: '词' },
  { to: '/on-tap', label: 'Ôn tập', icon: '复' },
  { to: '/kiem-tra', label: 'Kiểm tra', icon: '考' },
  { to: '/luyen-viet', label: 'Luyện viết', icon: '写' },
  { to: '/doc', label: 'Bài đọc AI', icon: '读' },
  { to: '/thong-ke', label: 'Thống kê', icon: '计' },
  { to: '/cai-dat', label: 'Cài đặt', icon: '设' },
];

function Layout() {
  const [dictState, setDictState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [count, setCount] = useState(0);
  const due = useLiveQuery(() => db.words.where('due').belowOrEqual(Date.now()).filter((w) => w.card.state !== 0).count(), [], 0);
  const [theme, setTheme] = useState<string>(() => {
    try { return localStorage.getItem('theme') || ''; } catch { return ''; }
  });

  useEffect(() => {
    const clearFlag = setTimeout(() => { try { sessionStorage.removeItem('reloaded-for-update'); } catch { /* bỏ qua */ } }, 10000);
    dict.ready().then((n) => { setCount(n); setDictState('ready'); }, () => setDictState('error'));
    return () => clearTimeout(clearFlag);
  }, []);
  useEffect(() => {
    if (theme) document.documentElement.dataset.theme = theme;
    else delete document.documentElement.dataset.theme;
    try { localStorage.setItem('theme', theme); } catch { /* bỏ qua */ }
  }, [theme]);

  return (
    <div className="app">
      <nav className="sidebar" aria-label="Điều hướng chính">
        <div className="brand"><span className="han brand-mark">汉</span><span>Học tiếng Trung</span></div>
        {NAV.map((n) => (
          <NavLink key={n.to} to={n.to} end={n.end} className={({ isActive }) => 'nav' + (isActive ? ' on' : '')}>
            <span className="han nav-ico">{n.icon}</span>
            <span>{n.label}</span>
            {n.to === '/on-tap' && due > 0 && <span className="nav-badge">{due}</span>}
          </NavLink>
        ))}
        <div className="sidebar-foot">
          <div className="muted sm">
            {dictState === 'loading' && <><span className="spinner sm" /> Đang nạp từ điển…</>}
            {dictState === 'ready' && <>Từ điển: {count.toLocaleString('vi-VN')} từ</>}
            {dictState === 'error' && <span className="error">Lỗi nạp từ điển</span>}
          </div>
          <button className="btn ghost sm" onClick={() => setTheme(theme === 'dark' ? 'light' : theme === 'light' ? '' : 'dark')}>
            {theme === 'dark' ? '🌙 Tối' : theme === 'light' ? '☀ Sáng' : '◐ Theo hệ thống'}
          </button>
        </div>
      </nav>
      <main className="content">
        <Suspense fallback={<Spinner />}>
          <Outlet />
        </Suspense>
      </main>
      <Toaster />
    </div>
  );
}

/** Lỗi trang: nếu do bản mới vừa deploy (file chunk cũ không còn) thì tự tải lại */
function RouteError() {
  const err = useRouteError() as Error;
  const msg = String(err?.message || err);
  const stale = /dynamically imported module|Importing a module script failed|error loading dynamically/i.test(msg);
  useEffect(() => {
    if (!stale) return;
    try {
      if (sessionStorage.getItem('reloaded-for-update')) return;
      sessionStorage.setItem('reloaded-for-update', '1');
    } catch { /* bỏ qua */ }
    location.reload();
  }, [stale]);
  return (
    <div className="page narrow">
      <div className="card center-text">
        <h2>{stale ? 'Đang cập nhật phiên bản mới…' : 'Có lỗi xảy ra'}</h2>
        {!stale && <p className="error">{msg}</p>}
        <button className="btn primary" onClick={() => location.reload()}>Tải lại trang</button>
      </div>
    </div>
  );
}

const router = createHashRouter([
  {
    path: '/',
    element: <Layout />,
    errorElement: <RouteError />,
    children: [
      { index: true, element: <Home /> },
      { path: 'tra-tu', element: <Lookup /> },
      { path: 'von-tu', element: <Vocab /> },
      { path: 'on-tap', element: <Review /> },
      { path: 'kiem-tra', element: <Quiz /> },
      { path: 'luyen-viet', element: <Writing /> },
      { path: 'doc', element: <Reading /> },
      { path: 'thong-ke', element: <Stats /> },
      { path: 'cai-dat', element: <Settings /> },
    ],
  },
]);

export default function App() {
  return <RouterProvider router={router} />;
}
