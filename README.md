# Local Photo AI

Phone-only image generation for iPhone with a hardened strict-local privacy gate.

## v0.2 privacy model
- Generation is disabled during all network-enabled setup.
- Setup performs one fixed non-personal test generation.
- On success, the app automatically switches its service worker to cache-only mode.
- Generation becomes available only after that network seal is confirmed.
- Once sealed, every uncached request is blocked even if Wi-Fi/cellular remain on.
- Generated images are RAM-only and disappear when the app session closes.
- No Save/Share button is enabled in strict mode.
- No IndexedDB photo gallery is used.

See [PRIVACY.md](PRIVACY.md).

## Engine
Current alpha uses SD-Turbo via browser ONNX execution, preferring WebGPU with a WASM fallback.

## Important limitation
This is still an alpha browser inference stack. The target iPhone must prove that the entire runtime/model set is cached and can generate after the network seal. If any required asset was not cached during verification, strict mode will fail closed rather than silently fetch it.

## Deployment
Serve this repository over HTTPS with GitHub Pages. Open it in Safari, add it to the Home Screen, install/load the engine, then tap **Verify & Seal**.

After sealing, leaving the phone online is allowed from the app's perspective; Airplane Mode remains an independent test that the cached inference path is actually complete.
