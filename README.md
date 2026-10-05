# Truyện · Đọc & Nghe

Ứng dụng React + TypeScript + Vite để lấy nội dung truyện, đọc bản gốc, nghe TTS và dịch bằng AI khi cần.

## Chạy trong môi trường phát triển

Cần Node.js >= 20.19 hoặc >= 22.12 (đã kiểm tra với Node 24). Nguồn Edge cần Python 3.12 và thư viện **pip `edge-tts`**, không dùng wrapper Node.

```sh
npm ci
python3 -m venv .venv
.venv/bin/python -m pip install -r requirements.txt
npm run dev -- --host 0.0.0.0 --port 5173 --strictPort
```

```sh
npm run build
npm run lint
npm test
.venv/bin/python -m unittest discover -s tests -p 'test_*.py' -v
```

Vite tự tìm Python trong `.venv/bin/python`; nếu đã cài `edge-tts` ở môi trường khác, đặt `PYTHON_BIN` thành đường dẫn Python đó. Trên Windows, dùng `.venv\Scripts\python.exe` và đặt `PYTHON_BIN` tương ứng. `predev`/`prebuild` sao chép WASM từ các package đã khóa phiên bản; không cần tải bộ đọc khi chỉ dùng Edge hoặc giọng hệ thống.

## Luồng sử dụng

1. Nhập liên kết chương và bấm **Lấy nội dung truyện** / Enter, hoặc chọn **Dán văn bản** rồi **Đọc / nghe bản gốc**.
2. Nội dung gốc được hiển thị và lưu trong **Thư viện** ngay; không cần API key.
3. Mở **Giọng và tốc độ**, chọn **Nguồn TTS → Ngôn ngữ → Nam/nữ → Giọng** rồi bấm **Nghe truyện**. Có thể chọn một đoạn để nghe từ đó.
4. Nếu muốn dịch, mở cấu hình AI, nhập khóa của nhà cung cấp rồi bấm **Dịch (tùy chọn)**. Chuyển giữa **Bản gốc** và **Bản dịch** để chọn nội dung đọc/nghe.
5. **Cài đặt** có nghe tiếp chương sau, hẹn giờ ngủ, giới hạn số chương, dịch khi tải chương mới, công cụ AI và dịch hàng loạt.

Dữ liệu cũ trong `reader_translated_cache` và bookmark vẫn được đọc. Thư viện hiện chứa cả chương gốc và chương đã dịch. Chương tải từ web dùng URL nguồn làm ID; văn bản dán tay dùng ID `manual:<uuid>` riêng. Vị trí đọc/nghe được lưu theo chương và phiên bản. Lấy lại bản gốc không xóa bản dịch nếu nội dung gốc không đổi.

## Giao diện và kiểm tra trình duyệt

Từ 1100px, trang dùng hai cột: thêm nội dung bên trái và đọc/nghe bên phải. Màn hình nhỏ hơn dùng từng trang với thanh điều hướng dưới. Thanh nghe nằm ngoài vùng cuộn truyện; hộp thoại cuộn riêng, bố cục tính vùng an toàn và chiều cao hiển thị khi mở bàn phím. Có ba màu nền, cỡ chữ 14–32px và hỗ trợ giảm chuyển động.

```sh
npx playwright install chromium
npm run test:browser
```

Nếu môi trường có Chromium sẵn, có thể dùng `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium npm run test:browser`. Bộ kiểm tra chạy từ 320px đến 1920px, chiều dọc/ngang, chữ lớn, hộp thoại và mô phỏng thay đổi viewport khi mở bàn phím. Đây là kiểm tra Chromium; vẫn cần thử Safari/iOS và thiết bị thật để xác minh bàn phím, vùng an toàn và âm thanh.

Để chạy các kiểm tra TTS bằng Firefox: `npx playwright install firefox`, sau đó `PLAYWRIGHT_BROWSER=firefox npm run test:browser -- tests/browser/tts.spec.mjs tests/browser/offline-tts.spec.mjs`. Kiểm tra bản build với `PLAYWRIGHT_PREVIEW=1 npm run test:browser` sau `npm run build` (API trong các kiểm tra được mô phỏng).

## Cấu trúc

