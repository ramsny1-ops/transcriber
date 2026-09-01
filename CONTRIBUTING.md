# Contributing

1. Create a focused branch.
2. Run `bun install`.
3. Copy `.env.example` to `.env` and set a local `APP_SECRET`.
4. Run `bun run typecheck` and `bun test` before opening a change.
5. Keep browser code dependency-light. Prefer Web Audio, Web Speech, DOM, and platform APIs.
6. Preserve the existing interaction rules: no gradients, no glass panels, no hover-only critical actions, no low-contrast controls, no forced full-screen sections, and no animation that ignores `prefers-reduced-motion`.
7. Any new database write must enforce both authentication and record ownership.
8. Any new user-controlled visual value must be validated server-side before persistence.

For transcription engines, implement an adapter rather than coupling the UI directly to one vendor. Browser SpeechRecognition is the default adapter, not an architectural requirement.
