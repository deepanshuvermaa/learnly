import { PROVIDERS, CODE_LANGUAGES, type ProviderId } from '@shared/constants'
import type { ChatMessage, CodeGenScope, CodeLanguage, RagChunk } from '@shared/types'
import { normalizeLanguage, sanitizeCode } from './qualityFilter'

/**
 * Pure pieces of code generation: prompt assembly per scope, language
 * inference, response parsing, and the provider fallback loop. No Electron
 * imports, so all of it runs under the plain-Node test scripts.
 */

export const SCOPE_MAX_TOKENS: Record<CodeGenScope, number> = {
  'brute-force': 900,
  walkthrough: 2400,
  'full-code': 6000
}

const SCOPE_INSTRUCTIONS: Record<CodeGenScope, string> = {
  'brute-force': [
    'Explain the approach in 2-3 conversational sentences.',
    'Then give the minimal working code: the core function only, no imports, no comments, no logging.',
    'Prefer the simplest correct solution over the cleverest one.'
  ].join('\n'),
  walkthrough: [
    'Explain the approach in 3-4 sentences, the way you would talk it through with your lead.',
    'Then give 50-100 lines of code with short inline comments at the decision points,',
    'saying why each choice was made (data structure, trade-off, edge case), not what the syntax does.'
  ].join('\n'),
  'full-code': [
    'Explain the approach in 2-3 sentences.',
    'Then give production-ready code (roughly 150-400 lines, whatever the problem actually needs):',
    '- validate inputs at the boundary and handle the errors that can really happen, not every line',
    '- real imports for the libraries you use',
    '- specific, domain-named identifiers (no temp/data/result/foo)',
    '- the async style that is idiomatic for the language',
    '- sparse comments, only where the reason is not obvious from the code'
  ].join('\n')
}

const LANGUAGE_GUIDANCE: Record<CodeLanguage, string> = {
  typescript: 'TypeScript: strict types, destructuring, optional chaining, async/await, no `any`.',
  javascript: 'JavaScript: modern ES2022 syntax, destructuring, async/await, const by default.',
  python: 'Python: type hints, one-line docstrings at most, an `if __name__ == "__main__":` entry point when the code is runnable.',
  go: 'Go: explicit `if err != nil` handling with wrapped errors, context.Context as the first parameter for I/O.',
  java: 'Java: records for data carriers, Optional instead of null returns, constructor injection.',
  rust: 'Rust: Result-based error handling with `?`, no unwrap() outside tests.',
  sql: 'SQL: uppercase keywords, one clause per line, explicit column lists (never SELECT *), parameter placeholders.',
  bash: 'Bash: `set -euo pipefail`, quoted variables, functions for repeated logic.'
}

const LANGUAGE_HINTS: [CodeLanguage, RegExp][] = [
  ['python', /\b(?:python|django|flask|fastapi|pandas|numpy|pytest|pip|pydantic)\b/i],
  ['go', /\b(?:golang|goroutines?|go (?:service|module|routine|code)|in go\b)/i],
  ['rust', /\b(?:rust|cargo|tokio|crate)\b/i],
  ['java', /\b(?:java|spring|jvm|maven|gradle|kotlin)\b/i],
  ['sql', /\b(?:sql|postgres(?:ql)?|mysql|sqlite|query|queries|join|select|stored procedure|index on)\b/i],
  ['bash', /\b(?:bash|shell script|cron ?job|zsh|command line script)\b/i],
  ['javascript', /\b(?:javascript|vanilla js|node\.?js script|plain js)\b/i],
  ['typescript', /\b(?:typescript|react|angular|nestjs|next\.?js|node|express|frontend)\b/i]
]

export function detectLanguage(
  question: string,
  context: string,
  preference: CodeLanguage | 'auto'
): CodeLanguage {
  if (preference !== 'auto') return preference
  // The question itself is the strongest signal; fall back to the conversation.
  for (const source of [question, context]) {
    const hit = LANGUAGE_HINTS.find(([, re]) => re.test(source))
    if (hit) return hit[0]
  }
  return 'typescript'
}

export function languageLabel(language: CodeLanguage): string {
  return CODE_LANGUAGES.find((l) => l.id === language)?.label ?? language
}

