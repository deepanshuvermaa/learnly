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
  openai: {
    id: 'openai',
    label: 'OpenAI',
    baseUrl: 'https://api.openai.com/v1',
    defaultModel: 'gpt-4o-mini',
    supportsEmbeddings: true,
    defaultEmbeddingModel: 'text-embedding-3-small',
    keysUrl: 'https://platform.openai.com/api-keys'
  },
  gemini: {
    id: 'gemini',
    label: 'Google Gemini',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
    defaultModel: 'gemini-2.5-flash',
    supportsEmbeddings: true,
    defaultEmbeddingModel: 'gemini-embedding-001',
    keysUrl: 'https://aistudio.google.com/app/apikey'
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
  sessionDelete: 'session:delete',

  // Code generation
  codegenGenerate: 'codegen:generate',
  codegenCancel: 'codegen:cancel',
  codegenChunk: 'codegen:chunk', // main -> renderer (event)
  codegenStatus: 'codegen:status', // main -> renderer (event): fallback / retry notices
  codegenDone: 'codegen:done', // main -> renderer (event)
  codegenError: 'codegen:error', // main -> renderer (event)
  codegenSuggestion: 'codegen:suggestion', // main -> overlay (event)
  codegenSavePrompt: 'codegen:save-prompt',
  codegenStats: 'codegen:stats',
  codegenHistory: 'codegen:history',
  codegenHistoryClear: 'codegen:history-clear',
  codegenSaveFile: 'codegen:save-file',

  // Shortcuts
  shortcutsSet: 'shortcuts:set',
  shortcutsCheck: 'shortcuts:check',
  shortcutToggleCodePanel: 'shortcut:toggle-code-panel' // main -> overlay (event)
} as const

export const DEFAULT_SHORTCUTS = {
  toggleOverlay: 'CommandOrControl+Shift+Space',
  toggleListening: 'CommandOrControl+Shift+Enter',
  askNow: 'CommandOrControl+Alt+A',
  toggleClickThrough: 'CommandOrControl+Shift+I',
  toggleCodePanel: 'CommandOrControl+Shift+G'
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

export const DEFAULT_CODE_GEN_PROMPT = [
  'You are an expert backend engineer providing real-time code solutions during meetings.',
  '',
  'CRITICAL: Keep responses to 2-3 minutes reading time (≈150-300 words explanation + code).',
  '',
  'Guidelines:',
  '- Lead with the concept/algorithm in 2-3 sentences',
  '- Explain HOW it works, not WHAT it is',
  '- For simple problems (2-sum, palindrome): brief explanation + code',
  '- For complex problems (rate limiters, caching): explain the pattern, key decisions, then code',
  '- Real-world trade-offs over perfect solutions',
  '- Code must be production-ready, human-written style',
  '- No verbose comments; code speaks for itself',
  '- Include relevant imports and dependencies',
  '',
  'Remember: You are helping during a live meeting. Keep it CONCISE and ACTIONABLE.'
].join('\n')

export const CODEGEN_PROMPT_MAX_CHARS = 5000

export const CODEGEN_SCOPES = [
  { id: 'brute-force', label: 'Brute force', hint: 'Quick working snippet' },
  { id: 'walkthrough', label: 'Walkthrough', hint: 'Commented, explains the why' },
  { id: 'full-code', label: 'Full code', hint: 'Production-ready module' }
] as const

export const CODE_LANGUAGES = [
  { id: 'typescript', label: 'TypeScript', ext: 'ts' },
  { id: 'javascript', label: 'JavaScript', ext: 'js' },
  { id: 'python', label: 'Python', ext: 'py' },
  { id: 'go', label: 'Go', ext: 'go' },
  { id: 'java', label: 'Java', ext: 'java' },
  { id: 'rust', label: 'Rust', ext: 'rs' },
  { id: 'sql', label: 'SQL', ext: 'sql' },
  { id: 'bash', label: 'Bash', ext: 'sh' }
] as const

/** Order tried when the preferred provider fails (only providers with a key). */
export const CODEGEN_PROVIDER_ORDER: ProviderId[] = ['openai', 'groq', 'gemini', 'xai', 'moonshot']

export const DEFAULT_CODEGEN_PROMPT = DEFAULT_CODE_GEN_PROMPT

/** Starting points for the code-generation system prompt, picked from Settings. */
export const CODEGEN_PROMPT_TEMPLATES: { id: string; label: string; prompt: string }[] = [
  { id: 'general', label: 'General', prompt: DEFAULT_CODEGEN_PROMPT },
  {
    id: 'node',
    label: 'Node.js / TypeScript backend',
    prompt: [
      DEFAULT_CODEGEN_PROMPT,
      '',
      'Stack: Node.js 20 with TypeScript, Express or Fastify, PostgreSQL via an ORM or query builder.',
      'Prefer async/await, ES modules, zod for input validation, and typed errors over string throws.'
    ].join('\n')
  },
  {
    id: 'python',
    label: 'Python backend',
    prompt: [
      DEFAULT_CODEGEN_PROMPT,
      '',
      'Stack: Python 3.11+, FastAPI or Django, SQLAlchemy, pytest.',
      'Use type hints, dataclasses or pydantic models, and one-line docstrings at most.'
    ].join('\n')
  },
  {
    id: 'go',
    label: 'Go services',
    prompt: [
      DEFAULT_CODEGEN_PROMPT,
      '',
      'Stack: Go 1.22, net/http or chi, database/sql or pgx.',
      'Return errors explicitly (if err != nil), wrap them with fmt.Errorf("...: %w", err), pass context.Context first.'
    ].join('\n')
  },
  {
    id: 'java',
    label: 'Java / Spring',
    prompt: [
      DEFAULT_CODEGEN_PROMPT,
      '',
      'Stack: Java 21, Spring Boot 3, Spring Data JPA, JUnit 5.',
      'Use records for DTOs, constructor injection, and Optional instead of null returns.'
    ].join('\n')
  },
  {
    id: 'algorithms',
    label: 'Algorithms / interview-style',
    prompt: [
      DEFAULT_CODEGEN_PROMPT,
      '',
      'Questions are usually algorithmic. State time and space complexity in the explanation,',
      'mention the brute-force baseline before the optimal approach, and handle edge cases (empty input, duplicates).'
    ].join('\n')
  }
]
