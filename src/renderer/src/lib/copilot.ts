import { useStore } from '../store/useStore'
import { uid } from './uid'

/**
 * The ask flow: snapshot the transcript, ask main to retrieve context + assemble
 * messages, then stream the model answer into the suggestion card. Streaming
 * chunks arrive via window.listenly.llm.onChunk (wired once in App).
 */
let unsubChunk: (() => void) | null = null
let unsubDone: (() => void) | null = null
let unsubError: (() => void) | null = null

// Maps an in-flight LLM requestId to the suggestion card it feeds.
const requestToSuggestion = new Map<string, string>()

// The single in-flight answer. A new ask supersedes it so essays never stack.
let activeRequestId: string | null = null

export function wireStreaming(): void {
  const st = useStore.getState()
  unsubChunk?.()
  unsubDone?.()
  unsubError?.()
  unsubChunk = window.listenly.llm.onChunk(({ requestId, delta }) => {
    const sid = requestToSuggestion.get(requestId)
    if (sid) st.appendSuggestion(sid, delta)
  })
  unsubDone = window.listenly.llm.onDone(({ requestId }) => {
    const sid = requestToSuggestion.get(requestId)
    if (sid) useStore.getState().finishSuggestion(sid)
    requestToSuggestion.delete(requestId)
    if (requestId === activeRequestId) activeRequestId = null
  })
  unsubError = window.listenly.llm.onError(({ requestId, message }) => {
    const sid = requestToSuggestion.get(requestId)
    if (sid) useStore.getState().failSuggestion(sid, message)
    requestToSuggestion.delete(requestId)
    if (requestId === activeRequestId) activeRequestId = null
  })
}

export async function ask(explicitQuestion?: string): Promise<void> {
  const st = useStore.getState()
  const transcript = st.transcriptForModel()
  if (!transcript.length && !explicitQuestion) return

  // Supersede any answer still streaming — cancel it and close its card.
  if (activeRequestId) {
    window.listenly.llm.cancel(activeRequestId)
    const prevSid = requestToSuggestion.get(activeRequestId)
    if (prevSid) useStore.getState().finishSuggestion(prevSid)
    requestToSuggestion.delete(activeRequestId)
    activeRequestId = null
  }

  const { messages, context } = await window.listenly.copilot.prepare({ transcript, explicitQuestion })
  // Answer the interviewer's most recent COMPLETED turn (final 'them'), falling
  // back to an in-progress 'them' line, then the last line.
  const question =
    explicitQuestion ??
    [...transcript].reverse().find((s) => s.speaker === 'them' && s.isFinal)?.text ??
    [...transcript].reverse().find((s) => s.speaker === 'them')?.text ??
    transcript.slice(-1)[0]?.text ??
    'Latest question'

  const suggestionId = st.startSuggestion(question, context)
  const requestId = uid('req')
  activeRequestId = requestId
  requestToSuggestion.set(requestId, suggestionId)

  await window.listenly.llm.complete({ requestId, messages, temperature: 0.3, maxTokens: 600 })
}
