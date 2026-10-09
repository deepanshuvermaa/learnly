import type { RagChunk, TranscriptSegment } from '@shared/types'

export interface Citation {
  index: number
  source: string
  quote: string
  chunkId: string
}

export interface ContextBundle {
  summary: string
  recentTranscript: string
  citations: Citation[]
  groundedContext: string
}

function clean(text: string): string {
  return text.replace(/\s+/g, ' ').trim()
}

export function summarizeTranscript(transcript: TranscriptSegment[], maxTurns = 8): string {
  const finalized = transcript.filter((segment) => segment.isFinal && segment.text.trim()).slice(-maxTurns)
  if (!finalized.length) return 'No finalized conversation yet.'
  return finalized.map((segment) => `${segment.speaker === 'me' ? 'Me' : segment.speaker === 'them' ? 'Them' : 'Unknown'}: ${clean(segment.text)}`).join(' | ')
}

export function formatRecentTranscript(transcript: TranscriptSegment[], maxTurns = 12): string {
  const finalized = transcript.filter((segment) => segment.isFinal && segment.text.trim()).slice(-maxTurns)
  return finalized.length
    ? finalized.map((segment) => `${segment.speaker === 'me' ? 'Me' : segment.speaker === 'them' ? 'Them' : 'Unknown'}: ${clean(segment.text)}`).join('\n')
    : '(no finalized transcript yet)'
}

export function buildCitations(chunks: RagChunk[], maxCitations = 6): Citation[] {
  const seen = new Set<string>()
  const citations: Citation[] = []
  for (const chunk of chunks) {
    const quote = clean(chunk.text)
    const key = `${chunk.source}\n${quote}`
    if (!quote || seen.has(key)) continue
    seen.add(key)
    citations.push({ index: citations.length + 1, source: chunk.source, quote, chunkId: chunk.id })
    if (citations.length >= maxCitations) break
  }
  return citations
}

export function buildContextBundle(transcript: TranscriptSegment[], chunks: RagChunk[], options?: { maxTurns?: number; maxCitations?: number }): ContextBundle {
  const summary = summarizeTranscript(transcript, options?.maxTurns ?? 8)
  const recentTranscript = formatRecentTranscript(transcript, options?.maxTurns ?? 12)
  const citations = buildCitations(chunks, options?.maxCitations ?? 6)
  const sources = citations.length
    ? citations.map((citation) => `[${citation.index}] ${citation.quote} (source: ${citation.source})`).join('\n')
    : '(no knowledge-base excerpts retrieved)'
  return {
    summary,
    recentTranscript,
    citations,
    groundedContext: [`## Session summary\n${summary}`, `## Recent transcript\n${recentTranscript}`, `## Knowledge-base excerpts\n${sources}`].join('\n\n'),
  }
}
