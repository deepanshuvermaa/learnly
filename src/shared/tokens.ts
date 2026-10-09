import type { ProviderId } from './constants'

/**
 * Heuristic token estimates, shared so Settings can show a live count without an
 * IPC round-trip. None of the providers ship a tokenizer we can run offline
 * without a native/WASM dependency, so these are ratios calibrated against each
 * vendor's published guidance; provider-reported usage replaces them after a
 * request completes.
 *  - Groq (Llama 3.x): ~4 chars/token on English + code.
 *  - Gemini: Google documents ~4 chars/token; code and punctuation skew lower, so 3.5.
 *  - OpenAI (o200k/cl100k): ~0.75 words/token, i.e. 1.3 tokens per word, floored by chars/4.
 */
const CHARS_PER_TOKEN: Record<ProviderId, number> = {
  groq: 4,
  gemini: 3.5,
  openai: 4,
  xai: 4,
  moonshot: 3.5
}

export function estimateTokenCount(text: string, provider: ProviderId = 'groq'): number {
  if (!text) return 0
  const byChars = Math.ceil(text.length / CHARS_PER_TOKEN[provider])
  if (provider !== 'openai') return byChars
  const words = text.trim().split(/\s+/).filter(Boolean).length
  return Math.max(byChars, Math.ceil(words * 1.3))
}
