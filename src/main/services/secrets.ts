import Store from 'electron-store'
import { safeStorage } from 'electron'
import type { SecretKey, SecretsStatus } from '@shared/types'
export type { SecretKey }

/**
 * API keys are the most sensitive thing on disk. We encrypt each value with
 * Electron's safeStorage, which is backed by the OS keychain / DPAPI (Windows
 * Credential store via the logged-in user's credentials). The ciphertext is
 * stored base64 in a separate electron-store file. Keys never touch the
 * renderer — only the main process reads plaintext, at request time.
 */

const store = new Store<{ secrets: Record<string, string> }>({ name: 'listenly-secrets' })

function encAvailable(): boolean {
  try {
    return safeStorage.isEncryptionAvailable()
  } catch {
    return false
  }
}

export function setSecret(key: SecretKey, value: string): void {
  const secrets = store.get('secrets', {})
  if (!value) {
    delete secrets[key]
  } else if (encAvailable()) {
    secrets[key] = 'enc:' + safeStorage.encryptString(value).toString('base64')
  } else {
    // Fallback for environments without OS-level encryption (e.g. some Linux).
    // Clearly marked so we know it is not encrypted at rest.
    secrets[key] = 'plain:' + Buffer.from(value, 'utf8').toString('base64')
  }
  store.set('secrets', secrets)
}

export function getSecret(key: SecretKey): string | null {
  const secrets = store.get('secrets', {})
  const raw = secrets[key]
  if (!raw) return null
  try {
    if (raw.startsWith('enc:')) {
      return safeStorage.decryptString(Buffer.from(raw.slice(4), 'base64'))
    }
    if (raw.startsWith('plain:')) {
      return Buffer.from(raw.slice(6), 'base64').toString('utf8')
    }
  } catch {
    return null
  }
  return null
}

/** Append a new key to any already stored for this provider (comma-separated), deduping. */
export function addSecret(key: SecretKey, value: string): void {
  const trimmed = value.trim()
  if (!trimmed) return
  const existing = (getSecret(key) || '')
    .split(',')
    .map((k) => k.trim())
    .filter(Boolean)
  if (!existing.includes(trimmed)) existing.push(trimmed)
  setSecret(key, existing.join(','))
}

export function clearSecret(key: SecretKey): void {
  const secrets = store.get('secrets', {})
  delete secrets[key]
  store.set('secrets', secrets)
}

export function secretsStatus(): SecretsStatus {
  const count = (k: SecretKey): number => {
    const value = getSecret(k)
    if (!value) return 0
    return value.split(',').map((v) => v.trim()).filter(Boolean).length
  }
  return {
    gemini: count('gemini'),
    openai: count('openai'),
    groq: count('groq'),
    xai: count('xai'),
    moonshot: count('moonshot'),
    deepgram: count('deepgram')
  }
}
