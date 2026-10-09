import type { TranscriptSegment } from '@shared/types'

/**
 * Turns the raw live transcript into compact context for a code request:
 * finalized turns only, fillers and stutters stripped, consecutive turns from
 * the same speaker merged, and bare acknowledgements ("yeah", "okay") dropped
 * so the token budget goes to what was actually asked.
 */

const FILLERS = /\b(?:u+m+|u+h+|e+r+m+|h+m+|mhm|mm-?hm+)\b[,.]?\s*/gi
const HEDGES = /\b(?:you know|I mean|kind of like|sort of like),?\s+/gi
const REPEATED_WORD = /\b(\w+)(?:[\s,]+\1\b)+/gi
const ACKNOWLEDGEMENT =
  /^(?:yeah|yes|yep|ok(?:ay)?|right|sure|cool|got it|makes sense|sounds good|alright|thanks|thank you|great|perfect|nice)[.!]*$/i

const QUESTION_PATTERN =
  /\?|\b(?:how|why|what|which|design|build|implement|fix|debug|write|create|optimi[sz]e)\b/i

export function cleanUtterance(text: string): string {
  return text
    .replace(FILLERS, '')
    .replace(HEDGES, '')
    .replace(REPEATED_WORD, '$1')
    .replace(/\s+([,.?!])/g, '$1')
    .replace(/\s+/g, ' ')
    .trim()
}

export function isQuestionLike(text: string): boolean {
  return QUESTION_PATTERN.test(text)
}

function speakerLabel(speaker: TranscriptSegment['speaker']): string {
  return speaker === 'me' ? 'Me' : speaker === 'them' ? 'Them' : 'Unknown'
}

export function getRelevantContext(transcript: TranscriptSegment[], lastNTurns = 10): string {
  const turns: { speaker: TranscriptSegment['speaker']; text: string }[] = []
  for (const seg of transcript) {
    if (!seg.isFinal) continue
    const text = cleanUtterance(seg.text)
    if (!text || ACKNOWLEDGEMENT.test(text)) continue
    const prev = turns[turns.length - 1]
    if (prev && prev.speaker === seg.speaker) prev.text = `${prev.text} ${text}`
    else turns.push({ speaker: seg.speaker, text })
  }
  return turns
    .slice(-lastNTurns)
    .map((t) => `[${speakerLabel(t.speaker)}]: ${t.text}`)
    .join('\n')
}
