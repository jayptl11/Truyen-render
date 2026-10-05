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

1. **Thư viện → Nguồn truyện** để tìm Webnovel hoặc thêm liên kết trang truyện, xem bìa/thông tin và mục lục. Mục lục nhiều trang có tải trang tiếp, tải hết và cập nhật. Có thể tải khoảng chương; tải lại tiếp tục dùng phần đã lưu.
2. Nhập liên kết chương và bấm **Lấy nội dung truyện** / Enter, hoặc chọn **Dán văn bản** rồi **Đọc / nghe bản gốc**.
3. Nội dung gốc được hiển thị và lưu trong **Thư viện** ngay; không cần API key.
4. Mở **Giọng và tốc độ**, chọn **Nguồn TTS → Ngôn ngữ → Nam/nữ → Giọng** rồi bấm **Nghe truyện**. Có thể chọn một đoạn để nghe từ đó.
5. Nếu muốn dịch, mở cấu hình AI, nhập khóa của nhà cung cấp rồi bấm **Dịch (tùy chọn)**. Chuyển giữa **Bản gốc** và **Bản dịch** để chọn nội dung đọc/nghe.
6. **Cài đặt** có nghe tiếp chương sau, hẹn giờ ngủ, giới hạn số chương, dịch khi tải chương mới, công cụ AI và dịch hàng loạt.

Thư viện chuyển sang IndexedDB, không còn cắt lịch sử ở 500 chương. Lần đầu di chuyển dữ liệu `reader_translated_cache` và tiến độ trong một transaction; đánh dấu sau khi commit. Giữ localStorage cũ làm bản dự phòng và giữ nguyên bookmark. Khi trình duyệt không có IndexedDB, tiếp tục dùng localStorage. Thư viện chứa cả chương gốc và bản dịch. Chương tải từ web dùng URL nguồn làm ID; văn bản dán tay dùng ID `manual:<uuid>` riêng. Vị trí đọc/nghe được lưu theo chương và phiên bản. Lấy lại bản gốc không xóa bản dịch nếu nội dung gốc không đổi.

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
- `src/engine/playback`: PlaybackSession độc lập React, hủy callback cũ, chia phần, chuẩn bị phần tiếp, lưu vị trí.
- `src/features/tts`: giao diện chọn nguồn/ngôn ngữ/nam nữ/giọng, player nhỏ và mở rộng, Media Session và Wake Lock tùy chọn.
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

**eSpeak NG · trên thiết bị** dùng package `espeak-ng` trong Web Worker, tải WASM khoảng 19 MB lần đầu rồi tạo WAV tại máy. Hỗ trợ tiếng Việt và một số ngôn ngữ khác, nam/nữ là biến thể giọng tổng hợp. Giọng kém tự nhiên hơn Edge/Piper nhưng không cần server hoặc model neural. Sau khi bộ đọc được tải, có thể tạo thêm âm thanh khi mất mạng trong phiên đang mở. Dừng/hủy vô hiệu hóa worker cũ để kết quả đến muộn không tự phát. Bộ nhớ lưu phụ thuộc dung lượng/chế độ riêng tư; app shell và chương đã lưu mở offline qua service worker ở bản production. Xem [giấy phép và nguồn thư viện](THIRD_PARTY_NOTICES.md).

Edge gửi phần truyện đang nghe đến dịch vụ Microsoft. Cần mạng và API `/api/tts`; giới hạn mỗi lượt 1500 ký tự, 20 giây và 2 MB âm thanh. Player chia đoạn dài thành phần tối đa 1200 ký tự và đổi tốc độ ngay khi phát, không cần tạo lại âm thanh. Kết nối Read Aloud có thể thay đổi hoặc bị giới hạn; khi lỗi có thể thử lại danh sách giọng hoặc chuyển sang nguồn trên thiết bị.

PlaybackSession chuẩn bị theo mục tiêu khoảng 45 giây ở tốc độ hiện tại, tối đa 20 phần phía trước; bộ đệm RAM tối đa 24 phần / 24 MB. Ban đầu ước lượng từ độ dài, sau đó dùng thời lượng audio đã biết. Mục tiêu không đảm bảo khi mạng/CPU không theo kịp hoặc đã chạm giới hạn phần/dung lượng. Phần kế tiếp có một audio element nạp sẵn để giảm thời gian đổi nguồn; vẫn dùng HTMLAudio để hỗ trợ Media Session và tua. Đây chưa phải Web Audio gapless scheduler. Khi bật nghe tiếp, âm thanh đầu chương sau vào cùng hàng đợi khi gần hết chương. Chuyển chương tự động giữ cache/worker và audio đã chuẩn bị, lỗi tải trước không tắt phiên đang nghe. Chọn phần đang chuẩn bị dùng chung lượt tạo. Các lượt tạo cục bộ chạy tuần tự cả khi tải offline.

