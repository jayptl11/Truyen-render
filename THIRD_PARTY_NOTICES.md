# Thư viện giọng đọc

Giữ các thông báo giấy phép khi phân phối lại các thư viện và WASM. Các model Piper được tải riêng từ Hugging Face, không nằm trong repository này; điều kiện sử dụng từng model theo model card đi kèm, không suy ra từ giấy phép thư viện.

| Thành phần | Phiên bản | Giấy phép / nguồn |
| --- | --- | --- |
| Python edge-tts | 7.2.8 | LGPL-3.0, https://github.com/rany2/edge-tts |
| VieNeu Python SDK | 3.8.3 | Apache-2.0, https://github.com/pnnbao97/VieNeu-TTS |
| Piper TTS Web | 1.0.5 | MIT, https://github.com/Mintplex-Labs/piper-tts-web |
| Piper WASM | 1.0.0 | MIT theo package, https://github.com/diffusion-studio/piper-wasm; phonemizer bao gồm eSpeak NG |
| ONNX Runtime Web | 1.18.0 | MIT, https://github.com/microsoft/onnxruntime |
| eSpeak NG WASM | 1.0.2 | GPL-3.0-or-later, https://github.com/ianmarmour/espeak-ng.js |

`npm run dev` / `npm run build` sao chép giấy phép eSpeak từ package sang `/tts/licenses/espeak-ng.txt`. Giấy phép ONNX Runtime và metadata giấy phép/nguồn của hai package Piper được giữ trong `public/licenses/`; package Piper công bố MIT trong `package.json` nhưng không kèm file LICENSE trong bản npm. Mã nguồn eSpeak NG và công cụ build WASM nằm ở repository upstream được dẫn ở trên; giữ nguồn và giấy phép tương ứng khi chỉnh sửa hoặc phân phối bản riêng.

Model catalog: https://huggingface.co/diffusionstudio/piper-voices/tree/main. Xem `MODEL_CARD` trong thư mục của từng model để kiểm tra điều kiện dữ liệu/giọng nói trước khi tái phân phối hoặc dùng thương mại.

Adapter `src/services/tts/piper.ts` dùng phonemizer của Piper TTS Web 1.0.5 và tự chạy ONNX. Cách ánh xạ âm vị theo `phoneme_id_map` dựa trên bản tham chiếu Piper: https://github.com/rhasspy/piper/blob/master/src/python_run/piper/voice.py (MIT). Giữ việc bỏ qua ký hiệu không có trong bảng của model và không ép chỉ số vượt giới hạn.

VIVOS gồm 65 speaker, cùng một model; model card ghi giấy phép dữ liệu CC BY-NC-SA 4.0 (phi thương mại). Model card 25hours_single ghi giấy phép dữ liệu Unknown. Các lựa chọn này có thông báo trong giao diện; không xem miễn phí tải model là quyền sử dụng thương mại mặc định.

VieNeu v3 Turbo và preset đi kèm: https://huggingface.co/pnnbao-ump/VieNeu-TTS-v3-Turbo, Apache-2.0 theo model card. Model/codec được tải vào cache của dịch vụ riêng, không commit trong repository hoặc đóng gói vào frontend. Giữ thông báo giấy phép của model, SDK và các dependency khi phân phối lại dịch vụ.
