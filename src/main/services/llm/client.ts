import type { ChatMessage } from '@shared/types'

/**
 * Minimal OpenAI-compatible client built on fetch + SSE. Every provider in the
 * registry (OpenAI, Groq, Moonshot Kimi, and Gemini via its compat endpoint)
 * accepts this exact wire format, so we deliberately avoid per-vendor SDKs.
 */

export interface StreamOptions {
  baseUrl: string
  apiKey: string
  model: string
  messages: ChatMessage[]
  temperature?: number
  maxTokens?: number
  signal?: AbortSignal
  onDelta: (text: string) => void
}

/** Non-2xx from a provider. Carries the status so callers can tell a rate limit from a bad key. */
export class LlmHttpError extends Error {
  constructor(
    public status: number,
    body: string,
    public retryAfterSec?: number
  ) {
    super(`LLM HTTP ${status}: ${body.slice(0, 500)}`)
    this.name = 'LlmHttpError'
  }
}

/** Retry-After header, else the "try again in 7.5s" hint Groq/OpenAI put in 429 bodies. */
function parseRetryAfter(res: Response, body: string): number | undefined {
  const header = res.headers.get('retry-after')
  if (header && !Number.isNaN(Number(header))) return Number(header)
  const m = body.match(/try again in (?:(\d+)m)?(\d+(?:\.\d+)?)s/i)
  if (m) return Number(m[1] ?? 0) * 60 + Number(m[2])
  return undefined
}

export interface StreamResult {
  usage?: { promptTokens?: number; completionTokens?: number }
}

export async function streamChat(opts: StreamOptions): Promise<StreamResult> {
  const startTime = Date.now()
  const startMemory = process.memoryUsage().heapUsed

  const res = await fetch(`${opts.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${opts.apiKey}`
    },
    body: JSON.stringify({
      model: opts.model,
      messages: opts.messages,
      temperature: opts.temperature ?? 0.3,
      max_tokens: opts.maxTokens,
      stream: true,
      stream_options: { include_usage: true }
    }),
    signal: opts.signal
  })

  if (!res.ok || !res.body) {
    const body = await res.text().catch(() => '')
    const durationMs = Date.now() - startTime

    // Record failure metrics
    const { perfMonitor, metricsCollector } = await import('../performanceMonitor').then(m => ({
      perfMonitor: m.perfMonitor,
      metricsCollector: require('../metricsCollector').metricsCollector
    }))

    perfMonitor.recordOperation({
      name: 'llm:stream',
      durationMs,
      timestamp: startTime,
      tags: { model: opts.model, status: res.status },
      success: false,
      errorMessage: `HTTP ${res.status}`
    })

    metricsCollector.recordLLMAttempt(0, durationMs, false, opts.model)

    throw new LlmHttpError(res.status, body, res.status === 429 ? parseRetryAfter(res, body) : undefined)
  }

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let usage: StreamResult['usage']

  // Parse Server-Sent Events: lines beginning with "data: ", terminated by \n\n.
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })

    let idx: number
    while ((idx = buffer.indexOf('\n')) !== -1) {
      const line = buffer.slice(0, idx).trim()
      buffer = buffer.slice(idx + 1)
      if (!line.startsWith('data:')) continue
      const data = line.slice(5).trim()
      if (data === '[DONE]') {
        // Record success metrics
        const durationMs = Date.now() - startTime
        const totalTokens = (usage?.promptTokens ?? 0) + (usage?.completionTokens ?? 0)
        const memoryUsedMb = Math.round((process.memoryUsage().heapUsed - startMemory) / 1024 / 1024)

        const { perfMonitor: pm, metricsCollector: mc } = await import('../performanceMonitor').then(m => ({
          perfMonitor: m.perfMonitor,
          metricsCollector: require('../metricsCollector').metricsCollector
        }))

        pm.recordOperation({
          name: 'llm:stream',
          durationMs,
          timestamp: startTime,
          tags: { model: opts.model, tokens: totalTokens, memoryMb: memoryUsedMb },
          success: true
        })

        pm.recordLLMMetric(opts.model, totalTokens, durationMs, true)
        mc.recordLLMAttempt(totalTokens, durationMs, true, opts.model)

        return { usage }
      }
      try {
        const json = JSON.parse(data)
        const delta: string | undefined = json.choices?.[0]?.delta?.content
        if (delta) opts.onDelta(delta)
        if (json.usage) {
          usage = {
            promptTokens: json.usage.prompt_tokens,
            completionTokens: json.usage.completion_tokens
          }
        }
      } catch {
        // Ignore keep-alive comments / partial frames; the buffer loop retries.
      }
    }
  }

  // Fallback if stream ended without [DONE]
  const durationMs = Date.now() - startTime
  const totalTokens = (usage?.promptTokens ?? 0) + (usage?.completionTokens ?? 0)

  const { perfMonitor: pm, metricsCollector: mc } = await import('../performanceMonitor').then(m => ({
    perfMonitor: m.perfMonitor,
    metricsCollector: require('../metricsCollector').metricsCollector
  }))

  pm.recordOperation({
    name: 'llm:stream',
    durationMs,
    timestamp: startTime,
    tags: { model: opts.model, tokens: totalTokens },
    success: true
  })

  mc.recordLLMAttempt(totalTokens, durationMs, true, opts.model)

  return { usage }
}

export async function embed(opts: {
  baseUrl: string
  apiKey: string
  model: string
  input: string[]
  signal?: AbortSignal
}): Promise<number[][]> {
  const res = await fetch(`${opts.baseUrl}/embeddings`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${opts.apiKey}`
    },
    body: JSON.stringify({ model: opts.model, input: opts.input }),
    signal: opts.signal
  })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`Embeddings HTTP ${res.status}: ${body.slice(0, 500)}`)
  }
  const json = (await res.json()) as { data: { embedding: number[] }[] }
  return json.data.map((d) => d.embedding)
}
