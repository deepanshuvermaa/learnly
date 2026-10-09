import { useEffect, useState } from 'react'
import {
  PROVIDERS,
  PROVIDER_IDS,
  CODEGEN_SCOPES,
  CODE_LANGUAGES,
  CODEGEN_PROMPT_MAX_CHARS,
  CODEGEN_PROMPT_TEMPLATES,
  DEFAULT_SHORTCUTS,
  type ProviderId
} from '@shared/constants'
import type { CodeGenRecord, CodeGenStats, CodeGenScope, SecretsStatus, Settings } from '@shared/types'
import { estimateTokenCount } from '@shared/tokens'
import { useStore } from '../store/useStore'
import { PillButton, HairlineButton, FrostedCard, SectionHeader, Toggle, Row } from './ui'

const areaStyle: React.CSSProperties = {
  width: '100%',
  minHeight: 200,
  background: 'rgba(0,0,0,0.25)',
  border: '1px solid var(--color-hairline)',
  borderRadius: 'var(--radius-ui)',
  padding: 12,
  fontSize: 14,
  color: 'var(--color-bone)',
  outline: 'none',
  resize: 'vertical',
  userSelect: 'text',
  fontFamily: 'var(--font-dm-sans)',
  lineHeight: 1.5
}

const selectStyle: React.CSSProperties = {
  background: 'rgba(0,0,0,0.25)',
  border: '1px solid var(--color-hairline)',
  borderRadius: 'var(--radius-ui)',
  padding: '7px 10px',
  fontSize: 13,
  color: 'var(--color-bone)',
  outline: 'none'
}

const SCOPE_EXPLANATION: Record<CodeGenScope, string> = {
  'brute-force': 'A couple of sentences and the smallest working function. Fastest; best for quick “how would you…” asks.',
  walkthrough: 'A short talk-track plus 50–100 lines commented at the decision points. Best for design discussions.',
  'full-code': 'A brief explanation plus a complete module with validation, error handling and real imports. Slowest.'
}

const isMac = window.listenly.system.platform === 'darwin'

export function prettyAccelerator(accel: string): string {
  return accel.replace('CommandOrControl', isMac ? '⌘' : 'Ctrl').replace(/\+/g, ' + ')
}

const NAMED_KEYS: Record<string, string> = {
  Space: 'Space',
  Enter: 'Enter',
  Tab: 'Tab',
  Backspace: 'Backspace',
  Delete: 'Delete',
  Home: 'Home',
  End: 'End',
  PageUp: 'PageUp',
  PageDown: 'PageDown',
  ArrowUp: 'Up',
  ArrowDown: 'Down',
  ArrowLeft: 'Left',
  ArrowRight: 'Right'
}

/** KeyboardEvent → Electron accelerator. Needs a modifier unless it's an F-key. */
function toAccelerator(e: React.KeyboardEvent): string | null {
  const code = e.code
  let key: string | undefined
  if (/^Key[A-Z]$/.test(code)) key = code.slice(3)
  else if (/^Digit\d$/.test(code)) key = code.slice(5)
  else if (/^F\d{1,2}$/.test(code)) key = code
  else key = NAMED_KEYS[code]
  if (!key) return null

  const mods: string[] = []
  if (e.ctrlKey || e.metaKey) mods.push('CommandOrControl')
  if (e.altKey) mods.push('Alt')
  if (e.shiftKey) mods.push('Shift')
  if (!mods.length && !/^F\d+$/.test(key)) return null
  return [...mods, key].join('+')
}