Âm thanh Edge/Piper/eSpeak lưu ở IndexedDB với khóa SHA-256 gồm phiên bản cache, nguồn, voice ID, ngôn ngữ và văn bản; tốc độ không ảnh hưởng khóa. LRU tự dọn các phần chưa ghim ở 80 MB. **Thư viện → Truyện → Tải để đọc / nghe offline** có tải âm thanh theo giọng đã chọn, ghim để giữ lại và báo lỗi khi đầy. Tải âm thanh tạm dừng phiên nghe; đóng thư viện hoặc tạm ngừng tải hủy lượt chưa xong. Các phần xong vẫn giữ để tiếp tục. Đọc/nghe offline cần đúng bản gốc, nguồn và giọng đã tải; model/runtime Piper/eSpeak cần được tải trước. Có mục xem dung lượng và xóa âm thanh, không xóa nội dung/bản dịch.

Vị trí nghe âm thanh lưu theo chương/bản gốc hoặc dịch, paragraph, phần nhỏ, số giây, giọng và fingerprint nội dung. Mở lại dùng vị trí nếu văn bản/giọng còn khớp; nội dung thay đổi thì reset phần/thời gian. Tạm dừng giữ audio/time và phần đã đệm; hủy request nếu đang chờ phần hiện tại. Khi đã phát, tiếp tục chuẩn bị nền. Dừng hoặc đổi giọng xóa RAM và worker nhưng giữ cache offline.

Edge tự thử lại tối đa hai lần khi lượt tạo âm thanh bị timeout, ngắt kết nối hoặc trả HTTP 408/429/500/502/503/504; mỗi lần có thời hạn riêng, chờ 1 rồi 2 giây trước khi thử lại. Giao diện báo đang kết nối lại khi phần đó cần để phát. Dừng/đổi giọng và tạm dừng khi đang chờ phần hiện tại hủy thời gian chờ và lượt thử lại. Lỗi validation hoặc phát âm thanh bị trình duyệt chặn không tự thử lại. Nếu vẫn thất bại, phiên nghe chuyển sang tạm dừng và giữ đúng phần nhỏ đang chờ cùng âm thanh đã đệm; **Tiếp tục nghe** thử lại phần đó. Lỗi/promise đến muộn từ phần đã phát xong không được dừng phần hiện tại.

Có phát/tạm dừng, dừng, chuyển đoạn, tô sáng đoạn, nhớ vị trí, hẹn giờ và nghe tiếp chương sau. Phát khi khóa màn hình phụ thuộc hệ điều hành/trình duyệt; kiểm tra trên thiết bị thật trước khi dùng cho nghe nền.

Với giọng thiết bị, tạm dừng hủy lượt phát và vô hiệu hóa callback cũ để tránh giọng đọc vẫn chạy trên trình duyệt không hỗ trợ `pause()` ổn định. Tiếp tục nghe bắt đầu từ vị trí từ gần nhất mà giọng đọc báo về; nếu không có sự kiện vị trí, đọc lại phần ngắn đang phát (tối đa 240 ký tự). Edge tạm dừng tại thời gian của audio và bỏ qua callback đến muộn. Chọn đoạn hoặc đổi giọng/tốc độ khi tạm dừng vẫn giữ im lặng đến khi bấm tiếp tục.

Lấy chương và mục lục ưu tiên `/api/story` trên server Vercel, sau đó thử `api.allorigins.win` và `api.codetabs.com` nếu kết nối hoặc phân tích thất bại. Địa chỉ không hợp lệ, yêu cầu đăng nhập hoặc xác minh dừng ngay, không gửi tiếp qua proxy khác. Server kiểm tra toàn bộ DNS và ghim IP kết nối; ưu tiên IPv4, thử tối đa bốn IP công khai đã kiểm tra khi lỗi kết nối. Giới hạn tổng vẫn là 20 giây/2 MB và từng chuyển hướng được kiểm tra lại. Không gửi cookie đăng nhập. Giải mã theo charset HTTP hoặc meta của trang.

Bộ lấy đa website có profile cho các cấu trúc Webnovel, MTruyen, Truyện Full, Truyện YY và Tàng Thư Viện, cùng bộ nhận diện chung cho website khác; không giới hạn hostname theo danh sách profile. Thử nhiều vùng nội dung, chấm điểm văn bản và mật độ liên kết thay vì chọn vùng đầu tiên. Loại menu, quảng cáo, bình luận và văn bản ẩn, giữ đoạn và link chương trước/sau. Khi HTML không có nội dung, thử dữ liệu chương công khai trong JSON-LD/Next.js; không thực thi script nguồn. Mục lục nhận diện danh sách/link chương và nhóm các URL `…/chuong-N` hoặc `…/chapter-N` vào cùng truyện; tìm theo tên hiện vẫn dùng Webnovel.

