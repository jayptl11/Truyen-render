# VieNeu-TTS v3 Turbo

Dịch vụ tạo giọng miễn phí từ model VieNeu v3 Turbo, dùng SDK `vieneu==3.8.3` và ONNX/CPU. Web lấy danh sách giọng trực tiếp từ SDK, không cố định tên hoặc số lượng. Không cung cấp API clone/upload giọng trong dịch vụ này.

## Chạy local trên Windows

Chạy từ thư mục gốc project, với Python 3.12:

```powershell
python -m venv .venv-vieneu
.\.venv-vieneu\Scripts\python.exe -m pip install -r services/vieneu/requirements.txt
npm run vieneu
```

Lần đầu tải model chính thức từ Hugging Face; chờ `Application startup complete`. Model được giữ trong `services/vieneu/.cache/` (không commit). Có thể đặt `HF_HOME` để đổi nơi lưu. Môi trường Python và model đã được cài/tải khi kiểm tra local trên máy hiện tại.

Ở terminal thứ hai:

```powershell
npm run dev
```

Trong web: **Giọng và tốc độ → Nguồn TTS → VieNeu v3 Turbo · máy chủ riêng**, rồi chọn nam/nữ và giọng. Âm thanh được tạo tại server, tốc độ phát vẫn đổi ở player. Mỗi phần tối đa 240 ký tự; player tự chia đoạn dài. Các clip được lưu trong cache âm thanh hiện có để nghe lại offline, danh sách giọng cũng được nhớ trên thiết bị.

Trên Linux/macOS, tạo venv tương tự rồi dùng `.venv-vieneu/bin/python -m pip install -r services/vieneu/requirements.txt`. `npm run vieneu` tự chọn đúng đường dẫn Python theo hệ điều hành. Có thể đặt `VIENEU_PYTHON_BIN` để dùng Python khác.

## Kết nối và triển khai

Luồng: **web/app → `/api/vieneu` → dịch vụ VieNeu → WAV**. Endpoint Node chỉ chuyển tiếp tới địa chỉ quản trị viên cấu hình; không nhận URL server từ người dùng. Model và thư viện VieNeu không được đưa vào function Vercel.

Local mặc định kết nối `http://127.0.0.1:8000`. Để dùng server khác, chép `.env.example` thành `.env.local`, đặt:

```dotenv
VIENEU_BASE_URL=https://YOUR_VIENEU_SERVER
VIENEU_API_KEY=YOUR_SHARED_TOKEN
```

`VIENEU_BASE_URL` là địa chỉ gốc, không thêm `/v1`. Khóa dùng chung là tùy chọn ở local; nếu dùng, đặt cùng `VIENEU_API_KEY` ở cả dịch vụ Python và API proxy. `npm run vieneu` đọc `.env.local`; khi chạy Docker/uvicorn trực tiếp thì truyền biến môi trường vào tiến trình. Không đặt khóa dưới tên bắt đầu bằng `VITE_`, vì khóa chỉ dùng giữa các server.

Ở Vercel, đặt hai biến trong cấu hình deployment và deploy lại. Địa chỉ VieNeu phải truy cập được từ Vercel, nên dùng HTTPS. `127.0.0.1` trên Vercel không trỏ tới laptop của bạn. Frontend web và các bản Android/iOS tương lai có thể gọi chung API backend này.

API proxy giới hạn 24 giây mỗi clip, 4 MB WAV; function Vercel có thời hạn 30 giây. Dịch vụ CPU xử lý một lượt tại một thời điểm, trả HTTP 429 khi bận. Player tự thử lại lỗi tạm thời, giữ vị trí khi hết số lần thử. Tạm dừng/dừng hủy request phía app; lượt suy luận CPU đã bắt đầu có thể vẫn hoàn thành trên server.

## Docker

```sh
docker build -t truyen-vieneu services/vieneu
docker run --rm -p 127.0.0.1:8000:8000 -v vieneu-models:/models -e VIENEU_API_KEY=YOUR_SHARED_TOKEN truyen-vieneu
```

Đặt dịch vụ sau reverse proxy HTTPS nếu cần truy cập từ Vercel hoặc máy khác. Bản Docker và deployment từ xa chưa được xác minh trong lượt kiểm tra local.

## Kiểm tra

- `GET /health`: trạng thái model và backend.
- `GET /v1/voices`: danh sách preset, canonical ID, tên hiển thị và giới tính.
- `POST /v1/audio/speech`: JSON `{ "model": "vieneu-v3-turbo", "input": "Xin chào.", "voice": "Trúc Ly", "response_format": "wav" }`. Lấy ID hợp lệ từ `/v1/voices`.
- `GET /api/vieneu` và `POST /api/vieneu` là giao diện của backend web, body POST gồm `text`, `voice`, `language: "vi-VN"`.

```powershell
.\.venv-vieneu\Scripts\python.exe -m unittest discover -s tests -p test_vieneu.py -v
node --test tests/vieneu-server.test.mjs
$env:VIENEU_LIVE='1'
npm run test:browser -- tests/browser/vieneu.spec.mjs
```

Kiểm tra live cần dịch vụ thật đang chạy. Không đặt `VIENEU_LIVE` thì chỉ ca live được bỏ qua; các ca selector, chia đoạn, retry catalog và cache vẫn chạy với API fixture.

## Nguồn và giấy phép

[SDK VieNeu](https://github.com/pnnbao97/VieNeu-TTS) và [model v3 Turbo](https://huggingface.co/pnnbao-ump/VieNeu-TTS-v3-Turbo) công bố Apache-2.0. Dùng model tự host không tính phí API theo ký tự; vẫn dùng tài nguyên máy chủ. Giữ giấy phép/thông báo nguồn khi phân phối lại model hoặc các thành phần đi kèm.
