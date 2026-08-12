import Store from 'electron-store'
import type { Settings } from '@shared/types'
import { DEFAULT_SHORTCUTS, DEFAULT_SYSTEM_PROMPT, DEFAULT_REFUSAL } from '@shared/constants'

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
    groundingMode: 'balanced',
    refusalText: DEFAULT_REFUSAL,
    examples: [],
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
