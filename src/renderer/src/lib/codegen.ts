import type { CodeGenScope } from '@shared/types'
import { useStore } from '../store/useStore'
import { useCodeGen } from '../store/useCodeGen'
import { uid } from './uid'
import { rlog } from './log'

/**
 * Renderer side of code generation: relays main-process events into the
 * code-gen store and owns the single in-flight request (a new one supersedes
 * the old, same as the copilot's ask flow).
 */
let activeRequestId: string | null = null

const enabled = () => Boolean(useStore.getState().settings?.codeGen.enabled)

/** The other side's most recent completed turn — the default thing to answer. */
export function latestQuestion(): string {
  const transcript = useStore.getState().transcriptForModel()
  return (
    [...transcript].reverse().find((s) => s.speaker === 'them' && s.isFinal)?.text ??
    [...transcript].reverse().find((s) => s.speaker === 'them')?.text ??
    ''
  )
}

export function togglePanel(): void {
  if (!enabled()) return
  const st = useCodeGen.getState()
  if (st.panelOpen) st.closePanel()
  else st.openPanel(st.draftQuestion || latestQuestion())
}

export async function generate(scope: CodeGenScope): Promise<void> {
  const cg = useCodeGen.getState()
  const question = cg.draftQuestion.trim() || latestQuestion()
  if (!question) {
    cg.showToast('No question yet. Type one or wait for the conversation.', 'warn')
    return
  }
  cancelActive()

  const requestId = uid('code')
  activeRequestId = requestId
  cg.start({ requestId, scope, question })
  try {
    await window.listenly.codegen.generate({
      requestId,
      scope,
      question,
      transcript: useStore.getState().transcriptForModel()
    })
  } catch (err: any) {
    rlog.error('codegen', 'generate invoke failed', err)
    useCodeGen.getState().fail(requestId, err?.message ?? String(err))
  }
}

export function cancelActive(): void {
  if (!activeRequestId) return
  window.listenly.codegen.cancel(activeRequestId)
  useCodeGen.getState().fail(activeRequestId, 'Cancelled')
  activeRequestId = null
}

export function wireCodeGen(): () => void {
  const offs = [
    window.listenly.codegen.onChunk(({ requestId, delta }) => useCodeGen.getState().append(requestId, delta)),
    window.listenly.codegen.onStatus(({ requestId, message, reset }) => {
      const st = useCodeGen.getState()
      st.setStatus(requestId, message, reset)
      st.showToast(message, 'warn')
    }),
    window.listenly.codegen.onDone((result) => {
      const st = useCodeGen.getState()
      st.finish(result)
      if (result.requestId === activeRequestId) activeRequestId = null
      const tokens = `${result.tokensEstimated ? '~' : ''}${result.tokensUsed.toLocaleString()} tokens`
      st.showToast(`✓ Code generated in ${(result.timeMs / 1000).toFixed(1)}s (${tokens})`)
    }),
    window.listenly.codegen.onError(({ requestId, message, cancelled }) => {
      if (requestId === activeRequestId) activeRequestId = null
      if (cancelled) return // cancelActive already marked it
      const st = useCodeGen.getState()
      st.fail(requestId, message)
      st.showToast(message, 'error')
    }),
    window.listenly.codegen.onSuggestion((s) => {
      if (!enabled()) return
      const st = useCodeGen.getState()
      st.setSuggestion(s)
      // Don't swap the question out from under a request that's still running.
      const busy = st.generations[0]?.streaming
      st.openPanel(busy ? undefined : s.question)
    }),
    window.listenly.shortcuts.onToggleCodePanel(() => togglePanel())
  ]
  return () => offs.forEach((off) => off())
}
