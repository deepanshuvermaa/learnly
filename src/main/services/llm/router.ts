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

/** Embed text using the configured embedding provider (must be embeddings-capable). */
export async function embedTexts(input: string[]): Promise<number[][]> {
  const settings = getSettings()
  let provider = settings.embeddingProvider
  let spec = PROVIDERS[provider]
  // Fall back to any embeddings-capable provider that actually has a key.
  if (!spec.supportsEmbeddings || !getSecret(provider)) {
    const alt = (Object.keys(PROVIDERS) as ProviderId[]).find(
      (id) => PROVIDERS[id].supportsEmbeddings && getSecret(id)
    )
    if (!alt) throw new Error('No embeddings-capable provider has an API key set.')
    provider = alt
    spec = PROVIDERS[alt]
  }
  const apiKey = getSecret(provider)!
  return embed({
    baseUrl: spec.baseUrl,
    apiKey,
    model: spec.defaultEmbeddingModel!,
    input
  })
}
