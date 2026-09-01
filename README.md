# VoiceWave Studio

A production-oriented voice caption workspace built with Bun, TypeScript, Express, EJS, SQLite, Web Audio, and the Web Speech APIs.

The background reacts to live microphone input. Loudness controls wave amplitude while an autocorrelation pitch estimator maps vocal fundamental frequency to wave density. Final speech-recognition results are autosaved to SQLite. Specific configured words or phrases can receive their own colors without recoloring the full caption. Users can export saved captions as TXT, JSON, SRT, or WebVTT and can send the current transcript through customizable browser text-to-speech.

## What is included

- Account registration, login, logout, and session persistence
- Bun Argon2id password hashing
- SQLite WAL mode, foreign keys, prepared statements, indexes, and ownership-scoped data
- Opaque authentication cookies with hashed server-side session tokens
- CSRF protection for forms and API writes
- Explicit development and production origin allowlists with credentialed CORS and Helmet CSP
- Authentication and global rate limiting
- Voice-reactive Canvas background using microphone waveform, RMS level, and pitch estimation
- Live interim and final caption display
- Selective word and phrase coloring with up to 20 rules
- User preferences persisted in SQLite
- Caption sessions and final caption segments persisted in SQLite
- TXT, JSON, SRT, and VTT exports generated from the database
- Export integrity SHA-256 hash
- Browser TTS speaker, locale, rate, pitch, volume, and tone presets
- Responsive controls with touch-sized targets
- `prefers-reduced-motion` support
- Docker and Compose files
- Tests for exporters, preference validation, and origin parsing

## Design rules

The interface intentionally avoids common generated-UI habits. There are no purple-blue gradients, gradient text, glass cards, decorative badges, icon-box rows, cursor beams, magnetic controls, staggered reveal sequences, random radii, hover-only actions, or full-page spinners. The only persistent animation is the requested voice-reactive background.

## Architecture

```text
Browser
  microphone
    -> Web Audio analyser
       -> RMS loudness
       -> pitch estimator
       -> Canvas background

  SpeechRecognition adapter
    -> interim caption: display only
    -> final caption: display + POST segment

  SpeechSynthesis
    <- text + speaker + locale + rate + pitch + volume + tone preset

Express
  auth routes
  studio routes
  /api/v1
    preferences
    caption sessions
    caption segments
    exports

SQLite
  users
  auth_sessions
  user_preferences
  caption_sessions
  caption_segments
  caption_exports
  audit_events
```

## Database relationships

```text
users 1---N auth_sessions
users 1---1 user_preferences
users 1---N caption_sessions
caption_sessions 1---N caption_segments
caption_sessions 1---N caption_exports
users 1---N audit_events
```

## Local setup

Requirements: Bun 1.2 or newer.

```bash
cp .env.example .env
```

The repository also includes `.env.development.example` and `.env.production.example` as explicit references for the two environments. The setup script uses `.env.example` for normal local setup.

Generate a real application secret:

```bash
openssl rand -base64 48
```

Place that value in `.env` as `APP_SECRET`, then install and start:

```bash
bun install
bun run typecheck
bun test
bun run dev
```

Or use the guided local setup:

```bash
bash scripts/setup.sh
```

Run with ngrok (expose to the internet)

If you want to expose the local dev server via ngrok, use the provided `bun` scripts. This repository uses Bun for scripts — run them with `bun run`.

Start a tunnel (no browser open):

```bash
bun run dev:ngrok
```

Start and automatically open the public ngrok URL in your browser (copies URL to clipboard when possible):

```bash
bun run dev:ngrok:open
```

Make sure `ngrok` is installed and authenticated. The scripts load `.env` (see `.env.example`) and will activate `.venv-whisper` if present.


Open:

```text
http://127.0.0.1:9388
```

Create an account. After registration you are taken directly to the studio.

## Caption workflow

