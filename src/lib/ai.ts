// Tính năng AI (Claude): tạo câu ví dụ và bài đọc từ vốn từ của bạn.
// API key được lưu trong trình duyệt của bạn (IndexedDB) và gọi thẳng tới Anthropic.
import Anthropic from '@anthropic-ai/sdk';
import { db, getSetting } from './db';

const MODEL = 'claude-opus-5-5';

export async function getApiKey() {
  return getSetting<string>('anthropicKey', '');
}

async function client() {
  const apiKey = await getApiKey();
  if (!apiKey) throw new Error('Chưa có API key. Vào Cài đặt để nhập Anthropic API key.');
  return new Anthropic({ apiKey, dangerouslyAllowBrowser: true });
}

async function askJson<T>(system: string, prompt: string, schema: Record<string, unknown>): Promise<T> {
  const c = await client();
  let res;
  try {
    res = await c.beta.messages.create({
      model: MODEL,
      max_tokens: 16000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { effort: 'low', format: { type: 'json_schema', schema } },
      system,
      messages: [{ role: 'user', content: prompt }],
    });
  } catch (e) {
    if (e instanceof Anthropic.AuthenticationError) throw new Error('API key không hợp lệ.');
    if (e instanceof Anthropic.RateLimitError) throw new Error('Đang bị giới hạn tốc độ, thử lại sau ít phút.');
    if (e instanceof Anthropic.APIConnectionError) throw new Error('Không kết nối được tới Anthropic.');
    if (e instanceof Anthropic.APIError) throw new Error(`Lỗi API (${e.status}): ${e.message}`);
    throw e;
  }
  if (res.stop_reason === 'refusal') throw new Error('Yêu cầu bị từ chối.');
  if (res.stop_reason === 'max_tokens') throw new Error('Kết quả quá dài, bị cắt. Hãy thử lại với độ dài ngắn hơn.');
  const text = res.content.map((b) => (b.type === 'text' ? b.text : '')).join('');
  return JSON.parse(text) as T;
}

const SYSTEM =
  'Bạn là giáo viên tiếng Trung cho người Việt. Dùng tiếng Trung giản thể, pinyin có dấu thanh, ' +
  'dịch sang tiếng Việt tự nhiên. Câu phải đúng ngữ pháp, tự nhiên như người bản xứ nói.';

const sentenceSchema = {
  type: 'object',
  properties: {
    zh: { type: 'string', description: 'câu tiếng Trung giản thể' },
    pinyin: { type: 'string', description: 'pinyin có dấu thanh, tách theo từ' },
    vi: { type: 'string', description: 'bản dịch tiếng Việt' },
  },
  required: ['zh', 'pinyin', 'vi'],
  additionalProperties: false,
};

export interface AiSentence { zh: string; pinyin: string; vi: string }

export async function aiExamples(word: string, pinyin: string, meaning: string, knownWords: string[]): Promise<AiSentence[]> {
  const cacheKey = `ex:${word}|${pinyin}`;
  const cached = await db.aiCache.get(cacheKey);
  if (cached) return cached.value as AiSentence[];
  const known = knownWords.slice(0, 300).join('、');
  const out = await askJson<{ examples: AiSentence[] }>(
    SYSTEM,
    `Tạo 4 câu ví dụ cho từ 「${word}」 (${pinyin}: ${meaning}), từ dễ đến khó, mỗi câu dùng đúng nghĩa trên.\n` +
      (known ? `Ưu tiên dùng các từ người học đã biết: ${known}\n` : '') +
      'Câu ngắn (dưới 20 chữ), thực tế, dùng trong đời sống.',
    {
      type: 'object',
      properties: { examples: { type: 'array', items: sentenceSchema } },
      required: ['examples'],
      additionalProperties: false,
    },
  );
  await db.aiCache.put({ key: cacheKey, value: out.examples, at: Date.now() });
  return out.examples;
}

export interface AiStory {
  title: string;
  sentences: AiSentence[];
  vocab: { hanzi: string; pinyin: string; vi: string }[];
}

export async function aiStory(words: string[], allKnown: string[], level: string, length: string, topic: string): Promise<AiStory> {
  return askJson<AiStory>(
    SYSTEM,
    `Viết một đoạn văn/câu chuyện ngắn bằng tiếng Trung để luyện đọc.\n` +
      `- Bắt buộc dùng càng nhiều càng tốt các từ sau: ${words.join('、')}\n` +
      `- Các từ khác nên lấy từ vốn từ người học đã biết: ${allKnown.slice(0, 400).join('、')}\n` +
      `- Trình độ: ${level}. Độ dài: ${length}.\n` +
      (topic ? `- Chủ đề: ${topic}\n` : '') +
      `- Chia thành từng câu. Trong "vocab", liệt kê các từ có trong bài mà KHÔNG nằm trong vốn từ đã biết (tối đa 10).`,
    {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'tiêu đề tiếng Trung' },
        sentences: { type: 'array', items: sentenceSchema },
        vocab: {
          type: 'array',
          items: {
            type: 'object',
            properties: { hanzi: { type: 'string' }, pinyin: { type: 'string' }, vi: { type: 'string' } },
            required: ['hanzi', 'pinyin', 'vi'],
            additionalProperties: false,
          },
        },
      },
      required: ['title', 'sentences', 'vocab'],
      additionalProperties: false,
    },
  );
}

export async function aiTranslate(zh: string): Promise<string> {
  const key = `tr:${zh}`;
  const c = await db.aiCache.get(key);
  if (c) return c.value as string;
  const out = await askJson<{ vi: string }>(SYSTEM, `Dịch câu sau sang tiếng Việt tự nhiên: ${zh}`, {
    type: 'object', properties: { vi: { type: 'string' } }, required: ['vi'], additionalProperties: false,
  });
  await db.aiCache.put({ key, value: out.vi, at: Date.now() });
  return out.vi;
}
