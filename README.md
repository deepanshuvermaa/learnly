# Listenly

A **local-first, bring-your-own-key meeting recall copilot**. Listenly listens to your
meetings, transcribes them on the fly, and surfaces grounded answers pulled from *your own*
knowledge base — so you can recall the specific fact, figure, or past commitment a client or
your boss just asked about, without memorising everything.

Everything stays on your device: your API keys (encrypted), your settings, your knowledge
base, and your transcripts. There is no Listenly server.

---

## What it is — and what it deliberately is not

**Is:** a private, on-device assistant for *your own* meetings. Live transcription of you and
the other participants, retrieval over your notes/docs, and a streaming answer in a floating
overlay. The overlay can be excluded from **your own screen share** — the same way presenter
notes don't appear on the projector — and hidden from the taskbar/Alt-Tab.

**Is not:** a tool to hide the running application from your operating system, task manager, or
your employer's device monitoring. `setContentProtection` keeps the overlay out of the *frame
you broadcast*; it does not make the process invisible, and Listenly never claims otherwise.
Recording other people may require their consent depending on your jurisdiction and workplace
policy — you are responsible for that.

---

## Requirements

- **Node.js 18+** and **Windows 10 (2004+) / 11** for the screen-share-exclusion feature.
- API keys (all bring-your-own, free tiers work well):
  - At least one **LLM** provider: Google Gemini, OpenAI, xAI (Grok), or Moonshot (Kimi).
  - **Gemini or OpenAI** additionally power knowledge-base embeddings (retrieval).
  - **Deepgram** for live transcription (free tier includes generous streaming credit).

You enter all keys inside the app (Settings → AI providers / Transcription). They are encrypted
at rest with your OS keychain via Electron `safeStorage` and never leave your machine except to
call the provider you selected.

---

## Run it

```bash
npm install
npm run dev        # hot-reloading dev build
```

Production build / installer:

```bash
npm run build      # bundles main, preload, renderer
npm run dist:win   # produces a Windows installer in release/
```

### First-run setup

1. The Settings window opens on first launch. Add an **LLM key** and pick your active provider.
2. Add a **Deepgram key** under *Transcription*.
3. Under *Knowledge base*, paste notes or import files (`.txt/.md/.csv/.json`). This is what
   answers are grounded in.
4. Click **Finish setup**. The floating overlay is now active.

### Using it in a meeting

1. Join your Zoom/Meet/Teams call as usual.
2. In the overlay, click **Start listening**. When prompted for a screen to share for *system
   audio*, pick the meeting window/screen and enable **"Share audio"** — this is how Listenly
   hears the other participants. Your mic is captured separately.
3. Ask for help two ways:
   - **Auto**: it tracks the conversation; press **Ask now** (or `Ctrl+Shift+Enter`) to answer
     the latest question.
   - Toggle **Click-through** (`Ctrl+Shift+I`) so the panel never intercepts your clicks.
4. Toggle the overlay with `Ctrl+Shift+Space`.

---

## Architecture

```
Electron (main, CJS)                         Renderer (React + Vite, ESM)
├─ windows/overlayWindow  content protection  ├─ components/Overlay   floating copilot
│                         + skipTaskbar        ├─ components/Settings  keys / KB / privacy
├─ services/settings      electron-store       ├─ lib/audio/capture    mic + loopback
├─ services/secrets       safeStorage (enc)    │   + public/pcm-worklet.js  → 16k Int16 PCM
├─ services/llm/router    provider-agnostic    ├─ lib/copilot          ask flow + streaming
│   + client (OpenAI SSE) Gemini/OpenAI/xAI/Kimi├─ store/useStore       zustand
├─ services/stt           Deepgram live (ws)   └─ styles/tokens.css    Dimension design system
│   + whisper (local, roadmap)
├─ services/rag/store     local vector store (cosine, JSON-backed)
└─ ipc/handlers  ──────── preload (contextBridge) ──────── window.listenly
```

