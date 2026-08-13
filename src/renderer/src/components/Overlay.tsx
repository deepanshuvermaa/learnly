import { useEffect, useMemo, useRef, useState } from 'react'
import { useStore } from '../store/useStore'
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

  const rows = useMemo(() => {
    const live = [interim.them, interim.me].filter(Boolean) as typeof finals
    return [...finals.slice(-40), ...live]
  }, [finals, interim])

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

      {/* Body: suggestions (top) + transcript (bottom) */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '4px 16px 16px' }} className="no-drag">
        {suggestions.length === 0 && rows.length === 0 && <EmptyState />}

        {suggestions.map((s) => (
          <SuggestionCard key={s.id} s={s} />
        ))}

        {rows.length > 0 && (
          <div style={{ marginTop: suggestions.length ? 18 : 4 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <span style={{ fontSize: 12, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--color-slate)' }}>
                Transcript
              </span>
              <button
                onClick={clearTranscript}
                style={{ background: 'none', border: 'none', color: 'var(--color-slate)', fontSize: 12 }}
              >
                Clear
              </button>
            </div>
            {rows.map((seg) => (
              <TranscriptLine key={seg.id} speaker={seg.speaker} text={seg.text} dim={!seg.isFinal} />
            ))}
          </div>
        )}
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

function SuggestionCard({ s }: { s: ReturnType<typeof useStore.getState>['suggestions'][number] }) {
  const ref = useRef<HTMLDivElement>(null)
  return (
    <div
      ref={ref}
      style={{
        background: 'var(--surface-frosted)',
        border: 'var(--hairline-soft)',
        borderRadius: 'var(--radius-cards)',
        padding: 16,
        marginTop: 10,
        animation: 'listenly-fade-up 200ms ease'
      }}
    >
      <div style={{ fontSize: 12, color: 'var(--color-slate)', marginBottom: 6 }}>
        {s.question.length > 90 ? s.question.slice(0, 90) + '…' : s.question}
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

function TranscriptLine({ speaker, text, dim }: { speaker: string; text: string; dim: boolean }) {
  const label = speaker === 'me' ? 'You' : speaker === 'them' ? 'Them' : '?'
  return (
    <div style={{ display: 'flex', gap: 10, marginBottom: 6, opacity: dim ? 0.5 : 1 }}>
      <span
        style={{
          fontSize: 11,
          fontWeight: 500,
          color: speaker === 'them' ? 'var(--color-bone)' : 'var(--color-slate)',
          minWidth: 34
        }}
      >
        {label}
      </span>
      <span style={{ fontSize: 13.5, color: 'var(--color-ash)', lineHeight: 1.45, userSelect: 'text' }}>{text}</span>
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