- `src/App.tsx`: phối hợp trạng thái ứng dụng và các màn hình.
- `src/app`: khung trang, điều hướng và theo dõi viewport.
- `src/components`: thành phần dùng chung, gồm hộp thoại quản lý focus.
- `src/features/reader`: hiển thị bản gốc/bản dịch, tải trước chương, thống kê.
- `src/features/tts`: phiên đọc giọng, chia văn bản thành đoạn nhỏ, chọn giọng/tốc độ.
- `api/tts.py`, `server/edge_tts_service.py`: Python `edge-tts`, danh sách giọng và MP3 trên Vercel.
- `server/tts.ts`, `server/tts-handler.ts`, `server/tts_cli.py`: cầu nối Vite tới cùng service Python khi phát triển.
- `src/services/tts`: catalog Piper/eSpeak, adapter âm thanh và worker tạo WAV trên thiết bị.
- `src/features/library`: thư viện, bookmark, xuất file và lưu danh sách chương.
- `src/features/translation`: tác vụ dịch hàng loạt và lưu/khôi phục tiến độ.
- `src/features/settings`: cấu hình AI và đọc/nghe.
- `src/features/diagnostics`: nhật ký lỗi với thông tin khóa được che.
- `src/services/storySources`: tải qua proxy và phân tích HTML truyện.
- `api/story.ts`: API lấy HTML trên Vercel; gọi trực tiếp website nguồn.
- `server/story.ts`: tải có giới hạn thời gian/dung lượng, kiểm tra URL/DNS và chuyển hướng.
- `src/services/ai`: cấu hình nhà cung cấp và gọi API, dùng chung cho dịch/phân tích.
- `src/services/storage`: truy cập bộ nhớ, định danh chương, tiến độ và xuất nội dung.
- `src/types`: kiểu dữ liệu chung.
- `tests/reader.test.mjs`: kiểm tra hồi quy các luồng chính bằng DOM và SpeechSynthesis mô phỏng.
- `tests/browser/responsive.spec.mjs`: kiểm tra bố cục và thao tác bằng Chromium thật.
- `tests/server.test.mjs`: kiểm tra API, địa chỉ nội bộ, chuyển hướng và giới hạn trang.
- `tests/test_edge_tts.py`, `tests/tts-server.test.mjs`: API Python, validation, timeout, cache và cầu nối Vite.
- `tests/browser/tts.spec.mjs`, `tests/browser/offline-tts.spec.mjs`: player, lỗi AbortError, selector và WAV eSpeak thực tế, gồm nghe tiếp khi ngắt mạng.

## Triển khai Vercel

Chọn framework **Vite**, build command `npm run build`, output directory `dist`, Node.js 22 hoặc 24. Đặt Root Directory ở thư mục chứa `package.json`, `requirements.txt` và `api/`. Vercel triển khai `api/story.ts` thành Node function và **`api/tts.py` thành Python function**, cài `edge-tts==7.2.8` từ `requirements.txt`; `.python-version` chọn Python 3.12. `vercel.json` đặt thời gian tối đa 30 giây. Không cần thêm `pip install` vào npm build hoặc API key. Sau khi cập nhật code phải có deployment mới để API xuất hiện; chỉ tải thư mục `dist` lên hosting tĩnh sẽ không có server này.

Khi chạy `npm run dev`, Vite phục vụ cùng API để kiểm tra local. `npm run preview` chỉ phục vụ frontend tĩnh; kiểm tra API dùng dev server hoặc deployment Vercel.

## Phạm vi hỗ trợ

Nguồn **Giọng trên thiết bị** dùng Web Speech API. **Google · trên thiết bị** lọc giọng Google mà trình duyệt cung cấp; đây không phải Google Cloud và lựa chọn này chỉ bật khi có giọng Google. Giọng thiết bị không cung cấp metadata giới tính nên được ghi là chưa có thông tin. **Microsoft Edge · trực tuyến** dùng Read Aloud qua server Python và `edge-tts`, không cần API key; lọc ngôn ngữ/nam/nữ theo danh sách Microsoft trả về. Edge không phụ thuộc giọng Web Speech của Firefox. Lựa chọn giọng được nhớ trên thiết bị.

**Piper · neural trên thiết bị** dùng `@mintplex-labs/piper-tts-web` và ONNX Runtime trong Web Worker. Có ba model tiếng Việt (VAIS 1000, 25hours, VIVOS) cùng hai model tiếng Anh. Lần bấm nghe đầu tiên tải model từ Hugging Face (khoảng 28–64 MB) và bộ chạy WASM. Model lưu trong OPFS, runtime lưu trong Cache Storage khi trình duyệt cho phép. Không tải model khi chỉ chọn giọng. Chưa có metadata giới tính đáng tin cậy nên không gán nam/nữ cho model Piper. Tốc độ tạo giọng phụ thuộc CPU/RAM; thiết bị yếu có thể cần chờ lâu.

**eSpeak NG · trên thiết bị** dùng package `espeak-ng` trong Web Worker, tải WASM khoảng 19 MB lần đầu rồi tạo WAV tại máy. Hỗ trợ tiếng Việt và một số ngôn ngữ khác, nam/nữ là biến thể giọng tổng hợp. Giọng kém tự nhiên hơn Edge/Piper nhưng không cần server hoặc model neural. Sau khi bộ đọc được tải, có thể tạo thêm âm thanh khi mất mạng trong phiên đang mở. Dừng/hủy vô hiệu hóa worker cũ để kết quả đến muộn không tự phát. Bộ nhớ lưu phụ thuộc dung lượng/chế độ riêng tư; đây chưa phải ứng dụng offline toàn bộ. Xem [giấy phép và nguồn thư viện](THIRD_PARTY_NOTICES.md).

