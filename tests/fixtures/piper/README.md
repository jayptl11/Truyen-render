# Piper model configuration fixtures

Configuration JSON downloaded from the same upstream as the pinned Piper library on 2026-10-09:

- [25hours](https://huggingface.co/diffusionstudio/piper-voices/resolve/main/vi/vi_VN/25hours_single/low/vi_VN-25hours_single-low.onnx.json)
- [VIVOS](https://huggingface.co/diffusionstudio/piper-voices/resolve/main/vi/vi_VN/vivos/x_low/vi_VN-vivos-x_low.onnx.json)
- [VAIS 1000](https://huggingface.co/diffusionstudio/piper-voices/resolve/main/vi/vi_VN/vais1000/medium/vi_VN-vais1000-medium.onnx.json)

The local fixtures omit `.onnx` from their filenames. Model weights are not committed; remove the `.json` suffix from the upstream links to download the corresponding ONNX files for the optional live test.

25hours and VIVOS have 130 symbols. The newer phonemizer emits Vietnamese tone digits at IDs 130 and above, reproducing the reported Gather error when default IDs are passed directly to those models. VAIS has 256 symbols and its mapping retains those digits. VIVOS has 65 speakers (IDs 0 through 64).

See the repository's THIRD_PARTY_NOTICES.md for model/data licensing notes.
