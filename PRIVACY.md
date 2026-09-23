# Privacy Design — Strict Local v0.2

The generator is intentionally unusable until the application has completed a fixed, non-personal verification generation and automatically sealed its network path.

## Before the seal
Setup mode may download only:
- the app shell from this repository's Pages origin;
- the pinned JavaScript inference runtime from esm.sh;
- open tokenizer/model files from the explicitly allow-listed model hosts.

The prompt field and generator are disabled during this phase. No personal photo input exists in the current build.

## After the seal
The service worker becomes cache-only for **every origin, including the app's own origin**.

A GET request that is not already cached receives a local 503 response.
Any non-GET request receives a local 403 response.
WebSocket, EventSource and sendBeacon are disabled by the application.

This means leaving Wi-Fi or cellular enabled does not reopen an application network path while generation is enabled.

## Generated images
Strict mode intentionally keeps generated image blobs only in JavaScript memory for the current app session.

It does **not**:
- write generated images to IndexedDB;
- write them to localStorage;
- save them to Apple Photos;
- save them to Files or iCloud Drive;
- expose a Share button;
- send them to an inference server.

The in-memory session gallery is destroyed when the page/app session closes or when Reset is used.

## Reset
Reset first destroys:
- generated image object URLs;
- the current rendered result;
- prompt text and seed;
- loaded model state.

Only after that destruction does it reopen setup/download mode.

## Scope of the guarantee
This design protects against network transmission by the Local Photo AI web application itself. It cannot make guarantees about unrelated operating-system behavior, device compromise, browser vulnerabilities, manual screenshots, or content a user deliberately transfers outside the application.
