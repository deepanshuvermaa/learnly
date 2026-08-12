import type { ChatMessage, CopilotExample, RagChunk, TranscriptSegment } from '@shared/types'

/**
 * Assembles the model input from four ingredients: the user's persona/instructions,
 * a grounding directive (how strictly to stay on the provided context), optional
 * few-shot examples that shape tone/format, and a compact rendering of the
 * retrieved knowledge + recent transcript. Kept small so first-token latency stays
 * low.
 */
export function buildMessages(args: {
  systemPrompt: string
  groundingMode: 'strict' | 'balanced'
  refusalText: string
  examples: CopilotExample[]
  transcript: TranscriptSegment[]
  context: RagChunk[]
  explicitQuestion?: string
}): ChatMessage[] {
  const { systemPrompt, groundingMode, refusalText, examples, transcript, context, explicitQuestion } = args

  const grounding =
    groundingMode === 'strict'
      ? [
          '## Grounding (strict)',
          "Answer ONLY using the knowledge base excerpts and the live transcript below.",
          'Do not use outside/general knowledge. Do not speculate or fill gaps.',
          `If the answer is not clearly present in that material, reply exactly: "${refusalText}"`,
          context.length === 0
            ? 'Note: no knowledge base excerpts were retrieved for this question — rely only on the transcript, and refuse if it is not there.'
            : '',
          'Stay strictly on the topic of this meeting.'
        ]
          .filter(Boolean)
          .join('\n')
      : [
          '## Grounding (balanced)',
          'Prefer the knowledge base excerpts and the transcript. If they do not contain',
          'the answer, you may use general knowledge but clearly mark it as "not from your notes".',
          'Never invent figures, dates, names, or commitments. Stay on the topic of this meeting.'
        ].join('\n')

  const contextBlock = context.length
    ? context.map((c, i) => `[${i + 1}] (source: ${c.source})\n${c.text}`).join('\n\n')
    : '(no relevant notes found in the knowledge base)'

  // Only the tail of the conversation matters for a live answer.
  const recent = transcript.slice(-16)
  const convo = recent
    .map((s) => `${s.speaker === 'me' ? 'Me' : s.speaker === 'them' ? 'Them' : '?'}: ${s.text}`)
    .join('\n')

  const task = explicitQuestion
    ? `The user pressed "ask now". Answer this specifically: "${explicitQuestion}"`
    : 'Answer the most recent question directed at the user (usually the latest "Them:" line).'

  const messages: ChatMessage[] = [{ role: 'system', content: `${systemPrompt}\n\n${grounding}` }]

  // Few-shot examples as alternating turns — the strongest lever on tone/format.
  for (const ex of examples.slice(0, 6)) {
    if (!ex.question.trim() || !ex.answer.trim()) continue
    messages.push({ role: 'user', content: `Example question:\n${ex.question.trim()}` })
    messages.push({ role: 'assistant', content: ex.answer.trim() })
  }

  messages.push({
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
  })

  return messages
}
