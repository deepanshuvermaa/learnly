# Listenly

A meeting copilot that runs entirely on your own machine. It listens to your calls,
transcribes them as they happen, and pulls up answers from your own notes when a client or your
boss asks you something nobody could reasonably keep in their head.

Everything stays local. Your API keys, your notes, your transcripts. There's no Listenly
account and no server in the middle. The only things that ever leave your machine are the calls
to the AI and transcription providers you plug in yourself.

## What it does, and what it doesn't

It's a private assistant for your own meetings: live transcription of both sides, search across
whatever notes and docs you give it, and a small floating window that streams an answer. That
window can be kept out of your own screen share, the same way presenter notes don't show up when
you share your slides.

It is not a way to hide the app from your computer. The screen-share option keeps the panel out
of the video you broadcast. It does not make the process invisible to your OS or your IT team,
and it was never built to. Recording other people can also require their consent depending on
where you are, and that part is on you.

## What you need

- Node 18 or newer (I'm running 22)
- Windows 10 (2004+) or 11 if you want the screen-share hiding to actually work
- Your own API keys:
  - one LLM: Gemini, OpenAI, Grok, or Kimi. Free tiers are plenty.
  - Gemini or OpenAI also powers the note search (embeddings)
  - Deepgram for live transcription

You paste the keys into the app under Settings, and they're encrypted with the OS keychain. They
never leave the machine except to hit the provider you chose.

## Running it

```
npm install
npm run dev
```

The first launch opens Settings. Add an LLM key, add your Deepgram key, paste some notes into the
Knowledge base tab, and hit Finish setup. The floating panel shows up after that.

To make a packaged Windows build:

```
npm run build
npm run dist:win
```

## Using it in a call

Join Zoom, Meet, or Teams like you normally would. Hit Start listening in the panel. When the
picker asks what to share for system audio, choose the meeting window and tick "Share audio" —
that's how it hears the other person. Your own mic is captured separately.

From there you can press Ask now (Ctrl+Shift+Enter) to answer the latest question, or turn on
Auto and let it answer by itself whenever it hears a question. Ctrl+Shift+Space hides and shows
the panel, and Ctrl+Shift+I flips click-through so it never steals your clicks.

## Keeping transcription local

If you'd rather not send any audio to Deepgram, switch Transcription to Local Whisper and point
it at a whisper.cpp build:

```
git clone https://github.com/ggerganov/whisper.cpp && cd whisper.cpp
cmake -B build && cmake --build build -j --config Release
./models/download-ggml-model.sh base.en
```

Then set the binary (build/bin/whisper-cli) and the model file (models/ggml-base.en.bin) in
Settings. base.en keeps up fine on a laptop; the bigger models are more accurate but slower.

## A couple of things to know

The screen-share hiding leans on Electron's setContentProtection, which has been unreliable
across different Electron and Windows versions, so I've pinned Electron to 31.7.6. Test it on your
own setup before you count on it.

Licensed under GPL-3.0.