**Key design decisions (built for the long term, not patchwork):**

- **Provider-agnostic by construction.** All four LLMs speak the OpenAI Chat Completions wire
  format, so one streaming client drives them by swapping `baseUrl + key + model`. Swap or add
  providers without touching business logic.
- **Keys never touch the renderer.** All provider/STT calls run in the main process; the
  renderer only sends transcript text and receives streamed tokens over IPC.
- **Speaker separation by construction.** Mic ('me') and system loopback ('them') are
  transcribed on separate Deepgram sockets, so diarisation is free and low-latency.
- **Local vector store with a swap-ready surface.** Dependency-free cosine search over a JSON
  store today; the read/search/ingest API matches what LanceDB or sqlite-vec would expose, so
  scaling to an ANN index later is a store-file change, not an app rewrite.
- **Consent & retention are first-class.** Transcripts are only persisted when you opt in; a
  per-session acknowledgement gate is on by default.

---

## Roadmap (phase status)

| Phase | Status |
|-------|--------|
| 0 — Skeleton, config, provider seams | ✅ done |
| 1 — Dual-stream capture → live diarised transcript | ✅ wired (needs a real desktop + Deepgram key to validate) |
| 2 — Knowledge base ingest → embeddings → retrieval | ✅ done |
| 3 — Transcript + retrieval → streaming answers | ✅ done |
| 4 — Consent/retention controls, screen-share privacy | ✅ done |
| Auto-ask on detected questions | ✅ done (toggle **Auto** in the overlay) |
| 2b — Local Whisper engine (audio never leaves device) | ✅ done (bring your own whisper.cpp binary + model) |
| macOS system-audio path (virtual loopback device) | ✅ done (BlackHole/Aggregate) |
| 5 — Packaging/auto-update | ⏳ builder configured; auto-update TODO |

---

## Auto-ask

Toggle **Auto** in the overlay (or set Copilot mode to *auto* in settings). When the other
participant finishes a question — the transcript line ends with `?` or starts with a question
word — Listenly answers automatically. It's debounced (waits for the question to finish) and
rate-limited (a short cooldown) so a talkative speaker doesn't spawn a burst of requests.

## Local Whisper tier (audio never leaves your device)

Choose **Transcription → Local Whisper**, then point Listenly at a whisper.cpp binary + model.

Build whisper.cpp (once):

```bash
git clone https://github.com/ggerganov/whisper.cpp && cd whisper.cpp
cmake -B build && cmake --build build -j --config Release
./models/download-ggml-model.sh base.en      # or small.en / medium.en
```

Then in Settings → Transcription:
- **whisper.cpp binary** → `whisper.cpp/build/bin/whisper-cli` (Windows: `whisper-cli.exe`)
- **ggml model file** → `whisper.cpp/models/ggml-base.en.bin`

Listenly segments speech on silence (energy VAD) and transcribes each utterance locally. Larger
models are more accurate but slower — pick `base.en` for real-time on a laptop.

## macOS system audio

macOS can't hand system audio to the browser capture API, so route it through a virtual device:

1. Install **[BlackHole](https://github.com/ExistentialAudio/BlackHole)** (2ch).
2. In *Audio MIDI Setup*, create a **Multi-Output Device** = your speakers + BlackHole (so you
   still hear the call), and set the meeting app's output to it.
3. In Listenly → **Transcription → macOS system audio**, select **BlackHole** (or leave on
   auto-detect). Grant microphone permission when prompted.

---

## Notes & known caveats

- **Screen-share exclusion is flaky across Electron/Windows builds.** Electron is pinned to
  `31.7.6` for stable `setContentProtection`. Test on your actual Windows build + meeting app
  before relying on it. It is a privacy convenience, not a guarantee.
- **System-audio capture** requires enabling "Share audio" in the OS/Chromium picker. On macOS,
  loopback needs a virtual audio device (e.g. BlackHole) until the native path lands.
- Licensed **GPL-3.0-or-later**.
