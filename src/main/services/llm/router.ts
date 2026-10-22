import { PROVIDERS, type ProviderId } from '@shared/constants'
import type { ChatMessage } from '@shared/types'
import { getSettings } from '../settings'
import { getSecret } from '../secrets'
import { streamChat, embed } from './client'

/**
 * Routes a completion to the resolved provider, keeping API keys inside the main
 * process. Streaming deltas are pushed through callbacks; the caller (IPC layer)
 * relays them to the renderer. In-flight requests are cancellable by requestId.
 */

const inflight = new Map<string, AbortController>()

export class MissingKeyError extends Error {
  constructor(public provider: ProviderId) {
    super(`No API key configured for ${PROVIDERS[provider].label}`)
    this.name = 'MissingKeyError'
  }
}

export interface RouterCompleteArgs {
  requestId: string
  provider?: ProviderId
  model?: string
  messages: ChatMessage[]
  temperature?: number
  maxTokens?: number
  onDelta: (text: string) => void
}

export async function complete(args: RouterCompleteArgs): Promise<{
  usage?: { promptTokens?: number; completionTokens?: number }
  model: string
}> {
  const settings = getSettings()
  const preferredProvider = args.provider ?? settings.activeProvider
  const controller = new AbortController()
  inflight.set(args.requestId, controller)

  // Build provider chain: preferred first, then fallback order
  const FALLBACK_ORDER: ProviderId[] = ['groq', 'gemini', 'openai', 'xai', 'moonshot']
  const allProviders = [preferredProvider, ...FALLBACK_ORDER.filter(p => p !== preferredProvider)]

  let lastError: Error | null = null

  for (const provider of allProviders) {
    const spec = PROVIDERS[provider]
    const apiKeys = (getSecret(provider) || '')
      .split(',')
      .map(k => k.trim())
      .filter(k => k.length > 0)

    if (!apiKeys.length) continue // Skip if no key

    const model = args.model ?? settings.models[provider] ?? spec.defaultModel

    for (const apiKey of apiKeys) {
      try {
        const { usage } = await streamChat({
          baseUrl: spec.baseUrl,
          apiKey,
          model,
          messages: args.messages,
          temperature: args.temperature,
          maxTokens: args.maxTokens,
          signal: controller.signal,
          onDelta: args.onDelta
        })
        inflight.delete(args.requestId)
        return { usage, model }
      } catch (err) {
        lastError = err as Error
        // If it's a retryable error (rate limit, auth, model not found), try next provider
        const isRetryable = err instanceof Error && (
          err.message.includes('401') ||
          err.message.includes('404') ||
          err.message.includes('429') ||
          err.message.includes('Unauthorized') ||
          err.message.includes('rate limit') ||
          err.message.includes('insufficient_quota') ||
          err.message.includes('no credits') ||
          err.message.includes('not found') ||
          err.message.includes('does not exist')
        )
        if (!isRetryable) throw err
        // If retryable, continue to next key or provider
      }
    }
  }
  inflight.delete(args.requestId)
  throw lastError || new MissingKeyError(preferredProvider)
}

export function cancel(requestId: string): void {
  inflight.get(requestId)?.abort()
  inflight.delete(requestId)
}

/** Parse a stored secret into individual, trimmed keys. Values may hold several
 *  comma-separated keys (addSecret joins them) or stray whitespace/newlines, so
 *  callers must never pass the raw string to a provider as a single key. */
function parseKeys(provider: ProviderId): string[] {
  return (getSecret(provider) || '')
    .split(',')
    .map((k) => k.trim())
    .filter((k) => k.length > 0)
}

/**
 * Embed text, preferring the configured embedding provider but falling through
 * to any other embeddings-capable provider when a request fails. Each stored key
 * is parsed and tried individually — exactly as the chat path does — because the
 * secret may hold several comma-separated keys or whitespace; passing that raw
 * blob as one key is what made Gemini reject a valid credential as "Invalid Auth
 * key." We only throw once every key of every candidate fails, surfacing each
 * provider's real error so the true cause (bad key, quota) stays visible.
 */
export async function embedTexts(input: string[]): Promise<number[][]> {
  const settings = getSettings()
  const preferred = settings.embeddingProvider
  const candidates = [
    preferred,
    ...(Object.keys(PROVIDERS) as ProviderId[]).filter((p) => p !== preferred)
  ].filter((p) => PROVIDERS[p].supportsEmbeddings && parseKeys(p).length > 0)

  if (!candidates.length) throw new Error('No embeddings-capable provider has an API key set.')

  const failures: string[] = []
  for (const provider of candidates) {
    const spec = PROVIDERS[provider]
    for (const apiKey of parseKeys(provider)) {
      try {
        return await embed({
          baseUrl: spec.baseUrl,
          apiKey,
          model: spec.defaultEmbeddingModel!,
          input
        })
      } catch (err) {
        failures.push(`${spec.label}: ${(err as Error)?.message?.slice(0, 160) ?? String(err)}`)
      }
    }
  }
  throw new Error(`All embedding providers failed — ${failures.join(' · ')}`)
}
