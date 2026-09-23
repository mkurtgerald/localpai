# Local Photo AI — Tiny-SD iPhone engine

The previous multi-GB SD-Turbo browser path was retired after repeated end-of-install failures on iPhone.

## Current engine candidate
- Model: `cursedhelm/aderpy-deepdreamer-onnx/tiny-sd-web-q4f16`
- Base: `segmind/tiny-sd`
- Runtime payload used for text-to-image: ~635 MB plus runtime/tokenizer overhead
- Quantization: 4-bit weights with FP16 execution
- Browser runtime: pinned ONNX Runtime Web 1.30.0 WebGPU build
- Required device feature: WebGPU `shader-f16`

The model repository describes the q4f16 variant as 707 MB including VAE encoder; this app does not download the VAE encoder for text-to-image, reducing the payload. The text encoder is about 69.6 MB, UNet about 466 MB, and VAE decoder about 97.6 MB.

## Privacy gate
Personal input is disabled during all network-enabled setup.

Verify & Seal:
1. generates a harmless fixed test;
2. seals service-worker cache misses;
3. proves an uncached request is blocked;
4. unloads all inference sessions;
5. reloads model sessions from local browser cache while sealed;
6. generates a second harmless fixed test.

Personal prompts unlock only after all six operations succeed.

## Status
Candidate engine awaiting live iPhone validation.
