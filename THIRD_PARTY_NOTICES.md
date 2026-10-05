# Thư viện giọng đọc

Giữ các thông báo giấy phép khi phân phối lại các thư viện và WASM. Các model Piper được tải riêng từ Hugging Face, không nằm trong repository này; điều kiện sử dụng từng model theo model card đi kèm, không suy ra từ giấy phép thư viện.

| Thành phần | Phiên bản | Giấy phép / nguồn |
| --- | --- | --- |
| Python edge-tts | 7.2.8 | LGPL-3.0, https://github.com/rany2/edge-tts |
| Piper TTS Web | 1.0.5 | MIT, https://github.com/Mintplex-Labs/piper-tts-web |
| Piper WASM | 1.0.0 | MIT theo package, https://github.com/diffusion-studio/piper-wasm; phonemizer bao gồm eSpeak NG |
| ONNX Runtime Web | 1.18.0 | MIT, https://github.com/microsoft/onnxruntime |
| eSpeak NG WASM | 1.0.2 | GPL-3.0-or-later, https://github.com/ianmarmour/espeak-ng.js |

`npm run dev` / `npm run build` sao chép giấy phép eSpeak từ package sang `/tts/licenses/espeak-ng.txt`. Giấy phép ONNX Runtime và metadata giấy phép/nguồn của hai package Piper được giữ trong `public/licenses/`; package Piper công bố MIT trong `package.json` nhưng không kèm file LICENSE trong bản npm. Mã nguồn eSpeak NG và công cụ build WASM nằm ở repository upstream được dẫn ở trên; giữ nguồn và giấy phép tương ứng khi chỉnh sửa hoặc phân phối bản riêng.

Model catalog: https://huggingface.co/diffusionstudio/piper-voices/tree/main. Xem `MODEL_CARD` trong thư mục của từng model để kiểm tra điều kiện dữ liệu/giọng nói trước khi tái phân phối hoặc dùng thương mại.