Edge gửi phần truyện đang nghe đến dịch vụ Microsoft. Cần mạng và API `/api/tts`; giới hạn mỗi lượt 1500 ký tự, 20 giây và 2 MB âm thanh. Player chia đoạn dài thành phần tối đa 1200 ký tự và đổi tốc độ ngay khi phát, không cần tạo lại âm thanh. Kết nối Read Aloud có thể thay đổi hoặc bị giới hạn; khi lỗi có thể thử lại danh sách giọng hoặc chuyển sang nguồn trên thiết bị.

Edge/Piper/eSpeak chuẩn bị trước hai phần đọc kế tiếp trong khi phần hiện tại đang phát, kể cả các phần nhỏ trong cùng một đoạn dài. Âm thanh đã tạo giữ trong RAM (tối đa 8 phần / 12 MB) để chuyển tới đoạn gần đó hoặc quay lại không cần tạo lại. Chọn phần đang chuẩn bị dùng chung lượt tạo, không gửi yêu cầu trùng; nhảy tới phần chưa có ưu tiên phần đó. Các lượt tạo chạy lần lượt để Piper/eSpeak dùng lại worker/model và không suy luận chồng nhau. Edge gửi thêm hai phần kế tiếp tới Microsoft để chuẩn bị âm thanh. Tạm dừng hủy lượt đang chuẩn bị nhưng giữ âm thanh đã xong; dừng, đổi chương hoặc đổi giọng xóa bộ đệm. Lần nghe đầu, bước nhảy tới đoạn ngoài bộ đệm, mạng chậm hoặc CPU tạo giọng không theo kịp vẫn có thể phải chờ.

Có phát/tạm dừng, dừng, chuyển đoạn, tô sáng đoạn, nhớ vị trí, hẹn giờ và nghe tiếp chương sau. Phát khi khóa màn hình phụ thuộc hệ điều hành/trình duyệt; kiểm tra trên thiết bị thật trước khi dùng cho nghe nền.

Với giọng thiết bị, tạm dừng hủy lượt phát và vô hiệu hóa callback cũ để tránh giọng đọc vẫn chạy trên trình duyệt không hỗ trợ `pause()` ổn định. Tiếp tục nghe bắt đầu từ vị trí từ gần nhất mà giọng đọc báo về; nếu không có sự kiện vị trí, đọc lại phần ngắn đang phát (tối đa 240 ký tự). Edge tạm dừng tại thời gian của audio, hủy yêu cầu còn đang tải và bỏ qua phản hồi đến muộn. Chọn đoạn hoặc đổi giọng/tốc độ khi tạm dừng vẫn giữ im lặng đến khi bấm tiếp tục.

Lấy truyện ưu tiên `/api/story` trên server Vercel, sau đó thử `api.allorigins.win` và `api.codetabs.com` nếu tải hoặc phân tích thất bại. Server chỉ truy cập HTTP/HTTPS công khai, kiểm tra và ghim IP kết nối, kiểm tra lại từng chuyển hướng, giới hạn 20 giây/2 MB và không gửi cookie đăng nhập. Hỗ trợ các selector nội dung phổ biến, bao gồm `.chapter-content`, `.entry-content` và `.reading-content`. Website thay cấu trúc, yêu cầu đăng nhập, chống bot hoặc dựng nội dung bằng JavaScript vẫn có thể không lấy được; khi đó có thể dán văn bản trực tiếp. API này tải HTML, không chạy trình duyệt hoặc vượt qua xác minh của website nguồn.

API key cho AI được nhập trong giao diện và lưu trên thiết bị. AI là chức năng tùy chọn và có thể tính phí theo nhà cung cấp. Test dùng phản hồi AI, Web Speech và upstream Microsoft mô phỏng; browser test phát WAV và thực sự tạo WAV eSpeak. Test không gọi dịch vụ trả phí hoặc xác minh chất lượng giọng Edge/Piper thực tế. AbortError/TimeoutError từ trình duyệt được hiển thị thành thông báo kết nối/thời gian chờ; chủ động tạm dừng, đổi nguồn hoặc dừng không hiển thị lỗi và không tự phát lại.

Thư viện vẫn dùng localStorage với tối đa 500 chương; dung lượng thực tế tùy trình duyệt. Khi ghi thất bại, ứng dụng báo lỗi để người dùng xuất dữ liệu trước khi đóng trang. Chưa có đồng bộ tài khoản hay service worker cho offline toàn bộ ứng dụng.
