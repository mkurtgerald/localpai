# Privacy Design

Local Photo AI is designed around one rule: generation data stays on the phone.

## Local data
The following are stored locally in browser storage:
- prompt text associated with local gallery entries
- seeds
- generated PNG blobs
- local gallery history
- model/runtime cache state

## Network use before Offline Lock
The app may make GET requests to download:
- JavaScript inference runtime files
- tokenizer files
- open model files

The service worker blocks remote non-GET requests.

## Offline Lock
After you install and verify the engine, Offline Lock blocks uncached external requests from the app.

## No remote inference endpoint
This codebase has no backend endpoint that accepts a prompt or reference image and returns a generated image.

## iCloud Photos
The app's local gallery is separate from Apple's Photos library. If you use Save / Share and save a generated image into Photos, iOS/iCloud behavior is controlled by your iPhone settings, not by this app.
