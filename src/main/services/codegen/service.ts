import type { WebContents } from 'electron'
import { IPC, CODEGEN_PROVIDER_ORDER, CODEGEN_PROMPT_MAX_CHARS, PROVIDERS, type ProviderId } from '@shared/constants'
import type {
  CodeGenRequest,
  CodeGenResult,
  CodeSuggestion,
  RagChunk,
  Settings,
  TranscriptSegment
} from '@shared/types'
import { getSettings, setSettings } from '../settings'
import { getSecret } from '../secrets'
import { complete, cancel as cancelLlm } from '../llm/router'
import { query } from '../rag/store'
import { logInfo, logWarn, logError } from '../logger'
import { getOverlay } from '../../windows/overlayWindow'
import { countTokens, hashText, PROVIDER_REQUEST_BUDGET } from './tokenCounter'
import { getRelevantContext } from './transcriptContext'
import { detectCodeQuestion } from './questionDetector'
import { recordGeneration } from './history'
import {
  SCOPE_MAX_TOKENS,
  AllProvidersFailedError,
  CancelledError,
  buildCodeGenMessages,
  detectLanguage,
  parseCodeResponse,
  providerChain,
  runWithFallback
} from './generator'

/**
 * Orchestrates a code request end to end: context → prompt → provider chain
 * (streaming deltas to the requesting window) → parse + clean → usage record.
 * Also watches finalized transcript turns and offers the overlay a suggestion
 * when one looks like a technical ask.
 */

const cancelled = new Set<string>()
const MAX_AUTO_RETRY_WAIT_SEC = 20

export function cancelGeneration(requestId: string): void {
  cancelled.add(requestId)
  cancelLlm(requestId)
}

function send(target: WebContents, channel: string, payload: unknown): void {
  if (!target.isDestroyed()) target.send(channel, payload)
}

async function waitCancellable(ms: number, isCancelled: () => boolean): Promise<void> {
  const until = Date.now() + ms
  while (Date.now() < until) {
    if (isCancelled()) throw new CancelledError()
    await new Promise((r) => setTimeout(r, Math.min(250, until - Date.now())))
  }
}

/**
 * Fit the request inside the provider's budget: drop project notes first, then
 * older conversation turns, and only then shrink the output allowance.
 */
function fitToBudget(
  provider: ProviderId,
  build: (notes: RagChunk[], turns: number) => ReturnType<typeof buildCodeGenMessages>,
  notes: RagChunk[],
  desiredOutput: number
) {
  const budget = PROVIDER_REQUEST_BUDGET[provider]
  const measure = (msgs: ReturnType<typeof buildCodeGenMessages>) =>
    msgs.reduce((n, m) => n + countTokens(m.content, provider), 0)

  for (const [n, turns] of [
    [notes, 10],
    [[], 10],
    [[], 6],
    [[], 3],
    [[], 0]
  ] as [RagChunk[], number][]) {
    const messages = build(n, turns)
    const input = measure(messages)
    if (input + desiredOutput <= budget) return { messages, input, maxTokens: desiredOutput }
    if (turns === 0) {
      return { messages, input, maxTokens: Math.max(600, budget - input) }
    }
  }
  throw new Error('unreachable')
}