export function CodeGenSettings({
  settings,
  secrets,
  update
}: {
  settings: Settings
  secrets: SecretsStatus | null
  update: (patch: Partial<Settings>) => Promise<void>
}) {
  const cg = settings.codeGen
  const setCg = (patch: Partial<Settings['codeGen']>) => update({ codeGen: { ...cg, ...patch } })

  return (
    <div>
      <SectionHeader
        title="Code generation"
        hint="When someone asks a technical question, offer a talk-track and code you can pick by depth."
      />

      <FrostedCard style={{ padding: '4px 20px', marginBottom: 20 }}>
        <Row title="Enable code generation" desc="Off = no detection, no code panel, and the hotkey is released.">
          <Toggle on={cg.enabled} onChange={(v) => setCg({ enabled: v })} />
        </Row>
        <Row
          title="Detect technical questions"
          desc="Watch the other side's finished turns and open the panel when one looks like a technical ask (≥70% confidence). Off = hotkey only."
        >
          <Toggle on={cg.autoDetect} onChange={(v) => setCg({ autoDetect: v })} />
        </Row>
      </FrostedCard>

      <SystemPromptCard settings={settings} />
      <ProviderCard settings={settings} secrets={secrets} setCg={setCg} />

      <FrostedCard style={{ padding: 20, marginBottom: 20 }}>
        <div style={{ fontSize: 14, color: 'var(--color-ash)', marginBottom: 10 }}>Default depth</div>
        <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
          {CODEGEN_SCOPES.map((s) => (
            <HairlineButton key={s.id} active={cg.defaultScope === s.id} onClick={() => setCg({ defaultScope: s.id })}>
              {s.label}
            </HairlineButton>
          ))}
        </div>
        <p style={{ fontSize: 12.5, color: 'var(--color-slate)', margin: '0 0 16px', lineHeight: 1.5 }}>
          {SCOPE_EXPLANATION[cg.defaultScope]} Highlighted in the panel when the question doesn't suggest otherwise.
        </p>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <div>
            <div style={{ fontSize: 14, color: 'var(--color-ash)' }}>Language</div>
            <div style={{ fontSize: 12.5, color: 'var(--color-slate)', marginTop: 3 }}>
              Auto infers it from the question and conversation; falls back to TypeScript.
            </div>
          </div>
          <select
            value={cg.language}
            onChange={(e) => setCg({ language: e.target.value as Settings['codeGen']['language'] })}
            className="no-drag"
            style={selectStyle}
          >
            <option value="auto">Auto-detect</option>
            {CODE_LANGUAGES.map((l) => (
              <option key={l.id} value={l.id}>
                {l.label}
              </option>
            ))}
          </select>
        </div>
      </FrostedCard>

      <HotkeyCard settings={settings} />
      <UsageCard />
    </div>
  )
}

function SystemPromptCard({ settings }: { settings: Settings }) {
  const cg = settings.codeGen
  const [draft, setDraft] = useState(cg.systemPrompt)
  const [saving, setSaving] = useState(false)
  const dirty = draft !== cg.systemPrompt
  const tokens = estimateTokenCount(draft, cg.provider)

  useEffect(() => setDraft(cg.systemPrompt), [cg.systemPrompt])

  const save = async () => {
    setSaving(true)
    try {
      // Main recomputes the hash + token count and returns the canonical settings.
      useStore.getState().setSettings(await window.listenly.codegen.savePrompt(draft))
    } finally {
      setSaving(false)
    }
  }

  return (
    <FrostedCard style={{ padding: 20, marginBottom: 20 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <span
          style={{ fontSize: 14, color: 'var(--color-ash)', cursor: 'help' }}
          title="This prompt is prepended to every code generation request."
        >
          System prompt ⓘ
        </span>
        <select
          value=""
          onChange={(e) => {
            const t = CODEGEN_PROMPT_TEMPLATES.find((x) => x.id === e.target.value)
            if (t) setDraft(t.prompt)
          }}
          className="no-drag"
          style={selectStyle}
        >
          <option value="">Load default…</option>
          {CODEGEN_PROMPT_TEMPLATES.map((t) => (
            <option key={t.id} value={t.id}>
              {t.label}
            </option>
          ))}
        </select>
      </div>
      <textarea
        value={draft}
        onChange={(e) => setDraft(e.target.value.slice(0, CODEGEN_PROMPT_MAX_CHARS))}
        spellCheck={false}
        className="no-drag"
        style={areaStyle}
        placeholder="e.g. Our stack is NestJS + Postgres + Prisma. Explanations should sound like me talking to my lead: direct, first person, no jargon padding…"
      />
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10 }}>
        <span style={{ fontSize: 12, color: 'var(--color-slate)', flex: 1 }}>
          {draft.length.toLocaleString()} / {CODEGEN_PROMPT_MAX_CHARS.toLocaleString()} chars · ~{tokens} tokens
          {dirty ? ' · unsaved' : cg.systemPromptHash ? ' · saved' : ''}
        </span>
        <HairlineButton onClick={() => setDraft('')}>Clear</HairlineButton>
        <PillButton disabled={!dirty || saving} onClick={save}>
          {saving ? 'Saving…' : 'Save'}
        </PillButton>
      </div>
    </FrostedCard>
  )
}

