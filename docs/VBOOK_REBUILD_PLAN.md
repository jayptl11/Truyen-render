# Kế hoạch làm lại trải nghiệm đọc/nghe theo VBook

Trạng thái: đã triển khai phiên nghe, thư viện/mục lục, lưu offline và PWA. Phần dưới giữ tiêu chí thiết kế và nghiệm thu; trạng thái kiểm tra thực tế xem README.md. Kiểm tra Edge dài 30 phút trên deployment Vercel vẫn cần chạy riêng bằng test:tts:live.

Nền tảng đã chốt: React/Vite trên Vercel cho cả PC và điện thoại. Phạm vi hiện tại là web, cùng PWA trên trình duyệt hỗ trợ. Kế hoạch dựa trên trải nghiệm người dùng mong muốn và repository hiện tại; chưa xác minh mã nguồn/cấu trúc nội bộ của VBook PC trong bài VOZ.

## Mục tiêu sử dụng

Thêm truyện → mở mục lục → chọn chương → đọc hoặc nghe bản gốc ngay → tự nối chương → mở lại đúng vị trí. Dịch AI là một công cụ riêng, tùy chọn. TTS miễn phí gồm Edge Python, Piper, eSpeak và giọng thiết bị; giọng Google hiện là giọng do trình duyệt cung cấp.

## Những điểm hiện tại cần xử lý

- App.tsx còn phối hợp tải chương, phiên nghe, hẹn giờ, tự chuyển chương, dịch và lưu tiến độ.
- useAudioReader có phiên phát theo contentKey; loadChapter gọi stop, nên chuyển chương xóa bộ đệm và bộ đọc cục bộ.
- SpeechAudioBuffer chuẩn bị cố định hai phần và cache RAM tối đa 8 phần/12 MB; chưa quản lý theo số giây nghe còn lại hoặc nối âm thanh giữa chương.
- Đã có retry và bảo vệ callback cũ, nhưng kiểm tra mô phỏng chưa xác nhận độ ổn định Edge thực tế trên Vercel/Firefox.
- useChapterPreload tải trước một chương; lỗi tải trước có thể tắt chế độ nghe liên tục ngay khi chương hiện tại vẫn đọc được.
- Dữ liệu là chương rời trong localStorage, tối đa 500 chương; tiến độ lưu theo đoạn, chưa có truyện/mục lục hoặc thời gian trong audio.
- Nguồn truyện dùng chung một tập selector; chưa có adapter theo website, tìm truyện, thông tin truyện và mục lục.

## Giai đoạn 0 — Chốt ca lỗi và đo đường phát thực tế

Ghi lại URL deployment, trình duyệt/phiên bản, chương gây lỗi, giọng và tốc độ. Thêm log có cấu trúc: sessionId, chapterId, segmentId/hash, loại lỗi, HTTP status, thời gian tạo/phát, lần thử và số giây còn trong buffer. Không log nguyên văn truyện hay khóa API.

Tái hiện trên Firefox và Chromium với Edge thực tế, kiểm tra API Vercel và thời gian phản hồi. Đưa ca từng dừng sau bốn đoạn vào kiểm tra hồi quy. Nếu môi trường chặn Microsoft hoặc trình duyệt, ghi rõ kiểm tra thực tế chưa hoàn thành.

Đầu ra: ca tái hiện cụ thể, số đo ban đầu và phân biệt lỗi tải/TTS/phát/callback/tải chương sau. Chốt tiêu chí nghiệm thu trước khi thay engine.

## Giai đoạn 1 — Một session đọc/nghe xuyên suốt

Tách engine độc lập React, dự kiến src/engine/playback. Engine sở hữu sessionId và toàn bộ hàng đợi chương/đoạn/âm thanh. React nhận trạng thái và gửi lệnh play, pause, resume, stop, seek, changeVoice; App.tsx điều phối các màn hình.