Profile thể hiện cấu trúc HTML được hỗ trợ, không đảm bảo mọi chương của website truy cập được. Trang tải nội dung qua API riêng, yêu cầu đăng nhập/mua quyền đọc, chống bot hoặc đổi cấu trúc vẫn cần tích hợp riêng; app báo nguyên nhân và cho dán văn bản. API hiện tải HTML, không chạy trình duyệt trên server. Kiểm tra đa nguồn mới dùng mẫu HTML/JSON tổng hợp và fixture Webnovel có sẵn. URL MTruyen người dùng cung cấp chưa được xác minh trực tiếp: cloud từ chối CONNECT tới `mtruyen.net` trước khi kết nối website. Đây là hạn chế của môi trường kiểm tra, chưa phải bằng chứng website nguồn chặn Vercel.

API key cho AI được nhập trong giao diện và lưu trên thiết bị. AI là chức năng tùy chọn và có thể tính phí theo nhà cung cấp. Test dùng phản hồi AI, Web Speech và upstream Microsoft mô phỏng; browser test phát WAV và thực sự tạo WAV eSpeak. Test không gọi dịch vụ trả phí hoặc xác minh chất lượng giọng Edge/Piper thực tế. AbortError/TimeoutError từ trình duyệt được hiển thị thành thông báo kết nối/thời gian chờ; chủ động tạm dừng, đổi nguồn hoặc dừng không hiển thị lỗi và không tự phát lại.

Bản production có service worker cache app shell theo hash của build, không cache API. Bản mới hiện thông báo để người dùng chủ động cập nhật. Cài PWA khi trình duyệt hỗ trợ; Media Session đưa tên truyện/chương và điều khiển play/pause/chuyển chương ra hệ thống. Trình nghe mở rộng có tua theo giây và tùy chọn giữ màn hình sáng. Chạy nền/khóa màn hình phụ thuộc trình duyệt và OS, đặc biệt iOS; chưa có đồng bộ tài khoản. Bộ nhớ offline có thể bị trình duyệt dọn khi thiếu dung lượng.

### Kiểm tra Edge thật

`test:tts:live` dùng TTS thật; chỉ nội dung ba hoặc nhiều chương kiểm thử được cung cấp qua fixture. Không mô phỏng API Edge. Chọn URL Vercel thật hoặc dev server có Python `edge-tts`:

```sh
npm run test:tts:live -- --url https://YOUR_DEPLOYMENT.vercel.app --browser chromium --rate 1 --minutes 30 --output /tmp/edge-result.json
npm run test:tts:live -- --url https://YOUR_DEPLOYMENT.vercel.app --browser firefox --rate 1.5 --minutes 30
```

Lặp với tốc độ 1, 1.5, 2 trên hai trình duyệt. `--accelerate` tua tới cuối mỗi phần để kiểm tra ít nhất 120 phần và 3 chương trong thời gian ngắn; kết quả tăng tốc không chứng minh nghe liên tục 30 phút. Báo cáo phân biệt requests/lỗi upstream, số phần/chương đã phát và khoảng chuyển phần khi có audio chuẩn bị sẵn. Đầu ra ảo cần được cấu hình nếu máy cloud không có thiết bị âm thanh, nhất là Firefox.

Kiểm tra production offline: `PLAYWRIGHT_PREVIEW=1 npm run test:browser -- tests/browser/pwa.spec.mjs tests/browser/library.spec.mjs` sau build. Có thể đặt `PLAYWRIGHT_PORT` để tách dev và preview. Bài PWA bỏ qua khi chạy dev, vì service worker chỉ bật production. Các test regression dùng Microsoft fixture; kết quả live phải báo riêng. Xem [kế hoạch và tiêu chí thiết kế](docs/VBOOK_REBUILD_PLAN.md).

Đã kiểm tra trong môi trường cloud: build/lint, 57 bài Node, 8 bài Python, 28 bài Chromium dev (bỏ qua 1 bài PWA), 14 bài Chromium production và 8 bài Firefox TTS đều qua. Edge thật chạy tăng tốc 120 phần / 3 chương trên mỗi trình duyệt; p95 khoảng chuyển phần khi audio kế tiếp đã chuẩn bị là 87 ms trên Chromium (1×), 119 ms trên Firefox (1.5×). Đây là thời gian sự kiện trình duyệt, chưa phải phép đo âm thanh hay kiểm tra nghe liên tục 30 phút. Chưa kiểm tra deployment Vercel của người dùng, Safari/iOS thật hoặc tạo giọng Piper neural thực tế. Chi tiết và các lượt thử khác nằm trong [báo cáo kiểm tra](docs/verification-2026-10-05.json).