function ProviderCard({
  settings,
  secrets,
  setCg
}: {
  settings: Settings
  secrets: SecretsStatus | null
  setCg: (patch: Partial<Settings['codeGen']>) => void
}) {
  const cg = settings.codeGen
  const selected = cg.provider
  const model = (id: ProviderId) => settings.models[id] ?? PROVIDERS[id].defaultModel
  const keyed = PROVIDER_IDS.filter((id) => secrets?.[id])

  return (
    <FrostedCard style={{ padding: 20, marginBottom: 20 }}>
      <div style={{ fontSize: 14, color: 'var(--color-ash)', marginBottom: 10 }}>Provider</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {PROVIDER_IDS.map((id) => {
          const hasKey = Boolean(secrets?.[id])
          return (
            <button
              key={id}
              onClick={() => setCg({ provider: id })}
              className="no-drag"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '9px 12px',
                borderRadius: 'var(--radius-ui)',
                border: selected === id ? '1px solid rgba(107,98,242,0.7)' : '1px solid rgba(229,229,229,0.14)',
                background: selected === id ? 'rgba(107,98,242,0.10)' : 'transparent',
                color: 'var(--color-bone)',
                textAlign: 'left'
              }}
            >
              <span
                style={{
                  width: 14,
                  height: 14,
                  borderRadius: 9999,
                  border: '1px solid var(--color-smoke)',
                  display: 'grid',
                  placeItems: 'center'
                }}
              >
                {selected === id && (
                  <span style={{ width: 7, height: 7, borderRadius: 9999, background: 'var(--color-snow-white)' }} />
                )}
              </span>
              <span style={{ fontSize: 14, flex: 1 }}>{PROVIDERS[id].label}</span>
              <span style={{ fontSize: 11.5, color: 'var(--color-slate)', fontFamily: 'var(--font-geist)' }}>{model(id)}</span>
              <span style={{ fontSize: 11.5, color: hasKey ? '#9fce9f' : 'var(--color-slate)', width: 72, textAlign: 'right' }}>
                {hasKey ? '● ready' : 'no key'}
              </span>
            </button>
          )
        })}
      </div>
      {!secrets?.[selected] && (
        <div style={{ marginTop: 12, fontSize: 12.5, color: '#d9c08f', lineHeight: 1.5 }}>
          No API key for {PROVIDERS[selected].label}. Add one under AI providers
          {cg.fallback && keyed.length ? ` — until then ${PROVIDERS[keyed[0]].label} will be used.` : '.'}
        </div>
      )}
      <div style={{ borderTop: 'var(--hairline-soft)', marginTop: 14 }}>
        <Row
          title="Fall back to other providers"
          desc="If the chosen provider errors or is rate limited, try the others that have keys (Groq → Gemini → OpenAI → xAI → Kimi)."
        >
          <Toggle on={cg.fallback} onChange={(v) => setCg({ fallback: v })} />
        </Row>
      </div>
    </FrostedCard>
  )
}

function HotkeyCard({ settings }: { settings: Settings }) {
  const current = settings.shortcuts.toggleCodePanel
  const [recording, setRecording] = useState(false)
  const [captured, setCaptured] = useState<string | null>(null)
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null)

  const apply = async (accel: string) => {
    const res = await window.listenly.shortcuts.set('toggleCodePanel', accel)
    useStore.getState().setSettings(res.settings)
    setCaptured(null)
    setMessage(
      res.ok
        ? { text: `Saved. ${prettyAccelerator(accel)} now toggles the code panel.`, ok: true }
        : { text: `${prettyAccelerator(accel)} couldn't be registered — another app may already use it.`, ok: false }
    )
  }

  const test = async () => {
    if (!settings.codeGen.enabled) {
      setMessage({ text: 'Code generation is off, so the hotkey is not registered.', ok: false })
      return
    }
    const ok = await window.listenly.shortcuts.check('toggleCodePanel')
    setMessage(
      ok
        ? { text: `${prettyAccelerator(current)} is registered. Press it anywhere to toggle the panel.`, ok: true }
        : { text: `${prettyAccelerator(current)} is not registered — it may be taken by another app.`, ok: false }
    )
  }

  return (
    <FrostedCard style={{ padding: 20, marginBottom: 20 }}>
      <div style={{ fontSize: 14, color: 'var(--color-ash)', marginBottom: 4 }}>Hotkey</div>
      <p style={{ fontSize: 12.5, color: 'var(--color-slate)', margin: '0 0 12px', lineHeight: 1.5 }}>
        Shows or hides the code panel from any app.
      </p>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <button
          className="no-drag"
          onClick={() => {
            setRecording(true)
            setMessage(null)
          }}
          onBlur={() => setRecording(false)}
          onKeyDown={(e) => {
            if (!recording) return
            e.preventDefault()
            if (e.key === 'Escape') {
              setRecording(false)
              return
            }
            const accel = toAccelerator(e)
            if (accel) {
              setCaptured(accel)
              setRecording(false)
            }
          }}
          style={{
            minWidth: 180,
            padding: '8px 12px',
            borderRadius: 'var(--radius-ui)',
            border: recording ? '1px solid rgba(107,98,242,0.8)' : '1px solid var(--color-hairline)',
            background: 'rgba(0,0,0,0.25)',
            color: recording ? 'var(--color-ash)' : 'var(--color-bone)',
            fontFamily: 'var(--font-geist)',
            fontSize: 13,
            textAlign: 'left'
          }}
        >
          {recording ? 'Press a key combination…' : prettyAccelerator(captured ?? current)}
        </button>
        {captured && captured !== current && <PillButton onClick={() => apply(captured)}>Save</PillButton>}
        <HairlineButton onClick={test}>Test hotkey</HairlineButton>
        {current !== DEFAULT_SHORTCUTS.toggleCodePanel && (
          <HairlineButton onClick={() => apply(DEFAULT_SHORTCUTS.toggleCodePanel)}>Reset</HairlineButton>
        )}
      </div>
      {message && (
        <div style={{ marginTop: 10, fontSize: 12.5, color: message.ok ? '#9fce9f' : '#d3a3a3' }}>{message.text}</div>
      )}
    </FrostedCard>
  )
}

