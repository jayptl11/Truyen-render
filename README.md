# Truyện · Đọc & Nghe

Ứng dụng React + TypeScript + Vite để lấy nội dung truyện, đọc bản gốc, nghe TTS và dịch bằng AI khi cần.

## Chạy trong môi trường phát triển

Cần Node.js >= 20.19 hoặc >= 22.12 (đã kiểm tra với Node 24).

```sh
npm ci
npm run dev -- --host 0.0.0.0 --port 5173 --strictPort
```

```sh
npm run build
npm run lint
npm test
```

## Luồng sử dụng

1. Nhập liên kết chương và bấm **Lấy nội dung truyện** / Enter, hoặc chọn **Dán văn bản** rồi **Đọc / nghe bản gốc**.
2. Nội dung gốc được hiển thị và lưu trong **Thư viện** ngay; không cần API key.
3. Bấm **Nghe truyện**, chọn giọng/tốc độ, hoặc chọn một đoạn để nghe từ đó.
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

## Cấu trúc

- `src/App.tsx`: phối hợp trạng thái ứng dụng và các màn hình.
- `src/app`: khung trang, điều hướng và theo dõi viewport.
- `src/components`: thành phần dùng chung, gồm hộp thoại quản lý focus.
- `src/features/reader`: hiển thị bản gốc/bản dịch, tải trước chương, thống kê.
- `src/features/tts`: phiên đọc giọng, chia văn bản thành đoạn nhỏ, chọn giọng/tốc độ.
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

## Triển khai Vercel

Chọn framework **Vite**, build command `npm run build`, output directory `dist`, Node.js 22 hoặc 24. Đặt Root Directory ở thư mục chứa `package.json` và `api/`. Vercel tự triển khai `api/story.ts` thành Node function; `vercel.json` đặt thời gian tối đa 30 giây. Không cần API key cho việc lấy truyện. Sau khi cập nhật code phải có deployment mới để API xuất hiện; chỉ tải thư mục `dist` lên hosting tĩnh sẽ không có server này.

Khi chạy `npm run dev`, Vite phục vụ cùng API để kiểm tra local. `npm run preview` chỉ phục vụ frontend tĩnh; kiểm tra API dùng dev server hoặc deployment Vercel.

## Phạm vi hỗ trợ

TTS dùng Web Speech API và giọng cài trên thiết bị, không cần dịch vụ TTS hay API key. Có phát/tạm dừng, dừng, chuyển đoạn, tô sáng đoạn, nhớ vị trí, hẹn giờ và nghe tiếp chương sau. Khả năng có giọng tiếng Việt và phát khi khóa màn hình phụ thuộc hệ điều hành/trình duyệt; kiểm tra trên thiết bị thật trước khi dùng cho nghe nền.

Lấy truyện ưu tiên `/api/story` trên server Vercel, sau đó thử `api.allorigins.win` và `api.codetabs.com` nếu tải hoặc phân tích thất bại. Server chỉ truy cập HTTP/HTTPS công khai, kiểm tra và ghim IP kết nối, kiểm tra lại từng chuyển hướng, giới hạn 20 giây/2 MB và không gửi cookie đăng nhập. Hỗ trợ các selector nội dung phổ biến, bao gồm `.chapter-content`, `.entry-content` và `.reading-content`. Website thay cấu trúc, yêu cầu đăng nhập, chống bot hoặc dựng nội dung bằng JavaScript vẫn có thể không lấy được; khi đó có thể dán văn bản trực tiếp. API này tải HTML, không chạy trình duyệt hoặc vượt qua xác minh của website nguồn.

API key được nhập trong giao diện và lưu trên thiết bị. AI là chức năng tùy chọn và có thể tính phí theo nhà cung cấp. Test dùng phản hồi AI và giọng đọc mô phỏng, không gọi dịch vụ trả phí hay xác minh âm thanh thực tế.

Thư viện vẫn dùng localStorage với tối đa 500 chương; dung lượng thực tế tùy trình duyệt. Khi ghi thất bại, ứng dụng báo lỗi để người dùng xuất dữ liệu trước khi đóng trang. Chưa có đồng bộ tài khoản hay service worker cho offline toàn bộ ứng dụng.