1. Choose the recognition locale, visual settings, caption styling, and selective keyword colors.
2. Press `Start capture`.
3. Grant microphone permission.
4. The Canvas begins reacting immediately to live audio.
5. Interim recognition text is displayed but not stored.
6. Final recognition results are stored as ordered caption segments in SQLite.
7. Press `Stop` to finalize the caption session.
8. Choose TXT, JSON, SRT, or VTT and press `Save caption file`.

The screen-clear button clears only the live display. It does not silently destroy database content.

## Selective keyword color

Add exact words or phrases such as `warning`, `deadline`, or `payment failed`. Matching is case-insensitive and boundary-aware. Only those spans receive the configured color. Other words continue using the base caption color.

All persisted color values are constrained to six-digit hexadecimal colors and all keyword rules are validated server-side.

## Voice-reactive background

The background uses the same microphone stream as the analyser. It does not send audio to the Express server.

- RMS energy controls visual amplitude.
- Estimated voice pitch controls sine-wave frequency.
- Oscilloscope mode also draws the real time-domain microphone signal.
- Pitch bands add two restrained companion lines.
- Technical grid uses fixed reference lines plus the pitch wave.
- Solid mode disables wave drawing while keeping the rest of the studio available.

The pitch estimator focuses roughly on 60 to 500 Hz, a practical range for human fundamental frequency. It is a visualization feature, not a clinical or musical tuning instrument.

## Live transcription compatibility

`SpeechRecognition` is not implemented consistently by every browser. Its processing location is also browser-dependent; unless an implementation explicitly supports and enables on-device recognition, transcription may use a browser/vendor network service. The project detects it at runtime and does not hide failure behind an endless loader. If recognition is absent, microphone visualization and TTS remain available and the UI reports that captions need another recognition adapter.

For broader browser support or guaranteed offline transcription, replace the browser adapter with a server or local engine such as Whisper or Sherpa-ONNX. The database and UI contracts are already separated so that upgrade does not require redesigning the application.

MDN Web Speech API: https://developer.mozilla.org/en-US/docs/Web/API/Web_Speech_API

MDN SpeechRecognition: https://developer.mozilla.org/en-US/docs/Web/API/SpeechRecognition

MDN Web Audio API: https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API

## Text to speech

The TTS panel uses the browser's installed `SpeechSynthesisVoice` list. The selected speaker is persisted by `voiceURI` when available.

Supported controls:

- Speaker
- Language or locale
- Rate
- Pitch
- Volume
- Tone preset
- Play
- Pause and resume
- Stop
- Copy current caption into TTS

Tone presets are deliberate rate and pitch modifiers. The standard browser Speech Synthesis API does not expose a portable timbre or equalizer control, so the project does not pretend that `tone` changes the physical voice model.

## API

All write endpoints require authentication and the session CSRF token.

```text
GET    /api/v1/me
GET    /api/v1/preferences
PUT    /api/v1/preferences

POST   /api/v1/caption-sessions
GET    /api/v1/caption-sessions
GET    /api/v1/caption-sessions/:id
PATCH  /api/v1/caption-sessions/:id
DELETE /api/v1/caption-sessions/:id
POST   /api/v1/caption-sessions/:id/segments
POST   /api/v1/caption-sessions/:id/export
GET    /api/v1/exports/:id
```

Health check:

```text
GET /health
```

## Security choices

### Passwords

The project uses asynchronous `Bun.password.hash()` and `Bun.password.verify()`. Bun's default password algorithm is Argon2id.

### Sessions

The browser receives a random opaque token in an HttpOnly SameSite=Lax cookie. SQLite stores only its SHA-256 digest. Session rows also contain a separate CSRF token and expiry timestamp.

### Authorization

Caption sessions, segments, preferences, and exports are always queried with the authenticated `user_id`. A valid object ID from another account is therefore insufficient for access.

### SQLite

SQLite starts with foreign keys enabled, WAL journal mode, normal synchronous mode, and a busy timeout. Export files are stored outside the public directory and their resolved download path is checked against the configured export root.

### Browser policy

Helmet supplies the CSP and standard security headers. Scripts are self-hosted. Dynamic user-selected colors require style attributes, but scripts remain restricted to the same origin.

## Ports and allowed origins

