// Phát âm tiếng Trung bằng Web Speech API của trình duyệt
let voices: SpeechSynthesisVoice[] = [];
const listeners = new Set<() => void>();

function loadVoices() {
  voices = speechSynthesis.getVoices().filter((v) => /^zh|cmn/i.test(v.lang));
  listeners.forEach((f) => f());
}
if ('speechSynthesis' in window) {
  loadVoices();
  speechSynthesis.onvoiceschanged = loadVoices;
}

export const ttsSupported = () => 'speechSynthesis' in window;
export const getZhVoices = () => voices;
export const onVoicesChanged = (f: () => void) => {
  listeners.add(f);
  return () => listeners.delete(f);
};

const PREF = [/xiaoxiao/i, /yunxi/i, /xiaoyi/i, /huihui/i, /google.*(普通话|mandarin)/i, /ting-ting/i, /yaoyao/i, /kangkang/i];

export const ttsSettings = {
  voiceURI: localStorageGet('tts.voice', ''),
  rate: Number(localStorageGet('tts.rate', '0.85')),
};

function localStorageGet(k: string, d: string) {
  try {
    return localStorage.getItem(k) ?? d;
  } catch {
    return d;
  }
}
export function saveTts(voiceURI: string, rate: number) {
  ttsSettings.voiceURI = voiceURI;
  ttsSettings.rate = rate;
  try {
    localStorage.setItem('tts.voice', voiceURI);
    localStorage.setItem('tts.rate', String(rate));
  } catch { /* bỏ qua */ }
}

function pickVoice(): SpeechSynthesisVoice | undefined {
  const cn = voices.filter((v) => /zh[-_]CN|cmn/i.test(v.lang));
  if (ttsSettings.voiceURI) {
    const v = voices.find((x) => x.voiceURI === ttsSettings.voiceURI);
    if (v) return v;
  }
  for (const re of PREF) {
    const v = cn.find((x) => re.test(x.name));
    if (v) return v;
  }
  return cn[0] || voices[0];
}

export function speak(text: string, rate?: number) {
  if (!ttsSupported()) return;
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = 'zh-CN';
  const v = pickVoice();
  if (v) u.voice = v;
  u.rate = rate ?? ttsSettings.rate;
  speechSynthesis.speak(u);
}
