import type { ChatMessage, RagChunk, TranscriptSegment } from '@shared/types'

/**
 * Assembles the model input from three ingredients: the system persona, the
 * retrieved knowledge-base context, and a compact rendering of the recent
 * transcript. Kept deliberately small so first-token latency stays low.
 */
export function buildMessages(args: {
  systemPrompt: string
  transcript: TranscriptSegment[]
  context: RagChunk[]
  explicitQuestion?: string
}): ChatMessage[] {
  const { systemPrompt, transcript, context, explicitQuestion } = args

  const contextBlock = context.length
    ? context
        .map((c, i) => `[${i + 1}] (source: ${c.source})\n${c.text}`)
        .join('\n\n')
    : '(no relevant notes found in the knowledge base)'

  // Only the tail of the conversation matters for a live answer.
  const recent = transcript.slice(-16)
  const convo = recent
    .map((s) => `${s.speaker === 'me' ? 'Me' : s.speaker === 'them' ? 'Them' : '?'}: ${s.text}`)
    .join('\n')

  const task = explicitQuestion
    ? `The user pressed "ask now". Answer this specifically: "${explicitQuestion}"`
    : 'Answer the most recent question directed at the user (usually the latest "Them:" line).'

  return [
    { role: 'system', content: systemPrompt },
    {
      role: 'user',
      content: [
        '## Knowledge base excerpts',
        contextBlock,
        '',
        '## Live transcript (most recent last)',
        convo || '(no transcript yet)',
        '',
        '## Task',
        task
      ].join('\n')
    }
  ]
}