Trạng thái rõ ràng: idle, preparing, playing, paused, reconnecting, completed. Mỗi job và sự kiện audio phải gắn đúng session/segment; kết quả cũ không thay đổi phiên mới. Hẹn giờ, giới hạn chương và chuyển chương tự động đi qua engine.

Tiến độ chứa truyện, chương, phiên bản văn bản, đoạn, phần âm thanh và thời gian trong phần đó; thêm fingerprint để phát hiện nội dung đã đổi. Giọng thiết bị lưu vị trí ký tự nếu có boundary event, không giả vờ hỗ trợ seek chính xác như audio.

Nghiệm thu: tạm dừng im lặng ngay; tiếp tục không bỏ/đọc trùng phần đã qua; đổi truyện/giọng không bị callback cũ phát lại; chuyển chương không tạo một phiên nghe mới.

## Giai đoạn 2 — Bộ đệm theo thời lượng và provider ổn định

Đặt mục tiêu ban đầu 30–60 giây âm thanh phía trước, tính theo thời lượng và tốc độ phát. Điều chỉnh độ dài phần đọc theo số đo thời gian tạo; giữ RAM và số lượt tạo có giới hạn. Ưu tiên phần đang cần, rồi các phần kế tiếp và phần đầu chương sau. Piper/eSpeak suy luận lần lượt và giữ worker/model khi chuyển chương cùng giọng.

Tách adapter Edge/Piper/eSpeak/thiết bị cùng khai báo khả năng cache, seek và metadata giọng. Edge tiếp tục dùng Python edge-tts trên Vercel với request ngắn, timeout và retry hữu hạn có thể hủy. Kiểm tra thời gian cold start, giới hạn function và lỗi Microsoft trên deployment thật trước khi chọn ngưỡng. Không đổi giọng/nguồn tự động khi chưa được người dùng chọn.

Cache âm thanh bằng fingerprint nội dung + provider/version + voice + tham số tổng hợp. Thay tốc độ phát không tạo lại âm thanh nếu provider hỗ trợ. Chuẩn bị và giải mã phần kế tiếp trước khi phần hiện tại kết thúc; đo lựa chọn phát liên tục bằng Web Audio và fallback HTMLAudio. Mỗi phần giữ ánh xạ về vị trí văn bản để tô sáng và seek.

Nghiệm thu: đọc liên tục tối thiểu 30 phút qua nhiều chương trên Firefox/Chromium với Edge thật; tại 1×, 1.5×, 2× không mất/trùng nội dung. Với âm thanh đã đệm, khoảng ngắt thêm do player mục tiêu <=200 ms trên máy kiểm tra, giữ nhịp nghỉ tự nhiên của giọng. Khi ngắt mạng tạm thời, tự phục hồi; hết retry giữ đúng vị trí. Lỗi tải trước chương sau không dừng chương đang nghe.

## Giai đoạn 3 — Truyện, mục lục và nguồn nội dung

Thêm Book, Chapter, Source và ReadingPosition. Thư viện gom theo truyện, có bìa/thông tin nếu nguồn cung cấp, mục lục, cập nhật chương, đọc gần đây và tải khoảng chương.

Chuyển dữ liệu lớn sang IndexedDB; localStorage giữ cấu hình nhỏ. Migration giữ chương cũ, bản dịch, bookmark và tiến độ; nhóm chương cũ chưa biết truyện vào một nhóm có thể chỉnh sửa, tránh suy đoán ghép nhầm truyện. Kiểm tra chuyển dữ liệu trước khi xóa bản cũ.

Tạo source adapter có search, bookInfo, chapterList và chapterContent khi website hỗ trợ. Ưu tiên webnovel.vn cùng các nguồn người dùng thực sự đọc, sau đó mở rộng. Mỗi nguồn có fixture HTML và lỗi rõ ràng. Giữ API tải HTML với kiểm tra URL/DNS hiện có; website yêu cầu đăng nhập/xác minh cần luồng phù hợp khả năng truy cập thực tế.

Nghiệm thu: thêm được một truyện, mở mục lục, tải khoảng chương và nối nghe đúng thứ tự; cập nhật chương không mất bản dịch/tiến độ; dữ liệu cũ vẫn dùng được.

