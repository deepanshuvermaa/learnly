import { useEffect, useState } from 'react'
import { PROVIDERS, PROVIDER_IDS, type ProviderId } from '@shared/constants'
import type { RagDocument } from '@shared/types'
import { useStore } from '../store/useStore'
import { listAudioInputs } from '../lib/audio/capture'
import { PillButton, HairlineButton, FrostedCard, SectionHeader, TextInput } from './ui'

type Tab = 'providers' | 'transcription' | 'knowledge' | 'privacy' | 'shortcuts' | 'about'

export function Settings() {
  const { settings, setSettings, secrets, setSecrets } = useStore()
  const [tab, setTab] = useState<Tab>(settings && !settings.onboarded ? 'providers' : 'providers')

  useEffect(() => {
    if (settings && !settings.onboarded) {
      // Mark onboarded once they've landed here; keeps the flow non-blocking.
    }
  }, [settings])

  if (!settings) return null

  const update = async (patch: Parameters<typeof window.listenly.settings.set>[0]) => {
    const next = await window.listenly.settings.set(patch)
    setSettings(next)
  }

  return (
    <div style={{ height: '100vh', display: 'flex', background: 'var(--color-void-canvas)' }}>
      {/* Sidebar */}
      <div
        className="drag"
        style={{
          width: 220,
          borderRight: 'var(--hairline-soft)',
          padding: '44px 14px 16px',
          display: 'flex',
          flexDirection: 'column',
          gap: 4
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '0 8px 18px' }}>
          <span style={{ width: 22, height: 22, borderRadius: 7, background: 'var(--gradient-hero-horizon)' }} />
          <span style={{ fontFamily: 'var(--font-geist)', fontSize: 15, fontWeight: 500 }}>Listenly</span>
        </div>
        {(
          [
            ['providers', 'AI providers'],
            ['transcription', 'Transcription'],
            ['knowledge', 'Knowledge base'],
            ['privacy', 'Privacy & screen share'],
            ['shortcuts', 'Shortcuts'],
            ['about', 'About']
          ] as [Tab, string][]
        ).map(([id, label]) => (
          <button
            key={id}
            className="no-drag"
            onClick={() => setTab(id)}
            style={{
              textAlign: 'left',
              padding: '9px 12px',
              borderRadius: 'var(--radius-ui)',
              border: 'none',
              background: tab === id ? 'var(--surface-frosted-strong)' : 'transparent',
              color: tab === id ? 'var(--color-bone)' : 'var(--color-smoke)',
              fontSize: 14,
              fontWeight: 500
            }}
          >
            {label}
          </button>
        ))}
        <div style={{ flex: 1 }} />
        {!settings.onboarded && (
          <PillButton className="no-drag" onClick={() => update({ onboarded: true })}>
            Finish setup
          </PillButton>
        )}
      </div>

      {/* Content */}
      <div className="no-drag" style={{ flex: 1, overflowY: 'auto', padding: '44px 40px 56px' }}>
        <div style={{ maxWidth: 640 }}>
          {tab === 'providers' && <ProvidersTab settings={settings} secrets={secrets} setSecrets={setSecrets} update={update} />}
          {tab === 'transcription' && <TranscriptionTab settings={settings} secrets={secrets} setSecrets={setSecrets} update={update} />}
          {tab === 'knowledge' && <KnowledgeTab />}
          {tab === 'privacy' && <PrivacyTab settings={settings} update={update} />}
          {tab === 'shortcuts' && <ShortcutsTab settings={settings} />}
          {tab === 'about' && <AboutTab />}
        </div>
      </div>
    </div>
  )
}

