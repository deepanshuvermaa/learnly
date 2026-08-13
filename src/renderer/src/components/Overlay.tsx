import { useEffect, useMemo, useRef, useState } from 'react'
import type { TranscriptSegment } from '@shared/types'
import { useStore, type TimedSegment, type Suggestion } from '../store/useStore'
import { capture } from '../lib/audio/capture'
import { ask } from '../lib/copilot'
import { rlog } from '../lib/log'
import { PillButton, HairlineButton, StatusPill } from './ui'

export function Overlay() {
  const {
    settings,
    setSettings,
    capturing,
    setCapturing,
    sttState,
    sttDetail,
    finals,
    interim,
    suggestions,
    clearTranscript,
    setInteractive,
    interactive
  } = useStore()

  const toggleAuto = async () => {
    if (!settings) return
    const mode = settings.copilot.mode === 'auto' ? 'manual' : 'auto'
    setSettings(await window.listenly.settings.set({ copilot: { ...settings.copilot, mode } }))
  }

  const [micOn, setMicOn] = useState(true)
  const [sysOn, setSysOn] = useState(true)
  const [consentOpen, setConsentOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Click-through toggle via global shortcut.
  useEffect(() => {
    const off = window.listenly.shortcuts.onToggleClickThrough(() => {
      const next = !useStore.getState().interactive
      setInteractive(next)
      window.listenly.overlay.setInteractive(next)
    })
    // Start interactive so the panel is usable on first open.
    setInteractive(true)
    window.listenly.overlay.setInteractive(true)
    return off
  }, [setInteractive])

  const beginCapture = async () => {
    setError(null)
    if (settings?.consent.acknowledgeBeforeCapture) {
      setConsentOpen(true)
      return
    }
    await reallyStart()
  }

  const reallyStart = async () => {
    setConsentOpen(false)
    rlog.info('capture', 'start requested', { micOn, sysOn, engine: settings?.stt.engine })
    try {
      const res = await window.listenly.stt.start()
      if (!res.ok) throw new Error(res.error || 'Failed to start transcription.')
      await capture.start({
        captureMic: micOn,
        captureSystem: sysOn,
        macSystemDeviceId: settings?.stt.macSystemAudioDeviceId || undefined
      })
      setCapturing(true)
      rlog.info('capture', 'started ok')
    } catch (e: any) {
      rlog.error('capture', 'start failed', e)
      setError(e?.message ?? String(e))
      await capture.stop().catch(() => {})
      await window.listenly.stt.stop().catch(() => {})
      setCapturing(false)
    }
  }

  const stopCapture = async () => {
    await capture.stop().catch(() => {})
    await window.listenly.stt.stop().catch(() => {})
    setCapturing(false)
  }

  const scrollRef = useRef<HTMLDivElement>(null)

  // The current answer is pinned separately (below) so it stays readable while
  // the transcript keeps scrolling. The scrolling history therefore shows the
  // conversation plus any PREVIOUS answers — never the pinned latest one.
  const latestAnswer: Suggestion | undefined = suggestions[0]

  const timeline = useMemo(() => {
    const norm = (t: string) => t.toLowerCase().replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim()
    const kept: TimedSegment[] = []
    for (const seg of finals.slice(-80)) {
      const n = norm(seg.text)
      const dup = kept.some((k) => norm(k.text) === n && Math.abs(k.at - seg.at) < 5000)
      if (!dup) kept.push(seg)
    }
    const items = [
      ...kept.map((f) => ({ kind: 'seg' as const, at: f.at, key: f.id, seg: f })),
      // exclude suggestions[0] — it's pinned above, not in the scroll history
      ...suggestions.slice(1).map((s) => ({ kind: 'sug' as const, at: s.at, key: s.id, sug: s }))
    ].sort((a, b) => a.at - b.at)
    return items
  }, [finals, suggestions])

  const liveInterim = [interim.them, interim.me].filter(Boolean) as TranscriptSegment[]

  // Keep the newest content in view (chat-style, newest at the bottom).
  useEffect(() => {
    const el = scrollRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [timeline, suggestions, liveInterim.length])

  const stateTone = sttState === 'live' ? 'live' : sttState === 'error' ? 'error' : 'idle'

  return (
    <div
      style={{
        height: '100vh',
        display: 'flex',
        flexDirection: 'column',
        background: 'linear-gradient(180deg, rgba(22,22,22,0.92), rgba(10,10,10,0.94))',
        border: 'var(--hairline-soft)',
        borderRadius: 'var(--radius-panels)',
        backdropFilter: 'blur(30px)',
        WebkitBackdropFilter: 'blur(30px)',
        overflow: 'hidden',
        boxShadow: 'var(--elevation-nav)'
      }}
    >
      {/* Header / drag handle */}
      <div
        className="drag"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '14px 18px',
          borderBottom: 'var(--hairline-soft)'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Wordmark />
          <span style={{ fontFamily: 'var(--font-geist)', fontSize: 15, fontWeight: 500, letterSpacing: '-0.01em' }}>
            Listenly
          </span>
        </div>
        <div className="no-drag" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <StatusPill tone={stateTone as any}>
            {sttState === 'live' ? 'Listening' : sttState === 'connecting' ? 'Connecting' : capturing ? 'Starting' : 'Idle'}
          </StatusPill>
          <IconButton title="Settings" onClick={() => window.listenly.overlay.openSettings()}>
            <GearIcon />
          </IconButton>
        </div>
      </div>

      {/* Controls */}
      <div
        className="no-drag"
        style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '12px 16px', flexWrap: 'wrap' }}
      >
        {capturing ? (
          <PillButton variant="ghost" onClick={stopCapture}>
            Stop
          </PillButton>
        ) : (
          <PillButton onClick={beginCapture}>Start listening</PillButton>
        )}
        <PillButton variant="ghost" onClick={() => ask()}>
          Ask now
        </PillButton>
        <HairlineButton active={settings?.copilot.mode === 'auto'} onClick={toggleAuto}>
          {settings?.copilot.mode === 'auto' ? 'Auto ✓' : 'Auto'}
        </HairlineButton>
        <HairlineButton active={micOn} onClick={() => setMicOn((v) => !v)}>
          Mic
        </HairlineButton>
        <HairlineButton active={sysOn} onClick={() => setSysOn((v) => !v)}>
          System
        </HairlineButton>
        <div style={{ flex: 1 }} />
        <HairlineButton
          active={!interactive}
          onClick={() => {
            const next = !interactive
            setInteractive(next)
            window.listenly.overlay.setInteractive(next)
          }}
        >
          {interactive ? 'Click-through: off' : 'Click-through: on'}
        </HairlineButton>
      </div>

      {error && (
        <div style={{ padding: '0 16px 8px', color: '#d3a3a3', fontSize: 13 }}>{error}</div>
      )}
      {sttState === 'error' && sttDetail && (
        <div style={{ padding: '0 16px 8px', color: '#d3a3a3', fontSize: 13 }}>{sttDetail}</div>
      )}

      {/* Body: pinned current answer (stays put) + scrolling transcript below */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
        {latestAnswer && (
          <div style={{ padding: '10px 16px 0', flexShrink: 0 }}>
            <div style={{ maxHeight: '42vh', overflowY: 'auto' }} className="no-drag">
              <AnswerCard s={latestAnswer} pinned />
            </div>
          </div>
        )}

        <div ref={scrollRef} style={{ flex: 1, overflowY: 'auto', padding: '8px 16px 16px', minHeight: 0 }} className="no-drag">
          {timeline.length === 0 && liveInterim.length === 0 && !latestAnswer ? (
            <EmptyState />
          ) : (
            <>
              {(timeline.length > 0 || latestAnswer) && (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <span style={{ fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--color-slate)' }}>
                    Conversation
                  </span>
                  <button
                    onClick={clearTranscript}
                    style={{ background: 'none', border: 'none', color: 'var(--color-slate)', fontSize: 12 }}
                  >
                    Clear
                  </button>
                </div>
              )}
              {timeline.map((item) =>
                item.kind === 'seg' ? (
                  <TranscriptLine key={item.key} speaker={item.seg.speaker} text={item.seg.text} dim={false} />
                ) : (
                  <AnswerCard key={item.key} s={item.sug} />
                )
              )}
              {liveInterim.map((seg) => (
                <TranscriptLine key={seg.id} speaker={seg.speaker} text={seg.text} dim />
              ))}
            </>
          )}
        </div>
      </div>

      {/* Footer: honest reminder of what content protection does */}
      <div
        style={{
          padding: '10px 16px',
          borderTop: 'var(--hairline-soft)',
          fontSize: 11.5,
          color: 'var(--color-slate)',
          display: 'flex',
          alignItems: 'center',
          gap: 8
        }}
      >
        <ShieldIcon />
        {settings?.overlay.contentProtection
          ? 'Hidden from your screen share · visible to you only'
          : 'Screen-share hiding is OFF'}
      </div>

      {consentOpen && (
        <ConsentGate onCancel={() => setConsentOpen(false)} onConfirm={reallyStart} />
      )}
    </div>
  )
}

function AnswerCard({ s, pinned }: { s: Suggestion; pinned?: boolean }) {
  return (
    <div
      style={{
        background: pinned ? 'rgba(107,98,242,0.08)' : 'var(--surface-frosted)',
        borderRadius: 'var(--radius-cards)',
        // Distinct left accent so an answer is unmistakably the copilot's reply,
        // not something a speaker said.
        border: 'var(--hairline-soft)',
        borderLeftWidth: pinned ? 3 : 2,
        borderLeftColor: 'var(--color-dusk-violet)',
        padding: 14,
        margin: pinned ? 0 : '8px 0 14px',
        animation: 'listenly-fade-up 200ms ease'
      }}
    >
      <div
        style={{
          fontSize: 10.5,
          letterSpacing: '0.1em',
          textTransform: 'uppercase',
          color: 'var(--color-dusk-violet)',
          marginBottom: 6,
          fontWeight: 600
        }}
      >
        {pinned ? 'Current answer' : 'Answer'}
      </div>
      <div style={{ fontSize: 15, lineHeight: 1.55, color: 'var(--color-bone)', whiteSpace: 'pre-wrap', userSelect: 'text' }}>
        {s.answer || (s.streaming ? '…' : '')}
        {s.streaming && <Caret />}
      </div>
      {s.error && <div style={{ marginTop: 8, color: '#d3a3a3', fontSize: 13 }}>{s.error}</div>}
      {s.context.length > 0 && (
        <div style={{ marginTop: 10, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {s.context.slice(0, 4).map((c) => (
            <span
              key={c.id}
              title={c.text.slice(0, 240)}
              style={{
                fontSize: 11,
                color: 'var(--color-smoke)',
                border: '1px solid var(--color-hairline)',
                borderRadius: 9999,
                padding: '3px 9px'
              }}
            >
              {c.source}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

/**
 * Chat-style transcript line. The other person ("Them") is left-aligned and
 * bright; you ("You") are right-aligned and muted — so at a glance you always
 * know who said what, and your own speech never gets mistaken for a question.
 */
function TranscriptLine({ speaker, text, dim }: { speaker: string; text: string; dim: boolean }) {
  const isMe = speaker === 'me'
  const label = isMe ? 'You' : speaker === 'them' ? 'Them' : '?'
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: isMe ? 'flex-end' : 'flex-start',
        marginBottom: 8,
        opacity: dim ? 0.5 : 1
      }}
    >
      <span
        style={{
          fontSize: 10,
          fontWeight: 600,
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          color: isMe ? 'var(--color-slate)' : 'var(--color-ash)',
          marginBottom: 2
        }}
      >
        {label}
      </span>
      <span
        style={{
          maxWidth: '85%',
          fontSize: 13.5,
          lineHeight: 1.45,
          userSelect: 'text',
          padding: '6px 10px',
          borderRadius: 12,
          background: isMe ? 'rgba(212,212,212,0.06)' : 'rgba(107,98,242,0.10)',
          border: '1px solid var(--hairline-soft)',
          color: isMe ? 'var(--color-smoke)' : 'var(--color-bone)'
        }}
      >
        {text}
      </span>
    </div>
  )
}

function ConsentGate({ onCancel, onConfirm }: { onCancel: () => void; onConfirm: () => void }) {
  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        background: 'rgba(10,10,10,0.72)',
        backdropFilter: 'blur(10px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24
      }}
    >
      <div
        style={{
          background: 'var(--color-graphite)',
          border: 'var(--hairline-soft)',
          borderRadius: 'var(--radius-cards)',
          padding: 22,
          maxWidth: 320
        }}
      >
        <h3 style={{ fontSize: 18, marginBottom: 8 }}>Before you record</h3>
        <p style={{ fontSize: 13.5, color: 'var(--color-ash)', lineHeight: 1.5, margin: '0 0 16px' }}>
          Listenly will transcribe this meeting on your device. Recording others may require their
          consent depending on where you and they are located. You are responsible for complying with
          the law and your workplace policy.
        </p>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <PillButton variant="ghost" onClick={onCancel}>
            Cancel
          </PillButton>
          <PillButton onClick={onConfirm}>I understand</PillButton>
        </div>
      </div>
    </div>
  )
}

function EmptyState() {
  return (
    <div style={{ textAlign: 'center', padding: '40px 16px', color: 'var(--color-slate)' }}>
      <div style={{ fontSize: 14, marginBottom: 6, color: 'var(--color-ash)' }}>Nothing yet</div>
      <div style={{ fontSize: 13 }}>
        Press <b style={{ color: 'var(--color-bone)' }}>Start listening</b>, then <b style={{ color: 'var(--color-bone)' }}>Ask now</b>{' '}
        when you need an answer.
      </div>
    </div>
  )
}

function Caret() {
  return (
    <span
      style={{
        display: 'inline-block',
        width: 7,
        height: 15,
        marginLeft: 2,
        background: 'var(--color-dusk-violet)',
        verticalAlign: 'text-bottom',
        animation: 'listenly-pulse 1s steps(2) infinite'
      }}
    />
  )
}

function IconButton({ children, onClick, title }: { children: React.ReactNode; onClick?: () => void; title?: string }) {
  return (
    <button
      className="no-drag"
      title={title}
      onClick={onClick}
      style={{
        display: 'grid',
        placeItems: 'center',
        width: 30,
        height: 30,
        borderRadius: 'var(--radius-ui)',
        border: '1px solid var(--color-hairline)',
        background: 'transparent',
        color: 'var(--color-ash)'
      }}
    >
      {children}
    </button>
  )
}

function Wordmark() {
  return (
    <span
      style={{
        width: 22,
        height: 22,
        borderRadius: 7,
        background: 'var(--gradient-hero-horizon)',
        display: 'inline-block'
      }}
    />
  )
}

function GearIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-2.82 1.17V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 8 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.6 15H4.5a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 6 8.6l-.33-.94a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 12 4.6V4.5a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 2.82 1.17l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  )
}

function ShieldIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
      <path d="M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6z" />
    </svg>
  )
}
