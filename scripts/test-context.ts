import assert from 'node:assert/strict'
import { buildContextBundle } from '../src/main/services/rag/context'
import type { RagChunk, TranscriptSegment } from '@shared/types'

const transcript: TranscriptSegment[] = [
  { id: '1', speaker: 'them', text: 'We need the launch plan by Friday.', isFinal: true, startMs: 0, endMs: 1000 },
  { id: '2', speaker: 'me', text: 'I will send the first draft tomorrow.', isFinal: true, startMs: 1000, endMs: 2000 },
  { id: '3', speaker: 'them', text: 'interim correction should not appear', isFinal: false, startMs: 2000, endMs: 2200 },
  { id: '4', speaker: 'them', text: 'Please include the risk register.', isFinal: true, startMs: 2200, endMs: 3200 },
]

const chunks: RagChunk[] = [
  { id: 'a', source: 'playbook.md', text: 'The launch checklist includes an owner, deadline, and risk register.', score: 0.95 },
  { id: 'b', source: 'playbook.md', text: 'The launch checklist includes an owner, deadline, and risk register.', score: 0.9 },
  { id: 'c', source: 'notes.md', text: 'Escalate unresolved risks in the weekly review.', score: 0.8 },
]

const bundle = buildContextBundle(transcript, chunks, { maxTurns: 2, maxCitations: 4 })
assert.equal(bundle.citations.length, 2)
assert.ok(bundle.groundedContext.includes('[1]'))
assert.ok(bundle.groundedContext.includes('Please include the risk register.'))
assert.ok(!bundle.groundedContext.includes('interim correction should not appear'))
assert.ok(bundle.summary.includes('I will send the first draft tomorrow.'))
assert.equal(bundle.citations[0].source, 'playbook.md')
console.log(JSON.stringify({ citations: bundle.citations.length, summary: bundle.summary, groundedContext: bundle.groundedContext }, null, 2))
