import { useMemo, useState } from 'react'
import { CODE_LANGUAGES } from '@shared/constants'
import type { CodeLanguage } from '@shared/types'
import { highlight } from '../lib/highlight'
import { HairlineButton } from './ui'

const MONO = "ui-monospace, 'Cascadia Code', 'SF Mono', Menlo, Consolas, monospace"

export function CodeDisplay({
  code,
  language,
  streaming,
  fileName
}: {
  code: string
  language: CodeLanguage
  streaming?: boolean
  fileName?: string
}) {
  const [copied, setCopied] = useState(false)
  // Re-highlighting on every streamed delta is wasted work; plain text until done.
  const nodes = useMemo(() => (streaming ? [code] : highlight(code, language)), [code, language, streaming])
  const label = CODE_LANGUAGES.find((l) => l.id === language)?.label ?? language
  const lines = code ? code.split('\n').length : 0

  const copy = async () => {
    await navigator.clipboard.writeText(code)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <div style={{ border: 'var(--hairline-soft)', borderRadius: 14, overflow: 'hidden', background: 'rgba(0,0,0,0.35)' }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '6px 8px 6px 12px',
          borderBottom: 'var(--hairline-soft)'
        }}
      >
        <span
          style={{
            fontSize: 10.5,
            fontWeight: 600,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            color: 'var(--color-ash)'
          }}
        >
          {label}
        </span>
        <span style={{ fontSize: 11, color: 'var(--color-slate)' }}>{lines} lines</span>
        <div style={{ flex: 1 }} />
        {!streaming && code && (
          <>
            <HairlineButton onClick={copy}>{copied ? 'Copied' : 'Copy'}</HairlineButton>
            <HairlineButton onClick={() => window.listenly.codegen.saveFile({ code, language, name: fileName })}>
              Save
            </HairlineButton>
          </>
        )}
      </div>
      <pre
        style={{
          margin: 0,
          padding: 12,
          maxHeight: '46vh',
          overflow: 'auto',
          fontFamily: MONO,
          fontSize: 12.5,
          lineHeight: 1.55,
          color: 'var(--color-bone)',
          userSelect: 'text',
          tabSize: 4
        }}
      >
        <code>{nodes}</code>
      </pre>
    </div>
  )
}
