import { useEffect, useRef, useState } from 'react';
import { db, getSetting, setSetting } from '../lib/db';
import { exportAnki, exportCsv, exportJson, importCsv, importJson } from '../lib/backup';
import { getZhVoices, onVoicesChanged, saveTts, speak, ttsSettings, ttsSupported } from '../lib/tts';
import { toast } from '../components/common';
import { connectGist, disconnectGist, getSyncState, onSyncState, syncNow, type SyncState } from '../lib/sync';

export default function Settings() {
  const [key, setKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [voices, setVoices] = useState(getZhVoices());
  const [voice, setVoice] = useState(ttsSettings.voiceURI);
  const [rate, setRate] = useState(ttsSettings.rate);
  const [newPerDay, setNewPerDay] = useState(20);
  const [csvTag, setCsvTag] = useState('');
  const jsonFile = useRef<HTMLInputElement>(null);
  const csvFile = useRef<HTMLInputElement>(null);
  const [replace, setReplace] = useState(false);
  const [usage, setUsage] = useState('');
  const [ghToken, setGhToken] = useState('');
  const [ghConnected, setGhConnected] = useState(false);
  const [ghBusy, setGhBusy] = useState(false);
  const [sync, setSync] = useState<SyncState>(getSyncState());

  useEffect(() => {
    getSetting('anthropicKey', '').then(setKey);
    getSetting('newPerDay', 20).then(setNewPerDay);
    getSetting('gistToken', '').then((t) => setGhConnected(!!t));
    const offSync = onSyncState(setSync);
    const off = onVoicesChanged(() => setVoices(getZhVoices()));
    navigator.storage?.estimate?.().then((e) => e.usage && setUsage(`${(e.usage / 1e6).toFixed(1)} MB`));
    return () => { off(); offSync(); };
  }, []);

  return (
    <div className="page narrow">
      <h1>Cài đặt</h1>

      <section className="card">
        <h3>Phát âm</h3>
        {!ttsSupported() ? <p className="error">Trình duyệt không hỗ trợ đọc văn bản.</p> : (
          <>
            {voices.length === 0 && <p className="notice">Không tìm thấy giọng tiếng Trung. Trên Windows: Settings → Time & Language → Speech → Add voices → Chinese (Simplified). Hoặc dùng Edge/Chrome để có giọng online.</p>}
            <label className="field"><span>Giọng đọc</span>
              <select className="input" value={voice} onChange={(e) => { setVoice(e.target.value); saveTts(e.target.value, rate); }}>
                <option value="">Tự chọn giọng tốt nhất</option>
                {voices.map((v) => <option key={v.voiceURI} value={v.voiceURI}>{v.name} ({v.lang})</option>)}
              </select>
            </label>
            <label className="field"><span>Tốc độ: {rate.toFixed(2)}×</span>
              <input type="range" min={0.5} max={1.3} step={0.05} value={rate} onChange={(e) => { setRate(+e.target.value); saveTts(voice, +e.target.value); }} />
            </label>
            <button className="btn ghost" onClick={() => speak('你好，很高兴认识你。')}>🔊 Nghe thử</button>
          </>
        )}
      </section>

      <section className="card">
        <h3>Ôn tập</h3>
        <label className="field"><span>Số từ mới tối đa mỗi ngày</span>
          <input className="input" type="number" min={0} max={200} value={newPerDay}
            onChange={(e) => { const v = Math.max(0, +e.target.value || 0); setNewPerDay(v); setSetting('newPerDay', v); }} />
        </label>
      </section>

      <section className="card">
        <h3>AI (Claude)</h3>
        <p className="muted">Dùng cho: tạo câu ví dụ, dịch câu ví dụ sang tiếng Việt, tạo bài đọc từ vốn từ. Lấy API key tại <a href="https://console.anthropic.com/settings/keys" target="_blank" rel="noreferrer">console.anthropic.com</a>.
          Key chỉ lưu trong trình duyệt này và được gửi thẳng tới Anthropic, không qua máy chủ nào khác.</p>
        <div className="row gap">
          <input className="input grow" type={showKey ? 'text' : 'password'} value={key} onChange={(e) => setKey(e.target.value)} placeholder="sk-ant-…" autoComplete="off" />
          <button className="btn ghost" onClick={() => setShowKey(!showKey)}>{showKey ? 'Ẩn' : 'Hiện'}</button>
          <button className="btn primary" onClick={async () => { await setSetting('anthropicKey', key.trim()); toast('Đã lưu API key'); }}>Lưu</button>
        </div>
      </section>

      <section className="card">
        <h3>Đồng bộ giữa các máy (GitHub Gist)</h3>
        {ghConnected ? (
          <>
            <p className="muted">Vốn từ, lịch ôn tập và bài đọc được tự động lưu lên một gist bí mật trong tài khoản GitHub của bạn.
              Mở web ở máy/trình duyệt khác và nhập cùng token là có lại toàn bộ dữ liệu.</p>
            <p>
              {sync.kind === 'syncing' && <><span className="spinner sm" /> Đang đồng bộ…</>}
              {sync.kind === 'ok' && <>☁ Đã đồng bộ lúc {new Date(sync.at).toLocaleTimeString('vi-VN')}</>}
              {sync.kind === 'error' && <span className="error">Lỗi đồng bộ: {sync.msg}</span>}
              {sync.kind === 'off' && <span className="muted">Chưa đồng bộ lần nào trong phiên này.</span>}
            </p>
            <div className="row gap wrap">
              <button className="btn primary" disabled={sync.kind === 'syncing'} onClick={() => syncNow()}>⟳ Đồng bộ ngay</button>
              <button className="btn ghost" onClick={async () => {
                if (!confirm('Ngắt đồng bộ trên trình duyệt này? Dữ liệu ở đây và trên gist vẫn giữ nguyên.')) return;
                await disconnectGist();
                setGhConnected(false);
                setGhToken('');
              }}>Ngắt kết nối</button>
            </div>
          </>
        ) : (
          <>
            <p className="muted">Để dùng vốn từ trên mọi máy: tạo một token GitHub chỉ có quyền <b>gist</b> tại{' '}
              <a href="https://github.com/settings/tokens/new?scopes=gist&description=Hoc%20tieng%20Trung%20sync" target="_blank" rel="noreferrer">github.com/settings/tokens</a>
              {' '}(chọn Expiration = No expiration), rồi dán vào đây. Trên máy khác, dán cùng token này.
              Token chỉ lưu trong trình duyệt và chỉ gửi tới GitHub.</p>
            <div className="row gap">
              <input className="input grow" type="password" value={ghToken} onChange={(e) => setGhToken(e.target.value)} placeholder="ghp_…" autoComplete="off" />
              <button className="btn primary" disabled={!ghToken.trim() || ghBusy} onClick={async () => {
                setGhBusy(true);
                try {
                  await connectGist(ghToken);
                  setGhConnected(true);
                  toast('Đã kết nối & đồng bộ');
                } catch (err) {
                  await disconnectGist();
                  toast('Lỗi: ' + (err as Error).message);
                } finally {
                  setGhBusy(false);
                }
              }}>{ghBusy ? 'Đang kết nối…' : 'Kết nối'}</button>
            </div>
          </>
        )}
      </section>

      <section className="card">
        <h3>Sao lưu & chuyển dữ liệu</h3>
        <p className="muted">Dữ liệu được lưu trong trình duyệt này{usage && ` (đang dùng ${usage})`}. Nếu chưa bật đồng bộ ở trên, nên <b>sao lưu định kỳ</b>, vì xoá dữ liệu trình duyệt sẽ mất vốn từ.</p>
        <div className="row gap wrap">
          <button className="btn primary" onClick={exportJson}>⬇ Sao lưu đầy đủ (.json)</button>
          <button className="btn ghost" onClick={exportCsv}>⬇ Xuất CSV (Excel)</button>
          <button className="btn ghost" onClick={exportAnki}>⬇ Xuất cho Anki</button>
        </div>
        <hr />
        <div className="field">
          <span>Khôi phục từ bản sao lưu (.json)</span>
          <div className="row gap center-v wrap">
            <label className="check"><input type="checkbox" checked={replace} onChange={(e) => setReplace(e.target.checked)} /> Thay thế toàn bộ dữ liệu hiện có</label>
            <button className="btn ghost" onClick={() => jsonFile.current?.click()}>Chọn file…</button>
            <input ref={jsonFile} type="file" accept=".json" hidden onChange={async (e) => {
              const f = e.target.files?.[0];
              e.target.value = '';
              if (!f) return;
              if (replace && !confirm('Thay thế toàn bộ vốn từ & lịch sử hiện có bằng bản sao lưu?')) return;
              try { toast(await importJson(f, replace)); } catch (err) { toast('Lỗi: ' + (err as Error).message); }
            }} />
          </div>
        </div>
        <div className="field">
          <span>Nhập từ CSV/TSV (cột đầu là chữ Hán; có thể có cột tiêu đề <code>hanzi, nghia, tags</code>)</span>
          <div className="row gap center-v wrap">
            <input className="input" value={csvTag} onChange={(e) => setCsvTag(e.target.value)} placeholder="Gắn tag (tuỳ chọn)" />
            <button className="btn ghost" onClick={() => csvFile.current?.click()}>Chọn file…</button>
            <input ref={csvFile} type="file" accept=".csv,.tsv,.txt" hidden onChange={async (e) => {
              const f = e.target.files?.[0];
              e.target.value = '';
              if (f) toast(await importCsv(f, csvTag.trim()));
            }} />
          </div>
        </div>
      </section>

      <section className="card danger-zone">
        <h3>Xoá dữ liệu</h3>
        <button className="btn danger" onClick={async () => {
          if (!confirm('Xoá TOÀN BỘ vốn từ, lịch sử ôn tập và bài đọc? Không thể hoàn tác.')) return;
          if (!confirm('Chắc chắn chứ? Hãy sao lưu trước nếu cần.')) return;
          await db.transaction('rw', db.words, db.reviews, db.stories, db.aiCache, async () => {
            await Promise.all([db.words.clear(), db.reviews.clear(), db.stories.clear(), db.aiCache.clear()]);
          });
          toast('Đã xoá toàn bộ dữ liệu');
        }}>Xoá toàn bộ dữ liệu học</button>
      </section>

      <section className="card credits">
        <h3>Nguồn dữ liệu</h3>
        <ul className="sm">
          <li>Từ điển Trung–Việt <a href="https://github.com/ph0ngp/CVDICT" target="_blank" rel="noreferrer">CVDICT</a> (CC BY-SA 4.0), dựa trên CC-CEDICT.</li>
          <li>Âm Hán Việt: <a href="https://github.com/ph0ngp/hanviet-pinyin-wordlist" target="_blank" rel="noreferrer">hanviet-pinyin-wordlist</a> và Unicode Unihan.</li>
          <li>Cấp độ HSK & tần suất: <a href="https://github.com/drkameleon/complete-hsk-vocabulary" target="_blank" rel="noreferrer">complete-hsk-vocabulary</a>.</li>
          <li>Câu ví dụ: <a href="https://tatoeba.org" target="_blank" rel="noreferrer">Tatoeba</a> (CC BY 2.0 FR).</li>
          <li>Cấu tạo chữ & thứ tự nét: <a href="https://github.com/skishore/makemeahanzi" target="_blank" rel="noreferrer">Make Me a Hanzi</a>, <a href="https://hanziwriter.org" target="_blank" rel="noreferrer">Hanzi Writer</a>.</li>
          <li>Nhận diện chữ viết tay: <a href="https://github.com/gugray/HanziLookupJS" target="_blank" rel="noreferrer">HanziLookupJS</a>.</li>
          <li>Lịch ôn tập: thuật toán FSRS (ts-fsrs).</li>
        </ul>
      </section>
    </div>
  );
}
