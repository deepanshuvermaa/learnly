import React from 'react'

/** White pill CTA — the only filled button in the system. */
export function PillButton({
  children,
  onClick,
  disabled,
  variant = 'solid',
  className = '',
  ...rest
}: {
  children: React.ReactNode
  onClick?: () => void
  disabled?: boolean
  variant?: 'solid' | 'ghost'
  className?: string
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const base: React.CSSProperties = {
    borderRadius: 'var(--radius-buttons)',
    padding: '8px 14px',
    fontFamily: 'var(--font-dm-sans)',
    fontSize: 14,
    fontWeight: 500,
    letterSpacing: '0.01em',
    transition: 'opacity 120ms ease, background 120ms ease, transform 80ms ease',
    opacity: disabled ? 0.45 : 1,
    cursor: disabled ? 'not-allowed' : 'pointer'
  }
  const solid: React.CSSProperties = {
    background: 'var(--color-snow-white)',
    color: '#161616',
    border: 'none'
  }
  const ghost: React.CSSProperties = {
    background: 'transparent',
    color: 'rgba(255,255,255,0.85)',
    border: '1px solid var(--color-hairline)'
  }
  return (
    <button
      className={`no-drag ${className}`}
      style={{ ...base, ...(variant === 'solid' ? solid : ghost) }}
      onClick={onClick}
      disabled={disabled}
      {...rest}
    >
      {children}
    </button>
  )
}

/** Hairline ghost button — 10px radius (not pill), for labels/secondary actions. */
export function HairlineButton({
  children,
  onClick,
  active,
  className = ''
}: {
  children: React.ReactNode
  onClick?: () => void
  active?: boolean
  className?: string
}) {
  return (
    <button
      className={`no-drag ${className}`}
      onClick={onClick}
      style={{
        background: active ? 'var(--surface-frosted-strong)' : 'transparent',
        color: active ? 'var(--color-bone)' : 'var(--color-smoke)',
        border: '1px solid var(--color-hairline)',
        borderRadius: 'var(--radius-ui)',
        padding: '8px 12px',
        fontSize: 13,
        fontWeight: 500,
        letterSpacing: '0.02em',
        transition: 'all 120ms ease'
      }}
    >
      {children}
    </button>
  )
}

/** Frosted glass panel — translucency creates depth, no shadow. */
export function FrostedCard({
  children,
  style,
  className = ''
}: {
  children: React.ReactNode
  style?: React.CSSProperties
  className?: string
}) {
  return (
    <div
      className={className}
      style={{
        background: 'var(--surface-frosted)',
        borderRadius: 'var(--radius-cards)',
        backdropFilter: 'blur(18px)',
        WebkitBackdropFilter: 'blur(18px)',
        border: 'var(--hairline-soft)',
        ...style
      }}
    >
      {children}
    </div>
  )
}

export function SectionHeader({ title, hint }: { title: string; hint?: string }) {
  return (
    <div style={{ marginBottom: 'var(--spacing-16)' }}>
      <h2 style={{ fontFamily: 'var(--font-geist)', fontSize: 24, fontWeight: 600, color: 'var(--color-bone)' }}>
        {title}
      </h2>
      {hint && (
        <p style={{ margin: '6px 0 0', fontSize: 15, color: 'var(--color-slate)', fontFamily: 'var(--font-geist)' }}>
          {hint}
        </p>
      )}
    </div>
  )
}

/** Status banner pill — ephemeral state at the top of a panel. */
export function StatusPill({
  children,
  tone = 'idle'
}: {
  children: React.ReactNode
  tone?: 'idle' | 'live' | 'error'
}) {
  const dot =
    tone === 'live' ? 'var(--color-dusk-violet)' : tone === 'error' ? '#c98a8a' : 'var(--color-slate)'
  return (
    <div
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 8,
        padding: '6px 12px',
        borderRadius: 'var(--radius-buttons)',
        border: '1px solid var(--color-hairline)',
        background: 'rgba(212,212,212,0.06)',
        fontSize: 13,
        letterSpacing: '0.02em',
        color: 'var(--color-ash)'
      }}
    >
      <span
        style={{
          width: 7,
          height: 7,
          borderRadius: 9999,
          background: dot,
          animation: tone === 'live' ? 'listenly-pulse 1.6s ease-in-out infinite' : undefined
        }}
      />
      {children}
    </div>
  )
}

export function TextInput({
  value,
  onChange,
  placeholder,
  type = 'text',
  mono
}: {
  value: string
  onChange: (v: string) => void
  placeholder?: string
  type?: string
  mono?: boolean
}) {
  return (
    <input
      className="no-drag"
      type={type}
      value={value}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      spellCheck={false}
      style={{
        width: '100%',
        background: 'rgba(0,0,0,0.25)',
        border: '1px solid var(--color-hairline)',
        borderRadius: 'var(--radius-ui)',
        padding: '10px 12px',
        fontSize: 14,
        color: 'var(--color-bone)',
        outline: 'none',
        fontFamily: mono ? 'var(--font-geist)' : 'var(--font-dm-sans)',
        userSelect: 'text'
      }}
    />
  )
}
