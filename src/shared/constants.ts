/**
 * Shared constants: provider registry, IPC channel names, defaults.
 * This file is imported by both the main and renderer processes, so it must
 * stay free of any Node- or DOM-specific APIs.
 */

export type ProviderId = 'gemini' | 'openai' | 'groq' | 'xai' | 'moonshot'

export interface ProviderSpec {
  id: ProviderId
  label: string
  /** OpenAI-compatible base URL. All four providers expose a /chat/completions endpoint. */
  baseUrl: string
  /** Sensible free-tier-friendly default chat model. Editable in Settings. */
  defaultModel: string
  /** Whether this provider exposes an OpenAI-compatible /embeddings endpoint. */
  supportsEmbeddings: boolean
  defaultEmbeddingModel?: string
  /** Where the user obtains a key — surfaced in the onboarding UI. */
  keysUrl: string
}

/**
 * Every provider here speaks the OpenAI Chat Completions wire format, which lets
 * a single streaming client drive all of them by swapping baseUrl + key + model.
 * Gemini is reached through its OpenAI-compatibility endpoint.
 */
export const PROVIDERS: Record<ProviderId, ProviderSpec> = {
  gemini: {
    id: 'gemini',
    label: 'Google Gemini',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
    defaultModel: 'gemini-2.5-flash',
    supportsEmbeddings: true,
    defaultEmbeddingModel: 'gemini-embedding-001',
    keysUrl: 'https://aistudio.google.com/app/apikey'
  },
  openai: {
    id: 'openai',
    label: 'OpenAI',
    baseUrl: 'https://api.openai.com/v1',
    defaultModel: 'gpt-4o-mini',
    supportsEmbeddings: true,
    defaultEmbeddingModel: 'text-embedding-3-small',
    keysUrl: 'https://platform.openai.com/api-keys'
  },
  groq: {
    id: 'groq',
    label: 'Groq',
    baseUrl: 'https://api.groq.com/openai/v1',
    defaultModel: 'llama-3.3-70b-versatile',
    supportsEmbeddings: false,
    keysUrl: 'https://console.groq.com/keys'
  },
  xai: {
    id: 'xai',
    label: 'xAI Grok',
    baseUrl: 'https://api.x.ai/v1',
    defaultModel: 'grok-3',
    supportsEmbeddings: false,
    keysUrl: 'https://console.x.ai'
  },
  moonshot: {
    id: 'moonshot',
    label: 'Moonshot Kimi',
    baseUrl: 'https://api.moonshot.ai/v1',
    defaultModel: 'moonshot-v1-8k',
    supportsEmbeddings: false,
    keysUrl: 'https://platform.moonshot.ai/console/api-keys'
  }
}

export const PROVIDER_IDS = Object.keys(PROVIDERS) as ProviderId[]

/** IPC channel names, centralised so main + preload + renderer never drift. */
export const IPC = {
  // Settings & secrets
  settingsGet: 'settings:get',
  settingsSet: 'settings:set',
  secretsSet: 'secrets:set',
  secretsStatus: 'secrets:status',
  secretsClear: 'secrets:clear',

  // LLM
  llmComplete: 'llm:complete',
  llmCancel: 'llm:cancel',
  llmStreamChunk: 'llm:stream-chunk', // main -> renderer (event)
  llmStreamDone: 'llm:stream-done', // main -> renderer (event)
  llmStreamError: 'llm:stream-error', // main -> renderer (event)

  // STT (speech-to-text)
  sttStart: 'stt:start',
  sttAudio: 'stt:audio', // renderer -> main (PCM frames)
  sttStop: 'stt:stop',
  sttTranscript: 'stt:transcript', // main -> renderer (event)
  sttState: 'stt:state', // main -> renderer (event)

  // Copilot orchestration (retrieval + prompt assembly, server-side)
  copilotPrepare: 'copilot:prepare',

  // RAG
  ragIngestText: 'rag:ingest-text',
  ragIngestFiles: 'rag:ingest-files',
  ragQuery: 'rag:query',
  ragList: 'rag:list',
  ragDelete: 'rag:delete',
  ragClear: 'rag:clear',

  // Overlay window controls
  overlayToggle: 'overlay:toggle',
  overlaySetInteractive: 'overlay:set-interactive',
  overlaySetContentProtection: 'overlay:set-content-protection',
  overlayMove: 'overlay:move',
  windowOpenSettings: 'window:open-settings',
  dialogPickFile: 'dialog:pick-file',

  // Logging
  logWrite: 'log:write',
  logPath: 'log:path',
  logReveal: 'log:reveal',

  // Session persistence
  sessionSave: 'session:save',
  sessionList: 'session:list',
  sessionLoad: 'session:load',
  sessionDelete: 'session:delete'
} as const

export const DEFAULT_SHORTCUTS = {
  toggleOverlay: 'CommandOrControl+Shift+Space',
  askNow: 'CommandOrControl+Shift+Enter',
  toggleClickThrough: 'CommandOrControl+Shift+I'
} as const

export const APP_NAME = 'Listenly'

export const DEFAULT_SYSTEM_PROMPT = [
  'You are Listenly, a private meeting copilot for one person (the user).',
  'You silently help the user recall accurate, specific information during their own',
  'work meetings and client calls. You are shown a live transcript and relevant',
  "excerpts from the user's own knowledge base.",
  '',
  'Style:',
  '- Be concise and glanceable: lead with the answer in one line, then up to 3 short',
  '  supporting bullets. The user is reading this mid-conversation.',
  '- Answer the most recent question directed at the user.',
  '- Never invent figures, dates, names, or commitments. Accuracy over fluency.'
].join('\n')

export const DEFAULT_REFUSAL = "I don't have that in your notes."
