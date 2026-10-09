import { useEffect, useRef, useState } from 'react'
import { CODEGEN_SCOPES, PROVIDERS } from '@shared/constants'
import type { CodeGenScope, CodeIntent, CodeLanguage } from '@shared/types'
import { useStore } from '../store/useStore'
import { useCodeGen, type CodeGeneration } from '../store/useCodeGen'
import { generate, cancelActive } from '../lib/codegen'
import { CodeDisplay } from './CodeDisplay'
import { HairlineButton } from './ui'

const INTENT_LABEL: Record<CodeIntent, string> = {
  design: 'Design question',
  implement: 'Implementation ask',
  debug: 'Debugging question',
  optimize: 'Performance question',
  explain: 'Concept question',
  'how-to': 'How-to question'
}

/** Prose before the first fence, code after it — so a stream reads right before it's parsed. */
function splitStream(text: string): { explanation: string; code: string; lang?: string } {
  const fence = text.indexOf('```')
  if (fence === -1) return { explanation: text, code: '' }
  const afterTag = text.indexOf('\n', fence)
  const lang = text.slice(fence + 3, afterTag === -1 ? undefined : afterTag).trim()
  const body = afterTag === -1 ? '' : text.slice(afterTag + 1).replace(/```[\s\S]*$/, '')
  return { explanation: text.slice(0, fence).trim(), code: body, lang }
}

/**
 * Floating panel inside the overlay. It only appears when a technical question
 * is detected or the hotkey opens it, and it lives in the overlay window — so
 * when screen-share hiding is on it's excluded from capture along with the rest.
 * Dragging is clamped to the window so it can't get lost off-screen.
 */
export function CodeSuggestionPanel() {
  const settings = useStore((s) => s.settings)
  const { panelOpen, suggestion, draftQuestion, setDraft, generations, viewIndex, setView, closePanel } = useCodeGen()
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null)
  const panelRef = useRef<HTMLDivElement>(null)

  if (!settings?.codeGen.enabled || !panelOpen) return null

  const current: CodeGeneration | undefined = generations[viewIndex]
  const busy = generations[0]?.streaming
  const recommended = suggestion?.recommendedScope ?? settings.codeGen.defaultScope

  const onDragStart = (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest('button')) return
    const rect = panelRef.current!.getBoundingClientRect()
    const dx = e.clientX - rect.left
    const dy = e.clientY - rect.top
    const move = (ev: PointerEvent) => {
      const maxX = window.innerWidth - Math.min(rect.width, 120)
      const maxY = window.innerHeight - 48
      setPos({
        x: Math.max(0, Math.min(maxX, ev.clientX - dx)),
        y: Math.max(0, Math.min(maxY, ev.clientY - dy))
      })
    }
    const up = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  return (
    <div
      ref={panelRef}
      className="no-drag"
      style={{
        position: 'fixed',
        ...(pos ? { left: pos.x, top: pos.y } : { right: 10, bottom: 40 }),
        width: 'min(420px, calc(100vw - 20px))',
        maxHeight: 'calc(100vh - 60px)',
        display: 'flex',
        flexDirection: 'column',
        background: 'linear-gradient(180deg, rgba(26,26,30,0.97), rgba(12,12,14,0.98))',
        border: 'var(--hairline-soft)',
        borderRadius: 'var(--radius-cards)',
        boxShadow: '0 18px 48px rgba(0,0,0,0.55)',
        zIndex: 20,
        animation: 'listenly-fade-up 180ms ease'
      }}
    >
      {/* Header / drag handle */}
      <div
        onPointerDown={onDragStart}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '12px 12px 10px 16px',
          borderBottom: 'var(--hairline-soft)',
          cursor: 'grab',
          flexShrink: 0
        }}
      >
        <span style={{ width: 7, height: 7, borderRadius: 9999, background: 'var(--color-dusk-violet)' }} />
        <span style={{ fontSize: 12.5, color: 'var(--color-ash)', fontWeight: 500 }}>
          {suggestion ? INTENT_LABEL[suggestion.intent] : 'Code'}
        </span>
        {suggestion && (
          <span style={{ fontSize: 11, color: 'var(--color-slate)' }}>{Math.round(suggestion.confidence * 100)}%</span>
        )}
        <div style={{ flex: 1 }} />
        {generations.length > 1 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11.5, color: 'var(--color-slate)' }}>
            <SmallButton title="Newer" disabled={viewIndex === 0} onClick={() => setView(viewIndex - 1)}>
              ‹
            </SmallButton>
            {viewIndex + 1}/{generations.length}
            <SmallButton
              title="Older"
              disabled={viewIndex >= generations.length - 1}
              onClick={() => setView(viewIndex + 1)}
            >
              ›
            </SmallButton>
          </div>
        )}
        <SmallButton title="Dismiss" onClick={closePanel}>
          ×
        </SmallButton>
      </div>

      <div style={{ overflowY: 'auto', padding: '12px 16px 14px', minHeight: 0 }}>
        <textarea
          value={draftQuestion}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="The question to answer…"
          rows={2}
          spellCheck={false}
          style={{
            width: '100%',
            background: 'rgba(0,0,0,0.25)',
            border: '1px solid var(--color-hairline)',
            borderRadius: 'var(--radius-ui)',
            padding: '8px 10px',
            fontSize: 13.5,
            lineHeight: 1.45,
            color: 'var(--color-bone)',
            outline: 'none',
            resize: 'vertical',
            userSelect: 'text',
            fontFamily: 'var(--font-dm-sans)'
          }}
        />

        <div style={{ display: 'flex', gap: 6, margin: '10px 0 4px' }}>
          {CODEGEN_SCOPES.map((s) => (
            <ScopeButton
              key={s.id}
              label={s.label}
              hint={s.hint}
              recommended={recommended === s.id}
              onClick={() => generate(s.id as CodeGenScope)}
            />
          ))}
        </div>

        {current && <GenerationView g={current} busy={!!busy && viewIndex === 0} />}
      </div>
    </div>
  )
}

function GenerationView({ g, busy }: { g: CodeGeneration; busy: boolean }) {
  const settings = useStore((s) => s.settings)
  const live = splitStream(g.stream)
  const explanation = g.result?.explanation ?? live.explanation
  const code = g.result?.code ?? live.code
  const language = (g.result?.language ?? (live.lang as CodeLanguage | undefined) ?? 'typescript') as CodeLanguage
  const providerLabel = g.result
    ? PROVIDERS[g.result.provider].label
    : settings
      ? PROVIDERS[settings.codeGen.provider].label
      : ''

  return (
    <div style={{ marginTop: 10 }}>
      {(g.streaming || g.status) && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--color-slate)', marginBottom: 8 }}>
          <span style={{ flex: 1 }}>{g.status ?? `Generating with ${providerLabel}…`}</span>
          {busy && <HairlineButton onClick={cancelActive}>Cancel</HairlineButton>}
        </div>
      )}
      {g.error && <div style={{ color: '#d3a3a3', fontSize: 13, marginBottom: 8 }}>{g.error}</div>}

      {explanation && (
        <div
          style={{
            fontSize: 14,
            lineHeight: 1.55,
            color: 'var(--color-bone)',
            whiteSpace: 'pre-wrap',
            userSelect: 'text',
            padding: '10px 12px',
            marginBottom: 10,
            borderLeft: '2px solid var(--color-dusk-violet)',
            background: 'rgba(107,98,242,0.07)',
            borderRadius: 10
          }}
        >
          {explanation}
        </div>
      )}

      {code && <CodeDisplay code={code} language={language} streaming={g.streaming} fileName={fileNameFor(g.question)} />}

      {g.result && (
        <div style={{ fontSize: 11.5, color: 'var(--color-slate)', marginTop: 8 }}>
          Generated in {(g.result.timeMs / 1000).toFixed(1)}s · {g.result.tokensEstimated ? '~' : ''}
          {g.result.tokensUsed.toLocaleString()} tokens · {providerLabel} · {g.result.model}
        </div>
      )}
    </div>
  )
}

/** A few meaningful words from the question, e.g. "reverse-linked-list". */
function fileNameFor(question: string): string {
  const stop = new Set(['how', 'do', 'we', 'you', 'can', 'the', 'a', 'an', 'to', 'for', 'of', 'in', 'is', 'would', 'should', 'what', 'write', 'implement'])
  const words = question
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, ' ')
    .split(/\s+/)
    .filter((w) => w && !stop.has(w))
  return words.slice(0, 4).join('-') || 'snippet'
}

function ScopeButton({
  label,
  hint,
  recommended,
  onClick
}: {
  label: string
  hint: string
  recommended: boolean
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      title={hint}
      style={{
        flex: 1,
        padding: '8px 6px',
        borderRadius: 'var(--radius-ui)',
        border: recommended ? '1px solid rgba(107,98,242,0.7)' : '1px solid var(--color-hairline)',
        background: recommended ? 'rgba(107,98,242,0.14)' : 'transparent',
        color: 'var(--color-bone)',
        fontSize: 12.5,
        fontWeight: 500,
        lineHeight: 1.25
      }}
    >
      {label}
      <div style={{ fontSize: 10.5, color: 'var(--color-slate)', fontWeight: 400, marginTop: 2 }}>{hint}</div>
    </button>
  )
}

function SmallButton({
  children,
  onClick,
  title,
  disabled
}: {
  children: React.ReactNode
  onClick: () => void
  title: string
  disabled?: boolean
}) {
  return (
    <button
      title={title}
      onClick={onClick}
      disabled={disabled}
      style={{
        width: 24,
        height: 24,
        display: 'grid',
        placeItems: 'center',
        borderRadius: 8,
        border: '1px solid var(--color-hairline)',
        background: 'transparent',
        color: 'var(--color-ash)',
        fontSize: 14,
        opacity: disabled ? 0.35 : 1
      }}
    >
      {children}
    </button>
  )
}

/** Generation-complete / fallback / error notices. Click to bring the panel back. */
export function CodeToast() {
  const { toast, dismissToast, openPanel } = useCodeGen()
  const enabled = useStore((s) => s.settings?.codeGen.enabled)

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(dismissToast, 5000)
    return () => clearTimeout(t)
  }, [toast, dismissToast])

  if (!toast || !enabled) return null
  const color = toast.tone === 'error' ? '#d3a3a3' : toast.tone === 'warn' ? '#d9c08f' : 'var(--color-bone)'
  return (
    <button
      className="no-drag"
      onClick={() => {
        openPanel()
        dismissToast()
      }}
      style={{
        position: 'fixed',
        top: 62,
        left: '50%',
        transform: 'translateX(-50%)',
        maxWidth: 'calc(100vw - 40px)',
        padding: '8px 14px',
        borderRadius: 'var(--radius-buttons)',
        border: 'var(--hairline-soft)',
        background: 'rgba(22,22,26,0.96)',
        color,
        fontSize: 12.5,
        zIndex: 30,
        boxShadow: '0 8px 24px rgba(0,0,0,0.45)',
        animation: 'listenly-fade-up 160ms ease'
      }}
    >
      {toast.message}
    </button>
  )
}
