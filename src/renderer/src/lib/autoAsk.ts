import type { TranscriptSegment } from '@shared/types'
import { useStore } from '../store/useStore'
import { ask } from './copilot'

/**
 * Auto-ask: when the other participant finishes a question, trigger the copilot
 * automatically. Guarded by:
 *  - settings.copilot.mode === 'auto' && triggerOnQuestion
 *  - a debounce so we wait for the question to actually finish
 *  - a cooldown so a rambling speaker doesn't spawn a burst of requests
 *  - de-duplication on identical trailing text
 */
const DEBOUNCE_MS = 700
const COOLDOWN_MS = 6000

let timer: ReturnType<typeof setTimeout> | null = null
let lastAskAt = 0
let lastAskedText = ''
let pendingText = ''

const QUESTION_LEAD =
  /^(what|how|why|when|where|who|which|whose|whom|can|could|would|will|do|does|did|is|are|was|were|should|shall|may|might|have|has|tell me|walk me|explain|describe|give me|any chance|remind me|what's|how's)\b/i

export function looksLikeQuestion(text: string): boolean {
  const t = text.trim()
  if (t.length < 6) return false
  if (t.endsWith('?')) return true
  return QUESTION_LEAD.test(t)
}

/** Feed every transcript segment here; it decides whether to auto-ask. */
export function feedForAutoAsk(seg: TranscriptSegment): void {
  const settings = useStore.getState().settings
  if (!settings) return
  if (settings.copilot.mode !== 'auto' || !settings.copilot.triggerOnQuestion) return
  // Only the counterparty's finalized speech triggers an auto-answer.
  if (seg.speaker !== 'them' || !seg.isFinal) return
  if (!looksLikeQuestion(seg.text)) return

  pendingText = seg.text.trim()
  if (timer) clearTimeout(timer)
  timer = setTimeout(() => {
    timer = null
    const now = Date.now()
    if (now - lastAskAt < COOLDOWN_MS) return
    if (pendingText === lastAskedText) return
    lastAskAt = now
    lastAskedText = pendingText
    void ask(pendingText)
  }, DEBOUNCE_MS)
}

export function resetAutoAsk(): void {
  if (timer) clearTimeout(timer)
  timer = null
  lastAskAt = 0
  lastAskedText = ''
  pendingText = ''
}