function KeyRow({
  id,
  label,
  hasKey,
  keysUrl,
  onSave,
  onClear
}: {
  id: string
  label: string
  hasKey: boolean
  keysUrl: string
  onSave: (v: string) => void
  onClear: () => void
}) {
  const [val, setVal] = useState('')
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
        <span style={{ fontSize: 14, color: 'var(--color-bone)' }}>{label}</span>
        <span style={{ fontSize: 12, color: hasKey ? '#9fce9f' : 'var(--color-slate)' }}>
          {hasKey ? '● key saved' : 'no key'}
        </span>
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <TextInput value={val} onChange={setVal} placeholder={hasKey ? '•••••••• (replace)' : `Paste ${label} key`} mono />
        <PillButton
          disabled={!val}
          onClick={() => {
            onSave(val)
            setVal('')
          }}
        >
          Save
        </PillButton>
        {hasKey && (
          <HairlineButton onClick={onClear}>Clear</HairlineButton>
        )}
      </div>
      <a
        href={keysUrl}
        target="_blank"
        rel="noreferrer"
        style={{ fontSize: 12, color: 'var(--color-slate)', textDecoration: 'none' }}
      >
        Get a key ↗
      </a>
    </div>
  )
}

function ProvidersTab({ settings, secrets, setSecrets, update }: any) {
  return (
    <div>
      <SectionHeader title="AI providers" hint="Bring your own keys. They're encrypted on this device and never leave it except to call the provider you choose." />

      <FrostedCard style={{ padding: 20, marginBottom: 24 }}>
        <div style={{ fontSize: 14, marginBottom: 10, color: 'var(--color-ash)' }}>Active model provider</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {PROVIDER_IDS.map((id) => (
            <HairlineButton
              key={id}
              active={settings.activeProvider === id}
              onClick={() => update({ activeProvider: id })}
            >
              {PROVIDERS[id].label}
            </HairlineButton>
          ))}
        </div>
        <div style={{ marginTop: 14 }}>
          <div style={{ fontSize: 13, color: 'var(--color-slate)', marginBottom: 6 }}>
            Model for {PROVIDERS[settings.activeProvider as ProviderId].label}
          </div>
          <TextInput
            value={settings.models[settings.activeProvider] ?? PROVIDERS[settings.activeProvider as ProviderId].defaultModel}
            onChange={(v) => update({ models: { ...settings.models, [settings.activeProvider]: v } })}
            mono
          />
        </div>
      </FrostedCard>

      {PROVIDER_IDS.map((id) => (
        <KeyRow
          key={id}
          id={id}
          label={PROVIDERS[id].label}
          hasKey={Boolean(secrets?.[id])}
          keysUrl={PROVIDERS[id].keysUrl}
          onSave={async (v) => setSecrets(await window.listenly.secrets.set(id, v))}
          onClear={async () => setSecrets(await window.listenly.secrets.clear(id))}
        />
      ))}

      <div style={{ marginTop: 18, fontSize: 13, color: 'var(--color-slate)' }}>
        Embeddings (for knowledge-base search) use{' '}
        <b style={{ color: 'var(--color-ash)' }}>{PROVIDERS[settings.embeddingProvider as ProviderId].label}</b>. Set a Gemini or
        OpenAI key above to enable retrieval.
      </div>
    </div>
  )
}

