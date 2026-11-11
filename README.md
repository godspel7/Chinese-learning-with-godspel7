# Học tiếng Trung — web học cá nhân

Web tĩnh (React + Vite). Dữ liệu cá nhân lưu trong trình duyệt (IndexedDB), từ điển nằm sẵn trong `public/data/`.

## Tính năng
- **Tra từ**: theo chữ Hán, pinyin (`xuexi` / `xue2xi2` / `xuéxí`), âm Hán Việt (`học tập`, `hoc tap`), nghĩa tiếng Việt. Gợi ý khi gõ, **nhận diện chữ viết tay**.
- Chi tiết từ: pinyin tô màu thanh điệu, phát âm, Hán Việt, HSK, lượng từ, cách đọc khác, thứ tự nét (hoạt hình), bộ thủ, cấu tạo chữ, câu ví dụ có pinyin, từ liên quan.
- **Vốn từ của tôi**: thêm từ (từng từ / dán cả danh sách / tự nhập), sửa nghĩa, tag, ghi chú.
- **Ôn tập** ngắt quãng (FSRS), **Kiểm tra nhanh** 6 dạng (chữ→nghĩa, nghĩa→chữ, gõ pinyin, nghe, Hán Việt, viết tay).
- **Luyện viết** theo từng nét, **Bài đọc AI** & câu ví dụ AI (Claude, cần API key), **Thống kê**.
- **Đồng bộ nhiều máy qua GitHub Gist**, sao lưu JSON, xuất CSV / Anki, nhập CSV. Chế độ sáng/tối. Cài được như app (PWA).

## Chạy trên máy
```bash
npm install
npm run dev        # http://localhost:5173
```

## Deploy lên Render (Static Site, miễn phí)
1. Đẩy thư mục này lên một repo GitHub (thư mục `data-raw/` đã được bỏ qua trong `.gitignore`; `public/data/` **phải được commit**).
2. Trên Render: **New → Blueprint** → chọn repo (Render đọc `render.yaml`).
   Hoặc **New → Static Site**: Build command `npm ci && npm run build`, Publish directory `dist`.
3. App dùng hash router (`/#/tra-tu`) nên không cần cấu hình rewrite.

> Dữ liệu học (vốn từ, lịch ôn) nằm trong trình duyệt đang dùng. Để dùng trên nhiều máy/trình duyệt, vào **Cài đặt → Đồng bộ giữa các máy**, dán một GitHub token có quyền `gist`: dữ liệu được tự động lưu vào một gist bí mật và đồng bộ khi mở web, khi thay đổi và khi quay lại tab. Dùng cùng token ở máy khác để có lại toàn bộ vốn từ.

## Dựng lại database từ điển
Dữ liệu thô không nằm trong repo. Để tải lại và dựng:
```bash
mkdir -p data-raw && cd data-raw
curl -LO https://raw.githubusercontent.com/ph0ngp/CVDICT/master/CVDICT.u8
curl -LO https://raw.githubusercontent.com/ph0ngp/hanviet-pinyin-wordlist/main/hanviet.csv
curl -L -o hsk.min.json https://raw.githubusercontent.com/drkameleon/complete-hsk-vocabulary/main/complete.min.json
curl -L -o makemeahanzi.txt https://raw.githubusercontent.com/skishore/makemeahanzi/master/dictionary.txt
curl -LO https://raw.githubusercontent.com/gugray/HanziLookupJS/master/dist/mmah.json
curl -LO https://raw.githubusercontent.com/gugray/HanziLookupJS/master/dist/orig.json
curl -LO https://raw.githubusercontent.com/gugray/HanziLookupJS/master/dist/hanzilookup.min.js
curl -LO https://www.unicode.org/Public/UCD/latest/ucd/Unihan.zip && unzip -o Unihan.zip -d unihan
for f in cmn/cmn-vie_links cmn/cmn-eng_links cmn/cmn_sentences vie/vie_sentences eng/eng_sentences; do
  curl -LO https://downloads.tatoeba.org/exports/per_language/$f.tsv.bz2; done
bunzip2 -kf *.bz2
cd .. && npm run build:data
```
`build:data` cập nhật `src/lib/dataVersion.ts` nên trình duyệt sẽ tự tải bản từ điển mới.

## Nguồn dữ liệu & giấy phép
CVDICT (CC BY-SA 4.0), hanviet-pinyin-wordlist (MIT), Unicode Unihan, complete-hsk-vocabulary (MIT), Tatoeba (CC BY 2.0 FR), Make Me a Hanzi / Hanzi Writer, HanziLookupJS (GPL / Arphic PL).