function UsageCard() {
  const [stats, setStats] = useState<CodeGenStats | null>(null)
  const [history, setHistory] = useState<CodeGenRecord[]>([])

  const refresh = async () => {
    const [s, h] = await Promise.all([window.listenly.codegen.stats(), window.listenly.codegen.history()])
    setStats(s)
    setHistory(h)
  }
  useEffect(() => {
    refresh()
  }, [])

  if (!stats) return null
  const breakdown = Object.entries(stats.byProvider)
    .sort((a, b) => (b[1] ?? 0) - (a[1] ?? 0))
    .map(([id, n]) => `${PROVIDERS[id as ProviderId].label} ${n}`)
    .join(', ')

  return (
    <FrostedCard style={{ padding: 20 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <span style={{ fontSize: 14, color: 'var(--color-ash)' }}>Usage (this device)</span>
        <div style={{ display: 'flex', gap: 8 }}>
          <HairlineButton onClick={refresh}>Refresh</HairlineButton>
          {(stats.totalGenerations > 0 || stats.failures > 0) && (
            <HairlineButton
              onClick={async () => {
                await window.listenly.codegen.clearHistory()
                await refresh()
              }}
            >
              Clear
            </HairlineButton>
          )}
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 12 }}>
        <Stat label="Generations" value={stats.totalGenerations.toLocaleString()} />
        <Stat label="Tokens used" value={stats.totalTokens.toLocaleString()} />
        <Stat label="Average time" value={stats.avgTimeMs ? `${(stats.avgTimeMs / 1000).toFixed(1)}s` : '—'} />
        <Stat label="Failures" value={stats.failures.toLocaleString()} />
      </div>
      {breakdown && <div style={{ fontSize: 12.5, color: 'var(--color-slate)', marginBottom: 10 }}>By provider: {breakdown}</div>}
      {history.slice(0, 8).map((r) => (
        <div
          key={r.id}
          style={{
            display: 'flex',
            gap: 10,
            alignItems: 'baseline',
            padding: '8px 0',
            borderTop: 'var(--hairline-soft)',
            fontSize: 12.5
          }}
        >
          <span style={{ color: 'var(--color-slate)', width: 44, flexShrink: 0 }}>
            {new Date(r.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </span>
          <span
            style={{ flex: 1, color: r.ok ? 'var(--color-bone)' : '#d3a3a3', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
            title={r.error ?? r.question}
          >
            {r.ok ? r.question ?? '(question not retained)' : r.error}
          </span>
          <span style={{ color: 'var(--color-slate)', flexShrink: 0 }}>
            {CODEGEN_SCOPES.find((s) => s.id === r.scope)?.label}
            {r.provider ? ` · ${PROVIDERS[r.provider].label}` : ''}
            {r.ok ? ` · ${r.tokensUsed.toLocaleString()} tok` : ''}
          </span>
        </div>
      ))}
      <p style={{ fontSize: 12, color: 'var(--color-slate)', margin: '10px 0 0', lineHeight: 1.5 }}>
        Questions and code are only kept here while “Save transcripts on device” is on; counts are always kept.
      </p>
    </FrostedCard>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ border: 'var(--hairline-soft)', borderRadius: 12, padding: '10px 12px' }}>
      <div style={{ fontSize: 18, fontFamily: 'var(--font-geist)', color: 'var(--color-bone)' }}>{value}</div>
      <div style={{ fontSize: 11.5, color: 'var(--color-slate)', marginTop: 2 }}>{label}</div>
    </div>
  )
}
