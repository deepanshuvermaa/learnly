import { createHash } from 'crypto'
import type { ProviderId } from '@shared/constants'
import { estimateTokenCount } from '@shared/tokens'

/**
 * Token estimates for budgeting requests before they're sent. Counts are cached
 * by content hash so the (usually unchanged) system prompt isn't recounted on
 * every generation.
 */
const MAX_CACHE = 256
const cache = new Map<string, number>()

export function hashText(text: string): string {
  return createHash('sha256').update(text).digest('hex')
}

export function countTokens(text: string, provider: ProviderId): number {
  if (!text) return 0
  const key = `${provider}:${hashText(text)}`
  const hit = cache.get(key)
  if (hit !== undefined) return hit
  const n = estimateTokenCount(text, provider)
  if (cache.size >= MAX_CACHE) cache.delete(cache.keys().next().value as string)
  cache.set(key, n)
  return n
}

export interface TokenEstimate {
  prompt: number
  context: number
  output: number
  total: number
}

export function estimateTokens(
  prompt: string,
  context: string,
  estimatedOutput: number,
  provider: ProviderId = 'groq'
): TokenEstimate {
  const p = countTokens(prompt, provider)
  const c = countTokens(context, provider)
  return { prompt: p, context: c, output: estimatedOutput, total: p + c + estimatedOutput }
}

/**
 * Rough per-request ceilings (input + output). Groq's free tier caps tokens per
 * minute at ~6–12k for 70B models and Moonshot's default model has an 8k window,
 * so requests to those get trimmed; the others have far larger windows.
 */
export const PROVIDER_REQUEST_BUDGET: Record<ProviderId, number> = {
  groq: 6000,
  moonshot: 7500,
  gemini: 60000,
  openai: 60000,
  xai: 60000
}
