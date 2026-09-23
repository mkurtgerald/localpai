# Strict-local privacy design — Tiny-SD v0.5

No personal prompt UI is enabled while downloads are allowed.

The app explicitly caches its pinned runtime, tokenizer, and model assets. When the privacy worker is sealed, every GET becomes cache-only and every non-GET request is blocked. An uncached request returns a local 503.

Before personal generation is enabled, the app:
- runs a fixed harmless generation;
- enables the seal;
- tests that an uncached request is blocked;
- unloads the model sessions;
- reloads sessions from local Cache Storage while still sealed;
- runs a second fixed harmless generation.

Generated results and prompts are RAM-only in the current strict build. There is no Save/Share, IndexedDB photo gallery, cloud inference endpoint, analytics, WebSocket, EventSource, or sendBeacon path.

This is an application-level privacy control. It does not claim protection from a compromised operating system, browser vulnerability, manual screenshots, or content deliberately copied out of the app.