function TranscriptionTab({ settings, secrets, setSecrets, update }: any) {
  return (
    <div>
      <SectionHeader title="Transcription" hint="Deepgram gives the best live latency. Local Whisper (audio never leaves your device) is on the roadmap." />
      <FrostedCard style={{ padding: 20, marginBottom: 20 }}>
        <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
          {(['deepgram', 'whisper-local', 'off'] as const).map((eng) => (
            <HairlineButton
              key={eng}
              active={settings.stt.engine === eng}
              onClick={() => update({ stt: { ...settings.stt, engine: eng } })}
            >
              {eng === 'deepgram' ? 'Deepgram' : eng === 'whisper-local' ? 'Local Whisper' : 'Off'}
            </HairlineButton>
          ))}
        </div>
        <KeyRow
          id="deepgram"
          label="Deepgram"
          hasKey={Boolean(secrets?.deepgram)}
          keysUrl="https://console.deepgram.com/signup"
          onSave={async (v) => setSecrets(await window.listenly.secrets.set('deepgram', v))}
          onClear={async () => setSecrets(await window.listenly.secrets.clear('deepgram'))}
        />
        <div style={{ display: 'flex', gap: 12, marginTop: 10 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13, color: 'var(--color-slate)', marginBottom: 6 }}>Deepgram model</div>
            <TextInput value={settings.stt.deepgramModel} onChange={(v) => update({ stt: { ...settings.stt, deepgramModel: v } })} mono />
          </div>
          <div style={{ width: 120 }}>
            <div style={{ fontSize: 13, color: 'var(--color-slate)', marginBottom: 6 }}>Language</div>
            <TextInput value={settings.stt.language} onChange={(v) => update({ stt: { ...settings.stt, language: v } })} mono />
          </div>
        </div>
      </FrostedCard>

      {settings.stt.engine === 'whisper-local' && (
        <FrostedCard style={{ padding: 20 }}>
          <div style={{ fontSize: 14, color: 'var(--color-ash)', marginBottom: 4 }}>Local Whisper (on-device)</div>
          <p style={{ fontSize: 12.5, color: 'var(--color-slate)', margin: '0 0 14px', lineHeight: 1.5 }}>
            Audio never leaves your machine. Point Listenly at a{' '}
            <b style={{ color: 'var(--color-ash)' }}>whisper.cpp</b> binary (whisper-cli / main) and a ggml model
            (e.g. ggml-base.en.bin). See the README for a one-line build.
          </p>
          <PathPicker
            label="whisper.cpp binary"
            value={settings.stt.whisper.binaryPath}
            onPick={async () => {
              const p = await window.listenly.system.pickFile({ title: 'Select whisper.cpp binary' })
              if (p) update({ stt: { ...settings.stt, whisper: { ...settings.stt.whisper, binaryPath: p } } })
            }}
            onChange={(v) => update({ stt: { ...settings.stt, whisper: { ...settings.stt.whisper, binaryPath: v } } })}
          />
          <PathPicker
            label="ggml model file"
            value={settings.stt.whisper.modelPath}
            onPick={async () => {
              const p = await window.listenly.system.pickFile({ title: 'Select ggml model', extensions: ['bin'] })
              if (p) update({ stt: { ...settings.stt, whisper: { ...settings.stt.whisper, modelPath: p } } })
            }}
            onChange={(v) => update({ stt: { ...settings.stt, whisper: { ...settings.stt.whisper, modelPath: v } } })}
          />
          <div style={{ width: 140, marginTop: 10 }}>
            <div style={{ fontSize: 13, color: 'var(--color-slate)', marginBottom: 6 }}>CPU threads</div>
            <TextInput
              value={String(settings.stt.whisper.threads)}
              onChange={(v) => update({ stt: { ...settings.stt, whisper: { ...settings.stt.whisper, threads: Math.max(1, parseInt(v) || 4) } } })}
              mono
            />
          </div>
        </FrostedCard>
      )}

      {window.listenly.system.platform === 'darwin' && <MacAudioDevice settings={settings} update={update} />}
    </div>
  )
}

function MacAudioDevice({ settings, update }: any) {
  const [inputs, setInputs] = useState<{ id: string; label: string }[]>([])
  const load = async () => setInputs(await listAudioInputs())
  useEffect(() => {
    load()
  }, [])
  return (
    <FrostedCard style={{ padding: 20, marginTop: 20 }}>
      <div style={{ fontSize: 14, color: 'var(--color-ash)', marginBottom: 4 }}>macOS system audio</div>
      <p style={{ fontSize: 12.5, color: 'var(--color-slate)', margin: '0 0 14px', lineHeight: 1.5 }}>
        macOS can't capture system audio directly. Install <b style={{ color: 'var(--color-ash)' }}>BlackHole</b>, route your
        meeting output into it (via a Multi-Output device so you still hear it), then select that input here.
      </p>
      <div style={{ display: 'flex', gap: 8 }}>
        <select
          value={settings.stt.macSystemAudioDeviceId}
          onChange={(e) => update({ stt: { ...settings.stt, macSystemAudioDeviceId: e.target.value } })}
          className="no-drag"
          style={{
            flex: 1,
            background: 'rgba(0,0,0,0.25)',
            border: '1px solid var(--color-hairline)',
            borderRadius: 'var(--radius-ui)',
            padding: '10px 12px',
            fontSize: 14,
            color: 'var(--color-bone)',
            outline: 'none'
          }}
        >
          <option value="">Auto-detect (BlackHole/Loopback/Aggregate)</option>
          {inputs.map((d) => (
            <option key={d.id} value={d.id}>
              {d.label}
            </option>
          ))}
        </select>
        <HairlineButton onClick={load}>Refresh</HairlineButton>
      </div>
    </FrostedCard>
  )
}

