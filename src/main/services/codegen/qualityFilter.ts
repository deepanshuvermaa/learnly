import type { CodeGenScope, CodeLanguage } from '@shared/types'

/**
 * Mechanical cleanup of model output before it's shown: leftover debug
 * statements, TODO/FIXME markers, narration comments ("Step 1: now we…"), tab
 * indentation and blank-line runs. Everything here is line-based and
 * conservative — when removing a line could change what the code does (a
 * brace-less `if` body, the only statement in a Python block), it's kept or
 * replaced with a no-op instead. Style that needs real understanding of the code
 * (naming, error-handling shape) is asked for in the prompt, not rewritten here.
 */

const LINE_COMMENT: Record<CodeLanguage, string> = {
  typescript: '//',
  javascript: '//',
  go: '//',
  java: '//',
  rust: '//',
  python: '#',
  bash: '#',
  sql: '--'
}

const MARKER = /\b(?:TODO|FIXME|XXX|HACK|NOTE)\b/

const NARRATION =
  /^(?:step \d+\b|now,? (?:we|let'?s)\b|here,? we\b|this (?:function|line|code|block) (?:will|is used to)\b|we (?:then|now)\b|first,? we\b|next,? we\b|finally,? we\b|import (?:the )?(?:necessary|required)\b)/i

const DEBUG_START: Partial<Record<CodeLanguage, RegExp>> = {
  typescript: /^\s*(?:console\.(?:log|debug|trace)\s*\(|debugger\s*;?\s*$)/,
  javascript: /^\s*(?:console\.(?:log|debug|trace)\s*\(|debugger\s*;?\s*$)/,
  python: /^\s*(?:print\s*\(|breakpoint\s*\(\s*\)|import pdb\b|pdb\.set_trace\s*\()/,
  rust: /^\s*dbg!\s*\(/
}

const ALIASES: Record<string, CodeLanguage> = {
  ts: 'typescript', tsx: 'typescript', typescript: 'typescript',
  js: 'javascript', jsx: 'javascript', mjs: 'javascript', node: 'javascript', javascript: 'javascript',
  py: 'python', python: 'python', python3: 'python',
  go: 'go', golang: 'go',
  java: 'java',
  rs: 'rust', rust: 'rust',
  sql: 'sql', postgres: 'sql', postgresql: 'sql', mysql: 'sql', plpgsql: 'sql', sqlite: 'sql',
  sh: 'bash', bash: 'bash', shell: 'bash', zsh: 'bash', console: 'bash'
}

export function normalizeLanguage(tag: string | undefined): CodeLanguage | null {
  if (!tag) return null
  return ALIASES[tag.trim().toLowerCase()] ?? null
}

const indentOf = (line: string) => line.match(/^\s*/)![0].length

function parenDelta(line: string): number {
  let d = 0
  for (const ch of line.replace(/(["'`])(?:\\.|(?!\1).)*\1/g, '')) {
    if (ch === '(') d++
    else if (ch === ')') d--
  }
  return d
}

function prevNonBlank(lines: string[], i: number): string | undefined {
  for (let j = i - 1; j >= 0; j--) if (lines[j].trim()) return lines[j]
  return undefined
}

function nextNonBlank(lines: string[], i: number): string | undefined {
  for (let j = i + 1; j < lines.length; j++) if (lines[j].trim()) return lines[j]
  return undefined
}

function removeDebugStatements(lines: string[], language: CodeLanguage): string[] {
  const start = DEBUG_START[language]
  if (!start) return lines
  const out: string[] = []
  let inPythonMain = false
  let mainIndent = 0

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (language === 'python') {
      if (/^\s*if __name__\s*==\s*['"]__main__['"]\s*:/.test(line)) {
        inPythonMain = true
        mainIndent = indentOf(line)
      } else if (inPythonMain && line.trim() && indentOf(line) <= mainIndent) {
        inPythonMain = false
      }
    }
    // Output in a script's entry point is the point of it, not debug noise.
    if (!start.test(line) || inPythonMain) {
      out.push(line)
      continue
    }

    // `if (x)\n  console.log(y)` — dropping the body would re-target the if.
    const prev = prevNonBlank(lines, i)
    if (prev && /^\s*(?:if|else|for|while)\b[^{]*$/.test(prev) && !/[;{}]\s*$/.test(prev) && language !== 'python') {
      out.push(line)
      continue
    }

    // Swallow multi-line calls until parentheses balance.
    let depth = parenDelta(line)
    let end = i
    while (depth > 0 && end + 1 < lines.length) {
      end++
      depth += parenDelta(lines[end])
    }

    if (language === 'python' && prev?.trimEnd().endsWith(':')) {
      const next = nextNonBlank(lines, end)
      if (!next || indentOf(next) < indentOf(line)) out.push(`${' '.repeat(indentOf(line))}pass`)
    }
    i = end
  }
  return out
}

function stripComments(lines: string[], language: CodeLanguage, scope: CodeGenScope): string[] {
  const marker = LINE_COMMENT[language]
  const escaped = marker.replace(/[/]/g, '\\/')
  const whole = new RegExp(`^\\s*${escaped}\\s?(.*)$`)
  const trailingMarker = new RegExp(`\\s+${escaped}\\s*(?:TODO|FIXME|XXX|HACK|NOTE)\\b.*$`)

  const out: string[] = []
  for (const line of lines) {
    const m = line.match(whole)
    if (m) {
      // Shebangs and encoding pragmas are directives, not comments.
      if (/^#!/.test(line) || /coding[:=]/.test(line)) {
        out.push(line)
        continue
      }
      const body = m[1].trim()
      if (MARKER.test(body)) continue
      if (scope === 'brute-force') continue
      if (scope === 'full-code' && NARRATION.test(body)) continue
      out.push(line)
      continue
    }
    out.push(line.replace(trailingMarker, ''))
  }
  return out
}

export function sanitizeCode(code: string, language: CodeLanguage, scope: CodeGenScope): string {
  let lines = code.replace(/\r\n?/g, '\n').split('\n')

  if (language !== 'go') {
    const width = language === 'python' || language === 'java' || language === 'rust' ? 4 : 2
    lines = lines.map((l) => l.replace(/^\t+/, (tabs) => ' '.repeat(tabs.length * width)))
  }
  lines = lines.map((l) => l.replace(/\s+$/, ''))
  lines = removeDebugStatements(lines, language)
  lines = stripComments(lines, language, scope)

  return lines
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/^\n+|\n+$/g, '')
}
