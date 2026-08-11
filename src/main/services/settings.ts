import Store from 'electron-store'
import type { Settings } from '@shared/types'
import { DEFAULT_SHORTCUTS } from '@shared/constants'

const DEFAULT_SYSTEM_PROMPT = [
  'You are Listenly, a private meeting copilot for one person (the user).',
  'You silently help the user recall accurate, specific information during their own',
  'work meetings and client calls. You are shown a live transcript and relevant',
  'excerpts from the user\'s own knowledge base.',
  '',
  'Rules:',
  '- Answer the most recent question directed at the user, grounded in the provided',
  '  context. Prefer facts from the retrieved context over general knowledge.',
  '- If the context does not contain the answer, say so briefly and give your best',
  '  general answer, clearly marked as not sourced from their notes.',
  '- Be concise and glanceable: lead with the answer in one line, then up to 3',
  '  short supporting bullets. The user is reading this mid-conversation.',
  '- Never invent figures, dates, names, or commitments. Accuracy over fluency.'
].join('\n')

export const defaultSettings: Settings = {
  activeProvider: 'gemini',
  models: {},
  embeddingProvider: 'gemini',
  stt: {
    engine: 'deepgram',
    language: 'en',
    deepgramModel: 'nova-2',
    whisper: {
      binaryPath: '',
      modelPath: '',
      threads: 4
    },
    macSystemAudioDeviceId: ''
  },
  overlay: {
    opacity: 1,
    contentProtection: true,
    skipTaskbar: true,
    clickThroughWhenIdle: true,
    position: null,
    width: 420,
    height: 560
  },
  copilot: {
    mode: 'manual',
    triggerOnQuestion: true,
    systemPrompt: DEFAULT_SYSTEM_PROMPT,
    maxContextChunks: 6
  },
  shortcuts: { ...DEFAULT_SHORTCUTS },
  consent: {
    acknowledgeBeforeCapture: true,
    retainAudio: false,
    retainTranscripts: true
  },
  onboarded: false
}

/**
 * Deep-merges persisted settings over defaults so that new fields added in later
 * versions get a value without wiping the user's saved config.
 */
function mergeDeep<T>(base: T, override: Partial<T>): T {
  if (override == null) return base
  const out: any = Array.isArray(base) ? [...(base as any)] : { ...base }
  for (const key of Object.keys(override)) {
    const b = (base as any)?.[key]
    const o = (override as any)[key]
    out[key] =
      o && typeof o === 'object' && !Array.isArray(o) && b && typeof b === 'object'
        ? mergeDeep(b, o)
        : o
  }
  return out
}

const store = new Store<{ settings: Partial<Settings> }>({ name: 'listenly-settings' })

export function getSettings(): Settings {
  return mergeDeep(defaultSettings, store.get('settings', {}) as Partial<Settings>)
}

export function setSettings(patch: Partial<Settings>): Settings {
  const next = mergeDeep(getSettings(), patch)
  store.set('settings', next)
  return next
}