Network binding and browser trust are separate settings. Do not use an origin variable as a server port setting.

The default development server is:

```text
SERVER_HOST=127.0.0.1
SERVER_PORT=9367
```

For an EJS server-rendered application the browser and API share a single port. `ALLOWED_ORIGINS_LOCAL` is only needed when you want to allow different LAN hostnames or other trusted development origins:

```env
ALLOWED_ORIGINS_LOCAL=http://192.168.1.127:9367
```

Do not use `*` with authenticated requests. VoiceWave sends credentials and therefore reflects only an exact origin that is already in the configured allowlist. `OPTIONS` preflight requests are handled by the origin policy middleware.

`ALLOWED_ORIGINS` is optional and additive. It adds trusted origins without removing the automatic development loopback origins or the production-specific list.

### Development origin behavior

Development includes these exact origins automatically for the configured server port:

```text
http://127.0.0.1:9367
http://localhost:9367
```

Use a single hostname/port pair consistently during a session (for example always use `http://127.0.0.1:9367`).

`ALLOWED_ORIGINS_LOCAL` adds extra trusted development origins such as a LAN IP. `ALLOWED_ORIGINS` is also additive and may be left empty when you do not need shared extras.

## Production deployment

Production does not inherit local origins. Configure at least one explicit HTTPS origin:

```bash
NODE_ENV=production \
SERVER_HOST=0.0.0.0 \
SERVER_PORT=8080 \
ALLOWED_ORIGINS_PRODUCTION=https://voice.example.com,https://www.voice.example.com \
APP_SECRET='replace-with-a-long-random-secret' \
TRUST_PROXY=true \
bun src/server.ts
```

Production session cookies are marked `Secure`, so serve the application through HTTPS. Plain HTTP production origins are rejected unless `ALLOW_INSECURE_PRODUCTION_ORIGINS=true` is deliberately set.

For Docker, the container listens on `8080` while Compose publishes host port `9388`, keeping the internal and external ports distinct:

```text
9388 -> 8080
```

Create a `.env` containing a real secret and your real production origins, then run:

```bash
docker compose up -d --build
```

Example deployment `.env`:

```env
APP_SECRET=replace-with-a-generated-secret-of-at-least-32-characters
ALLOWED_ORIGINS_PRODUCTION=https://voice.example.com,https://www.voice.example.com
TRUST_PROXY=true
```

Persist `/app/data`. It contains both the SQLite database and generated caption exports.

## Backups

At minimum back up:

```text
data/voice-wave.sqlite
data/exports/
```

A safe SQLite backup can be made with the SQLite CLI while the application is live:

```bash
sqlite3 data/voice-wave.sqlite ".backup 'voice-wave.backup.sqlite'"
```

## Maintenance

Remove expired sessions and compact the database when appropriate:

```bash
bun run db:vacuum
```

Do not run aggressive VACUUM operations in the middle of latency-sensitive capture traffic on a busy deployment.

## Tests

```bash
bun test
```

The test suite checks subtitle and text export formatting, server-side preference validation, origin normalization, duplicate removal, allowlist matching, and production HTTPS enforcement. Add route integration tests before changing authentication, session ownership, or export access logic.

## Project tree

```text
voice-wave-studio/
├── src/
│   ├── db/database.ts
│   ├── lib/
│   │   ├── exporters.ts
│   │   ├── preferences.ts
│   │   ├── origins.ts
│   │   └── security.ts
│   ├── middleware/
│   │   ├── auth.ts
│   │   ├── errors.ts
│   │   └── origin-policy.ts
│   ├── routes/
│   │   ├── api.routes.ts
│   │   ├── auth.routes.ts
│   │   └── studio.routes.ts
│   ├── scripts/vacuum.ts
│   ├── app.ts
│   ├── config.ts
│   └── server.ts
├── views/
├── public/
│   ├── css/app.css
│   └── js/studio.js
├── tests/
├── data/exports/
├── .env.example
├── .env.development.example
├── .env.production.example
├── Dockerfile
├── compose.yaml
└── package.json
```

## License

MIT.