## Giai đoạn 4 — Giao diện theo luồng đọc truyện

Các màn hình chính: Thư viện, Nguồn/tìm truyện, Chi tiết truyện/mục lục, Trang đọc. Có thanh player gọn xuyên suốt và màn hình player đầy đủ cho chương hiện tại, tiến độ, tốc độ, giọng, hẹn giờ và chuyển chương.

Giữ lựa chọn Nguồn TTS → ngôn ngữ → nam/nữ nếu có metadata → giọng. Nội dung dán tay là một lựa chọn thêm truyện. Dịch AI và công cụ phân tích nằm trong công cụ riêng. Thể hiện preparing/reconnecting rõ ràng; không báo lỗi cho thao tác hủy chủ động. Bố cục và điều khiển thích ứng PC/điện thoại, bàn phím, chữ lớn, vùng an toàn và chế độ đọc tập trung.

Nghiệm thu: người dùng thêm truyện và bắt đầu đọc/nghe mà không phải cấu hình AI; trạng thái player nhất quán ở mọi màn hình, không tạo hai phiên audio đồng thời.

## Giai đoạn 5 — Tải để nghe, PWA và nghe nền

Thêm tác vụ tải chương/âm thanh có tiến độ, hủy và tiếp tục. Quản lý cache bằng giới hạn dung lượng/LRU, bảo vệ các mục người dùng đánh dấu giữ offline. Service worker cache app shell; IndexedDB lưu chương và audio phù hợp. Edge cần mạng để tạo âm thanh mới, nhưng audio đã tải phát được offline; Piper/eSpeak cần tài nguyên/model đã có trên máy.

Thêm Media Session cho nút play/pause/chương trước/sau và metadata. Kiểm tra ẩn tab/khóa màn hình trên thiết bị thật; Media Session không bảo đảm trình duyệt mobile giữ phiên nền. Wake Lock chỉ bật theo lựa chọn người dùng.

Thêm khả năng cài PWA trên trình duyệt hỗ trợ ở PC/điện thoại, cập nhật app shell và giao diện quản lý dữ liệu offline. Ghi rõ những khả năng nền thực sự đã kiểm tra trên từng trình duyệt/thiết bị.

## Thứ tự giao bản

1. Giai đoạn 0–2: phiên TTS liên tục ổn định, giữ UI hiện tại đủ dùng. Chưa đạt kiểm tra thật thì chưa chuyển sang mở rộng chức năng.
2. Giai đoạn 3–4: thư viện theo truyện, mục lục, nguồn và giao diện hoàn chỉnh.
3. Giai đoạn 5: tải offline, PWA và nghe nền theo khả năng trình duyệt.

Các thay đổi engine được triển khai qua adapter để giữ tính năng hiện có; dữ liệu được migration có thể kiểm tra và phục hồi. Nghiệm thu từng giai đoạn rồi đưa lên deployment thử trước khi thay mặc định.

## Bộ kiểm tra bắt buộc

- Trên 100 phần đọc/ít nhất ba chương, cả đoạn ngắn, dài, lặp văn bản, và văn bản tiếng Việt có dấu.
- Mạng chậm, timeout/429/5xx ở phần đang phát hoặc đang chuẩn bị; mất mạng rồi phục hồi; xác nhận mỗi sự kiện thuộc đúng session.
- Pause/stop/seek/đổi giọng trong khi tải, giải mã, retry hoặc chuyển chương; bộ hẹn giờ dừng được tất cả audio đã xếp lịch.
- Resume sau lỗi trong giữa một đoạn dài, sau reload/mở lại và sau cập nhật văn bản.
- Cache/dữ liệu migration, hết dung lượng, nguồn đổi HTML; kiểm tra RAM/worker không tăng không giới hạn.
- E2E phát audio thật, cùng kiểm tra Edge thật trên Vercel và Firefox/Chromium. Giữ kết quả mô phỏng và kiểm tra upstream thực tế riêng.
