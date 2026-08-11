import type { ProviderId } from './constants'

/** Persisted user settings. Everything here lives on-device (electron-store). */
export interface Settings {
  activeProvider: ProviderId
  /** Per-provider model overrides. Falls back to PROVIDERS[id].defaultModel. */
  models: Partial<Record<ProviderId, string>>
  /** Provider used for embeddings (must supportsEmbeddings). */
  embeddingProvider: ProviderId
  stt: {
    engine: 'deepgram' | 'whisper-local' | 'off'
    language: string
    /** Deepgram model name, e.g. "nova-2". */
    deepgramModel: string
    /** Local Whisper tier — audio never leaves the device. */
    whisper: {
      /** Path to the whisper.cpp binary (whisper-cli / main). */
      binaryPath: string
      /** Path to a ggml model file, e.g. ggml-base.en.bin. */
      modelPath: string
      threads: number
    }
    /**
     * macOS only: deviceId of the virtual loopback input (e.g. BlackHole) used to
     * capture system audio. Empty = auto-detect by label.
     */
    macSystemAudioDeviceId: string
  }
  overlay: {
    opacity: number
    contentProtection: boolean // exclude overlay from the user's own screen share
    skipTaskbar: boolean
    clickThroughWhenIdle: boolean
    position: { x: number; y: number } | null
    width: number
    height: number
  }
  copilot: {
    /** How aggressively to auto-suggest: 'manual' waits for the hotkey. */
    mode: 'auto' | 'manual'
    /** Detected-question heuristic trigger for auto mode. */
    triggerOnQuestion: boolean
    systemPrompt: string
    maxContextChunks: number
  }
  shortcuts: {
    toggleOverlay: string
    askNow: string
    toggleClickThrough: string
  }
  consent: {
    /** Require an explicit per-session acknowledgement before capturing audio. */
    acknowledgeBeforeCapture: boolean
    /** Persist raw audio to disk (off by default — transcripts only). */
    retainAudio: boolean
    /** Persist transcripts to disk. */
    retainTranscripts: boolean
  }
  onboarded: boolean
}

export type SecretKey = ProviderId | 'deepgram'
export type SecretsStatus = Record<SecretKey, boolean>

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export interface CompleteRequest {
  /** Correlates streamed chunks/events back to this request. */
  requestId: string
  provider?: ProviderId // defaults to activeProvider
  model?: string
  messages: ChatMessage[]
  temperature?: number
  maxTokens?: number
}

export interface StreamChunk {
  requestId: string
  delta: string
}

export interface StreamDone {
  requestId: string
  usage?: { promptTokens?: number; completionTokens?: number }
}

export interface StreamError {
  requestId: string
  message: string
}

export type Speaker = 'me' | 'them' | 'unknown'

export interface TranscriptSegment {
  id: string
  speaker: Speaker
  text: string
  /** Deepgram interim results arrive is_final=false, then finalize. */
  isFinal: boolean
  startMs: number
  endMs: number
}

export interface RagChunk {
  id: string
  source: string
  text: string
  score?: number
}

export interface RagDocument {
  id: string
  source: string
  chunks: number
  addedAt: number
}

export interface Session {
  id: string
  title: string
  createdAt: number
  updatedAt: number
  transcript: TranscriptSegment[]
  suggestions: { at: number; question: string; answer: string }[]
}