function PathPicker({
  label,
  value,
  onPick,
  onChange
}: {
  label: string
  value: string
  onPick: () => void
  onChange: (v: string) => void
}) {
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ fontSize: 13, color: 'var(--color-slate)', marginBottom: 6 }}>{label}</div>
      <div style={{ display: 'flex', gap: 8 }}>
        <TextInput value={value} onChange={onChange} placeholder="No file selected" mono />
        <HairlineButton onClick={onPick}>Browse…</HairlineButton>
      </div>
    </div>
  )
}

function KnowledgeTab() {
  const [docs, setDocs] = useState<RagDocument[]>([])
  const [text, setText] = useState('')
  const [source, setSource] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const refresh = async () => setDocs(await window.listenly.rag.list())
  useEffect(() => {
    refresh()
  }, [])

  const addText = async () => {
    if (!text.trim()) return
    setBusy(true)
    setErr(null)
    try {
      await window.listenly.rag.ingestText(source.trim() || 'Pasted note', text.trim())
      setText('')
      setSource('')
      await refresh()
    } catch (e: any) {
      setErr(e?.message ?? String(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div>
      <SectionHeader title="Knowledge base" hint="This is the moat: your docs, past-call notes, product facts. Answers are grounded in what you add here, stored on-device." />
      <FrostedCard style={{ padding: 20, marginBottom: 20 }}>
        <div style={{ marginBottom: 10 }}>
          <TextInput value={source} onChange={setSource} placeholder="Source label (e.g. Q2 pricing sheet)" />
        </div>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Paste notes, transcripts, specs, FAQs…"
          spellCheck={false}
          style={{
            width: '100%',
            minHeight: 130,
            background: 'rgba(0,0,0,0.25)',
            border: '1px solid var(--color-hairline)',
            borderRadius: 'var(--radius-ui)',
            padding: 12,
            fontSize: 14,
            color: 'var(--color-bone)',
            outline: 'none',
            resize: 'vertical',
            userSelect: 'text',
            fontFamily: 'var(--font-dm-sans)'
          }}
        />
        {err && <div style={{ color: '#d3a3a3', fontSize: 13, marginTop: 8 }}>{err}</div>}
        <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
          <PillButton disabled={busy || !text.trim()} onClick={addText}>
            {busy ? 'Embedding…' : 'Add note'}
          </PillButton>
          <HairlineButton
            onClick={async () => {
              const added = await window.listenly.rag.ingestFiles()
              if (added.length) await refresh()
            }}
          >
            Import files…
          </HairlineButton>
        </div>
      </FrostedCard>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <span style={{ fontSize: 13, color: 'var(--color-slate)' }}>{docs.length} document(s)</span>
        {docs.length > 0 && (
          <button
            onClick={async () => {
              await window.listenly.rag.clear()
              await refresh()
            }}
            style={{ background: 'none', border: 'none', color: 'var(--color-slate)', fontSize: 13 }}
          >
            Clear all
          </button>
        )}
      </div>
      {docs.map((d) => (
        <div
          key={d.id}
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            padding: '10px 0',
            borderBottom: 'var(--hairline-soft)',
            fontSize: 14
          }}
        >
          <span style={{ color: 'var(--color-bone)' }}>{d.source}</span>
          <span style={{ color: 'var(--color-slate)', fontSize: 12 }}>{d.chunks} chunks</span>
        </div>
      ))}
    </div>
  )
}

function Toggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!on)}
      style={{
        width: 42,
        height: 24,
        borderRadius: 9999,
        border: '1px solid var(--color-hairline)',
        background: on ? 'var(--surface-frosted-strong)' : 'transparent',
        position: 'relative',
        transition: 'all 140ms ease'
      }}
    >
      <span
        style={{
          position: 'absolute',
          top: 2,
          left: on ? 20 : 2,
          width: 18,
          height: 18,
          borderRadius: 9999,
          background: on ? 'var(--color-snow-white)' : 'var(--color-slate)',
          transition: 'left 140ms ease'
        }}
      />
    </button>
  )
}