export async function generateCode(req: CodeGenRequest, target: WebContents): Promise<void> {
  const settings = getSettings()
  const cg = settings.codeGen
  const started = Date.now()
  const isCancelled = () => cancelled.has(req.requestId)

  try {
    if (!cg.enabled) throw new Error('Code generation is turned off in Settings.')
    const question = req.question.trim()
    if (!question) throw new Error('No question to answer yet.')

    const fullContext = getRelevantContext(req.transcript, 10)
    const language = detectLanguage(question, fullContext, cg.language)

    let notes: RagChunk[] = []
    try {
      notes = await query(question, 3)
    } catch (err) {
      // Same policy as the copilot: missing retrieval must not block an answer.
      logWarn('codegen', 'project-notes retrieval skipped', { error: (err as Error)?.message })
    }

    const build = (n: RagChunk[], turns: number) =>
      buildCodeGenMessages({
        systemPrompt: cg.systemPrompt,
        scope: req.scope,
        question,
        transcriptContext: turns ? getRelevantContext(req.transcript, turns) : '',
        language,
        notes: n
      })

    const chain = providerChain(req.provider ?? cg.provider, CODEGEN_PROVIDER_ORDER, (p) => !!getSecret(p), cg.fallback)

    const attempt = async (provider: ProviderId) => {
      const { messages, input, maxTokens } = fitToBudget(provider, build, notes, SCOPE_MAX_TOKENS[req.scope])
      let text = ''
      const { usage, model } = await complete({
        requestId: req.requestId,
        provider,
        messages,
        temperature: 0.2,
        maxTokens,
        onDelta: (delta) => {
          text += delta
          send(target, IPC.codegenChunk, { requestId: req.requestId, delta })
        }
      })
      if (!text.trim()) throw new Error('Empty response')
      return { text, usage, model, input }
    }

    const run = () =>
      runWithFallback(chain, attempt, {
        isCancelled,
        onFallback: (from, to, failure) => {
          logWarn('codegen', 'provider failed, falling back', { from, to, status: failure.status, error: failure.message })
          send(target, IPC.codegenStatus, {
            requestId: req.requestId,
            message: `${PROVIDERS[from].label} unavailable, trying ${PROVIDERS[to].label}…`,
            reset: true
          })
        }
      })

    let outcome: Awaited<ReturnType<typeof run>>
    try {
      outcome = await run()
    } catch (err) {
      // Everyone rate limited with a short wait: queue one automatic retry.
      if (!(err instanceof AllProvidersFailedError) || !err.rateLimited) throw err
      const wait = err.retryAfterSec ?? MAX_AUTO_RETRY_WAIT_SEC + 1
      if (wait > MAX_AUTO_RETRY_WAIT_SEC) throw err
      send(target, IPC.codegenStatus, {
        requestId: req.requestId,
        message: `Rate limited. Retrying in ${Math.ceil(wait)}s…`,
        reset: true
      })
      await waitCancellable(wait * 1000, isCancelled)
      outcome = await run()
    }

    const { value, provider } = outcome
    const parsed = parseCodeResponse(value.text, language, req.scope)
    const reported = (value.usage?.promptTokens ?? 0) + (value.usage?.completionTokens ?? 0)
    const result: CodeGenResult = {
      requestId: req.requestId,
      scope: req.scope,
      explanation: parsed.explanation,
      code: parsed.code,
      language: parsed.language,
      provider,
      model: value.model,
      tokensUsed: reported || value.input + countTokens(value.text, provider),
      tokensEstimated: !reported,
      timeMs: Date.now() - started
    }

    const keepText = settings.consent.retainTranscripts
    recordGeneration({
      id: req.requestId,
      at: Date.now(),
      scope: req.scope,
      provider,
      tokensUsed: result.tokensUsed,
      timeMs: result.timeMs,
      ok: true,
      language: result.language,
      ...(keepText ? { question, code: result.code } : {})
    })
    logInfo('codegen', 'generated', {
      scope: req.scope,
      provider,
      model: value.model,
      language: result.language,
      tokens: result.tokensUsed,
      timeMs: result.timeMs
    })
    send(target, IPC.codegenDone, result)
  } catch (err: any) {
    if (err instanceof CancelledError || isCancelled()) {
      send(target, IPC.codegenError, { requestId: req.requestId, message: 'Cancelled', cancelled: true })
      return
    }
    const message = err?.message ?? String(err)
    logError('codegen', 'generation failed', { scope: req.scope, error: err })
    recordGeneration({
      id: req.requestId,
      at: Date.now(),
      scope: req.scope,
      provider: null,
      tokensUsed: 0,
      timeMs: Date.now() - started,
      ok: false,
      error: message.slice(0, 300)
    })
    send(target, IPC.codegenError, { requestId: req.requestId, message })
  } finally {
    cancelled.delete(req.requestId)
  }
}

export function saveSystemPrompt(prompt: string): Settings {
  const cg = getSettings().codeGen
  const systemPrompt = prompt.slice(0, CODEGEN_PROMPT_MAX_CHARS)
  return setSettings({
    codeGen: {
      ...cg,
      systemPrompt,
      systemPromptHash: hashText(systemPrompt),
      systemPromptTokens: countTokens(systemPrompt, cg.provider)
    }
  })
}

// ---- Live detection --------------------------------------------------------

const SUGGESTION_COOLDOWN_MS = 8000
let lastSuggestionAt = 0
let lastSuggestionKey = ''

const normalize = (t: string) => t.toLowerCase().replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim()

export function handleTranscriptSegment(seg: TranscriptSegment): void {
  if (!seg.isFinal || seg.speaker !== 'them') return
  const cg = getSettings().codeGen
  if (!cg.enabled || !cg.autoDetect) return

  const detection = detectCodeQuestion(seg.text)
  if (!detection) return

  const key = normalize(detection.question)
  const now = Date.now()
  if (key === lastSuggestionKey || now - lastSuggestionAt < SUGGESTION_COOLDOWN_MS) return
  lastSuggestionKey = key
  lastSuggestionAt = now

  const suggestion: CodeSuggestion = {
    id: `cs-${now.toString(36)}`,
    question: detection.question,
    speaker: seg.speaker,
    intent: detection.intent,
    confidence: detection.confidence,
    recommendedScope: detection.recommendedScope,
    at: now
  }
  logInfo('codegen', 'technical question detected', {
    intent: detection.intent,
    confidence: detection.confidence
  })
  const overlay = getOverlay()
  if (overlay && !overlay.isDestroyed()) overlay.webContents.send(IPC.codegenSuggestion, suggestion)
}
