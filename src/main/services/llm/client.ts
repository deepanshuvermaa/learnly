import type { ChatMessage } from '@shared/types'

/**
 * Minimal OpenAI-compatible client built on fetch + SSE. Every provider in the
 * registry (OpenAI, xAI Grok, Moonshot Kimi, and Gemini via its compat endpoint)
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

export interface StreamResult {
  usage?: { promptTokens?: number; completionTokens?: number }
}

export async function streamChat(opts: StreamOptions): Promise<StreamResult> {
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
    throw new Error(`LLM HTTP ${res.status}: ${body.slice(0, 500)}`)
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
      if (data === '[DONE]') return { usage }
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
