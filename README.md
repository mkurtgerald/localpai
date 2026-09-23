# Local Photo AI

Phone-only, local-first image generation for iPhone.

## Goals
- No cloud inference API
- No account
- No analytics or telemetry
- Prompts and generated images remain on-device
- One-time runtime/model download, then offline-capable operation
- Installable from Safari as a Home Screen web app

## Current alpha
The current engine uses SD-Turbo through a browser ONNX runtime. It prefers WebGPU and falls back to WASM if the WebGPU execution provider cannot initialize.

The app shell is small; model weights are the large part.

## Privacy
Generated images are stored in this site's IndexedDB. They are not committed to this repository and are not uploaded to an image-generation service.

If you explicitly save an image to the iOS Photos library and iCloud Photos is enabled, iOS may sync that saved copy independently of this app.

See [PRIVACY.md](PRIVACY.md).

## Deploy
This repository is intended to be served as a static HTTPS site, e.g. with GitHub Pages.

After Pages is enabled, open the Pages URL on the iPhone in Safari, then Share → Add to Home Screen.

Inside the app:
1. Install / Load Model
2. Verify Offline Readiness
3. Turn On Offline Lock
4. Enable Airplane Mode
5. Generate again to prove the local path works

## Status
Alpha. Safari/WebGPU/ONNX compatibility on the target iPhone still needs live-device validation.