function Row({ title, desc, children }: { title: string; desc: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, padding: '14px 0', borderBottom: 'var(--hairline-soft)' }}>
      <div>
        <div style={{ fontSize: 14, color: 'var(--color-bone)' }}>{title}</div>
        <div style={{ fontSize: 12.5, color: 'var(--color-slate)', marginTop: 3, lineHeight: 1.45 }}>{desc}</div>
      </div>
      {children}
    </div>
  )
}

function PrivacyTab({ settings, update }: any) {
  return (
    <div>
      <SectionHeader title="Privacy & screen share" hint="Bounded, honest controls. Screen-share hiding keeps the overlay out of the frame you broadcast — it does not hide the app from your OS or IT." />
      <FrostedCard style={{ padding: '4px 20px', marginBottom: 20 }}>
        <Row
          title="Hide overlay from my screen share"
          desc="Excludes the Listenly panel from Zoom/Meet/Teams capture (presenter-notes style). May behave differently across Windows builds."
        >
          <Toggle
            on={settings.overlay.contentProtection}
            onChange={(v) => {
              window.listenly.overlay.setContentProtection(v)
              update({ overlay: { ...settings.overlay, contentProtection: v } })
            }}
          />
        </Row>
        <Row title="Hide from taskbar & Alt-Tab" desc="Keeps the floating panel out of the taskbar and window switcher.">
          <Toggle on={settings.overlay.skipTaskbar} onChange={(v) => update({ overlay: { ...settings.overlay, skipTaskbar: v } })} />
        </Row>
        <Row title="Require acknowledgement before recording" desc="Show a consent reminder each session before capturing meeting audio.">
          <Toggle on={settings.consent.acknowledgeBeforeCapture} onChange={(v) => update({ consent: { ...settings.consent, acknowledgeBeforeCapture: v } })} />
        </Row>
        <Row title="Save transcripts on device" desc="Store meeting transcripts locally so you can revisit them. Off = nothing is written to disk.">
          <Toggle on={settings.consent.retainTranscripts} onChange={(v) => update({ consent: { ...settings.consent, retainTranscripts: v } })} />
        </Row>
      </FrostedCard>
    </div>
  )
}

function ShortcutsTab({ settings }: any) {
  const rows: [string, string][] = [
    ['Toggle overlay', settings.shortcuts.toggleOverlay],
    ['Ask now', settings.shortcuts.askNow],
    ['Toggle click-through', settings.shortcuts.toggleClickThrough]
  ]
  return (
    <div>
      <SectionHeader title="Shortcuts" hint="Global hotkeys work even while the meeting app is focused." />
      <FrostedCard style={{ padding: '4px 20px' }}>
        {rows.map(([label, keys]) => (
          <div key={label} style={{ display: 'flex', justifyContent: 'space-between', padding: '14px 0', borderBottom: 'var(--hairline-soft)' }}>
            <span style={{ fontSize: 14, color: 'var(--color-bone)' }}>{label}</span>
            <kbd style={{ fontFamily: 'var(--font-geist)', fontSize: 12.5, color: 'var(--color-ash)', border: '1px solid var(--color-hairline)', borderRadius: 6, padding: '3px 8px' }}>
              {keys}
            </kbd>
          </div>
        ))}
      </FrostedCard>
    </div>
  )
}

function AboutTab() {
  return (
    <div>
      <SectionHeader title="About Listenly" />
      <p style={{ fontSize: 15, color: 'var(--color-ash)', lineHeight: 1.6 }}>
        A local-first meeting recall copilot. Everything — your keys, settings, knowledge base, and
        transcripts — stays on this device. Listenly listens to your meetings and surfaces grounded
        answers from your own notes.
      </p>
      <p style={{ fontSize: 13.5, color: 'var(--color-slate)', lineHeight: 1.6, marginTop: 16 }}>
        Screen-share hiding excludes the overlay from the frame you broadcast, like presenter notes.
        It does not, and is not designed to, hide the running app from your operating system, task
        manager, or your employer's device monitoring.
      </p>
    </div>
  )
}