export function buildCodeGenMessages(args: {
  systemPrompt: string
  scope: CodeGenScope
  question: string
  transcriptContext: string
  language: CodeLanguage
  notes: RagChunk[]
}): ChatMessage[] {
  const { systemPrompt, scope, question, transcriptContext, language, notes } = args

  const system = [
    systemPrompt.trim(),
    '',
    '## Output format',
    'Reply with the explanation as plain prose first, then the code in a single fenced block',
    `tagged with the language (\`\`\`${language === 'bash' ? 'bash' : language}). Nothing after the code block.`,
    'Write code the way a careful senior engineer on this team would commit it: idiomatic, specific names,',
    'no placeholder TODOs, no debug logging, no commented-out code.',
    LANGUAGE_GUIDANCE[language]
  ].join('\n')

  const notesBlock = notes.length
    ? notes.map((c, i) => `[${i + 1}] (source: ${c.source})\n${c.text}`).join('\n\n')
    : ''

  const user = [
    `Question: "${question.trim()}"`,
    '',
    '## Recent conversation',
    transcriptContext || '(none)',
    ...(notesBlock
      ? ['', '## Project notes (match these conventions and dependencies where relevant)', notesBlock]
      : []),
    '',
    '## Task',
    `Language: ${languageLabel(language)}.`,
    SCOPE_INSTRUCTIONS[scope]
  ].join('\n')

  return [
    { role: 'system', content: system },
    { role: 'user', content: user }
  ]
}

export interface ParsedResponse {
  explanation: string
  code: string
  language: CodeLanguage
}

/** Splits a model reply into prose (explanation) and fenced code. */
export function parseCodeResponse(
  text: string,
  fallbackLanguage: CodeLanguage,
  scope: CodeGenScope
): ParsedResponse {
  const fence = /```([\w+#.-]*)[^\n]*\n([\s\S]*?)(?:```|$)/g
  const blocks: { lang: string; body: string }[] = []
  let prose = text
  let m: RegExpExecArray | null
  while ((m = fence.exec(text))) {
    blocks.push({ lang: m[1], body: m[2] })
    prose = prose.replace(m[0], '\n')
  }
  const language = normalizeLanguage(blocks[0]?.lang) ?? fallbackLanguage
  const code = blocks.length ? blocks.map((b) => b.body).join('\n\n') : ''
  const explanation = prose
    .replace(/^#+\s.*$/gm, '')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
  return { explanation, code: code ? sanitizeCode(code, language, scope) : '', language }
}

// ---- Provider fallback -----------------------------------------------------

export class CancelledError extends Error {
  constructor() {
    super('Cancelled')
    this.name = 'CancelledError'
  }
}

export interface ProviderFailure {
  provider: ProviderId
  message: string
  status?: number
  retryAfterSec?: number
}

export class AllProvidersFailedError extends Error {
  constructor(public failures: ProviderFailure[]) {
    super(describeFailures(failures))
    this.name = 'AllProvidersFailedError'
  }

  /** Every provider was rate limited — the request is worth retrying later. */
  get rateLimited(): boolean {
    return this.failures.length > 0 && this.failures.every((f) => f.status === 429)
  }

  get retryAfterSec(): number | undefined {
    const waits = this.failures.map((f) => f.retryAfterSec).filter((n): n is number => n != null)
    return waits.length ? Math.min(...waits) : undefined
  }
}

function describeFailures(failures: ProviderFailure[]): string {
  if (!failures.length) return 'No provider with an API key is configured for code generation.'
  if (failures.every((f) => f.status === 429)) {
    const wait = Math.min(...failures.map((f) => f.retryAfterSec ?? 30))
    return `Rate limited. Try again in ${Math.ceil(wait)} seconds.`
  }
  const detail = failures.map((f) => `${PROVIDERS[f.provider].label}: ${f.message.slice(0, 160)}`).join(' · ')
  return `Code generation failed. Check API keys or internet. (${detail})`
}

/**
 * Preferred provider first, then the standard order, keeping only providers
 * that have a key. With fallback off, only the preferred provider is tried.
 */
export function providerChain(
  preferred: ProviderId,
  order: ProviderId[],
  hasKey: (p: ProviderId) => boolean,
  fallback: boolean
): ProviderId[] {
  const chain = fallback ? [preferred, ...order.filter((p) => p !== preferred)] : [preferred]
  return chain.filter(hasKey)
}

export async function runWithFallback<T>(
  chain: ProviderId[],
  attempt: (provider: ProviderId) => Promise<T>,
  hooks: {
    isCancelled: () => boolean
    onFallback?: (from: ProviderId, to: ProviderId, failure: ProviderFailure) => void
  }
): Promise<{ value: T; provider: ProviderId }> {
  const failures: ProviderFailure[] = []
  for (let i = 0; i < chain.length; i++) {
    const provider = chain[i]
    if (hooks.isCancelled()) throw new CancelledError()
    try {
      return { value: await attempt(provider), provider }
    } catch (err: any) {
      if (hooks.isCancelled()) throw new CancelledError()
      const failure: ProviderFailure = {
        provider,
        message: err?.message ?? String(err),
        status: err?.status,
        retryAfterSec: err?.retryAfterSec
      }
      failures.push(failure)
      const next = chain[i + 1]
      if (next) hooks.onFallback?.(provider, next, failure)
    }
  }
  throw new AllProvidersFailedError(failures)
}
