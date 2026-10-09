import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { streamChat, LlmHttpError } from '../src/main/services/llm/client'
import type { TranscriptSegment } from '@shared/types'
import { detectCodeQuestion, DETECTION_THRESHOLD } from '../src/main/services/codegen/questionDetector'
import { cleanUtterance, getRelevantContext } from '../src/main/services/codegen/transcriptContext'
import { sanitizeCode, normalizeLanguage } from '../src/main/services/codegen/qualityFilter'
import { countTokens, estimateTokens, hashText } from '../src/main/services/codegen/tokenCounter'
import {
  AllProvidersFailedError,
  buildCodeGenMessages,
  detectLanguage,
  parseCodeResponse,
  providerChain,
  runWithFallback
} from '../src/main/services/codegen/generator'

let passed = 0
async function test(name: string, fn: () => void | Promise<void>) {
  try {
    await fn()
    passed++
  } catch (err) {
    console.error(`FAIL ${name}`)
    throw err
  }
}

const seg = (id: string, speaker: 'me' | 'them', text: string, isFinal = true): TranscriptSegment => ({
  id,
  speaker,
  text,
  isFinal,
  startMs: 0,
  endMs: 0
})

async function main() {
  // ---- Question detection --------------------------------------------------
  await test('detects technical asks', () => {
    for (const q of [
      'How do we implement JWT auth for the REST API?',
      'Can you write a function to reverse a linked list?',
      "Let's design the caching layer for the product service with Redis.",
      'We need to add rate limiting to the login endpoint.',
      'Why is the checkout service so slow under load?',
      "What's the time complexity of that?",
      'So the job keeps crashing. How would you fix the memory leak in the worker queue?'
    ]) {
      const d = detectCodeQuestion(q)
      assert.ok(d, `expected detection: ${q}`)
      assert.ok(d.confidence >= DETECTION_THRESHOLD)
    }
  })

  await test('ignores small talk, status checks and non-technical questions', () => {
    for (const q of [
      'How are you doing today?',
      'Did you see the email about the deploy?',
      'Can everyone see my screen?',
      'How was the database migration yesterday?',
      'What do you think about the new office?',
      'Is the API down?',
      'Okay sounds good.',
      'We use Postgres and Redis in production.'
    ]) {
      assert.equal(detectCodeQuestion(q), null, `expected no detection: ${q}`)
    }
  })

  await test('classifies intent and extracts the asking sentence', () => {
    const d = detectCodeQuestion(
      'We shipped the new billing flow last week. Customers love it. How would you fix the race condition in the payment webhook handler?'
    )!
    assert.equal(d.intent, 'debug')
    assert.equal(d.recommendedScope, 'brute-force')
    assert.ok(d.question.startsWith('Customers love it.'))
    assert.equal(detectCodeQuestion("Let's design the schema for the orders database?")!.intent, 'design')
  })

  // ---- Transcript context --------------------------------------------------
  await test('cleans fillers and stutters', () => {
    assert.equal(cleanUtterance('Um, so the the API, uh, returns you know a 500'), 'so the API, returns a 500')
  })

  await test('builds compact context from final turns', () => {
    const ctx = getRelevantContext([
      seg('1', 'them', 'We have a Node service.'),
      seg('2', 'them', 'It talks to Postgres.'),
      seg('3', 'me', 'Okay.'),
      seg('4', 'them', 'interim words', false),
      seg('5', 'me', 'Um, which ORM do we use?'),
      seg('6', 'them', 'Prisma.')
    ])
    assert.equal(ctx, '[Them]: We have a Node service. It talks to Postgres.\n[Me]: which ORM do we use?\n[Them]: Prisma.')
    assert.equal(getRelevantContext([seg('1', 'them', 'a b c'), seg('2', 'me', 'd e f')], 1), '[Me]: d e f')
  })

  // ---- Quality filter ------------------------------------------------------
  await test('strips debug output and TODO markers in JS/TS', () => {
    const out = sanitizeCode(
      [
        'export async function getUser(id: string) {',
        '\tconsole.log("fetching", id)',
        '\t// TODO: add caching',
        '\tconst user = await db.user.find(id) // FIXME later',
        '\tconsole.log(',
        '\t  user',
        '\t)',
        '\tdebugger;',
        '\treturn user',
        '}'
      ].join('\n'),
      'typescript',
      'walkthrough'
    )
    assert.equal(out, 'export async function getUser(id: string) {\n  const user = await db.user.find(id)\n  return user\n}')
  })

  await test('keeps a log that is the body of a brace-less if', () => {
    const code = 'if (failed)\n  console.log("retrying")\nretry()'
    assert.equal(sanitizeCode(code, 'javascript', 'full-code'), code)
  })

  await test('python: keeps prints in __main__, replaces sole-statement print with pass', () => {
    const out = sanitizeCode(
      [
        'def handle(event):',
        '    print(event)',
        '',
        'def total(items):',
        '    # Step 1: now we sum',
        '    print("debug")',
        '    return sum(items)',
        '',
        'if __name__ == "__main__":',
        '    print(total([1, 2]))'
      ].join('\n'),
      'python',
      'full-code'
    )
    assert.equal(
      out,
      [
        'def handle(event):',
        '    pass',
        '',
        'def total(items):',
        '    return sum(items)',
        '',
        'if __name__ == "__main__":',
        '    print(total([1, 2]))'
      ].join('\n')
    )
  })

  await test('brute force drops comments, walkthrough keeps them, go keeps tabs', () => {
    const code = '// helper\nfunction add(a, b) {\n  // why: avoid float drift\n  return a + b\n}'
    assert.equal(sanitizeCode(code, 'javascript', 'brute-force'), 'function add(a, b) {\n  return a + b\n}')
    assert.equal(sanitizeCode(code, 'javascript', 'walkthrough'), code)
    assert.equal(sanitizeCode('func f() {\n\treturn\n}', 'go', 'full-code'), 'func f() {\n\treturn\n}')
    assert.equal(sanitizeCode('#!/bin/bash\n# TODO x\necho hi', 'bash', 'brute-force'), '#!/bin/bash\necho hi')
  })

  await test('normalizes fence tags', () => {
    assert.equal(normalizeLanguage('tsx'), 'typescript')
    assert.equal(normalizeLanguage('golang'), 'go')
    assert.equal(normalizeLanguage('postgresql'), 'sql')
    assert.equal(normalizeLanguage('brainfuck'), null)
  })

  // ---- Token counting ------------------------------------------------------
  await test('token estimates per provider', () => {
    const text = 'a'.repeat(400)
    assert.equal(countTokens(text, 'groq'), 100)
    assert.equal(countTokens(text, 'gemini'), 115)
    assert.equal(countTokens('one two three four five six seven eight nine ten', 'openai'), 13)
    assert.equal(countTokens('', 'groq'), 0)
    assert.deepEqual(estimateTokens('abcd', 'abcdefgh', 50, 'groq'), { prompt: 1, context: 2, output: 50, total: 53 })
    assert.equal(hashText('x').length, 64)
  })

  // ---- Generator -----------------------------------------------------------
  await test('detects language from question, then context, then default', () => {
    assert.equal(detectLanguage('Write a FastAPI endpoint', '', 'auto'), 'python')
    assert.equal(detectLanguage('How would we paginate this?', '[Them]: our Go service uses pgx', 'auto'), 'go')
    assert.equal(detectLanguage('Reverse a linked list', '', 'auto'), 'typescript')
    assert.equal(detectLanguage('Write a FastAPI endpoint', '', 'rust'), 'rust')
  })

  await test('builds scope-specific messages with project notes', () => {
    const msgs = buildCodeGenMessages({
      systemPrompt: 'Persona.',
      scope: 'brute-force',
      question: 'Reverse a linked list',
      transcriptContext: '[Them]: hi',
      language: 'python',
      notes: [{ id: 'n', source: 'package.json', text: '{"deps":{}}' }]
    })
    assert.equal(msgs.length, 2)
    assert.ok(msgs[0].content.startsWith('Persona.'))
    assert.ok(msgs[0].content.includes('```python'))
    assert.ok(msgs[1].content.includes('minimal working code'))
    assert.ok(msgs[1].content.includes('source: package.json'))
  })

  await test('parses explanation and code, cleaning the code', () => {
    const parsed = parseCodeResponse(
      "I'd keep a **pointer** to the previous node and flip links as we walk.\n\n```py\ndef reverse(head):\n    # TODO tidy\n    prev = None\n    return prev\n```\n",
      'typescript',
      'walkthrough'
    )
    assert.equal(parsed.language, 'python')
    assert.equal(parsed.explanation, "I'd keep a pointer to the previous node and flip links as we walk.")
    assert.equal(parsed.code, 'def reverse(head):\n    prev = None\n    return prev')
    // Truncated stream (no closing fence) still yields the code.
    assert.equal(parseCodeResponse('ok\n```ts\nconst a = 1', 'javascript', 'full-code').code, 'const a = 1')
  })

  await test('provider chain: preferred first, keyed only, fallback toggle', () => {
    const order = ['groq', 'gemini', 'openai', 'xai', 'moonshot'] as const
    const keyed = new Set(['gemini', 'openai'])
    assert.deepEqual(providerChain('openai', [...order], (p) => keyed.has(p), true), ['openai', 'gemini'])
    assert.deepEqual(providerChain('groq', [...order], (p) => keyed.has(p), true), ['gemini', 'openai'])
    assert.deepEqual(providerChain('openai', [...order], (p) => keyed.has(p), false), ['openai'])
  })

  await test('fallback walks the chain and reports rate limits', async () => {
    const hops: string[] = []
    const res = await runWithFallback(
      ['groq', 'gemini', 'openai'],
      async (p) => {
        if (p !== 'openai') throw Object.assign(new Error(`${p} down`), { status: 503 })
        return 'code'
      },
      { isCancelled: () => false, onFallback: (from, to) => hops.push(`${from}->${to}`) }
    )
    assert.deepEqual(res, { value: 'code', provider: 'openai' })
    assert.deepEqual(hops, ['groq->gemini', 'gemini->openai'])

    const err = await runWithFallback(
      ['groq', 'gemini'],
      async (p) => {
        throw Object.assign(new Error('429'), { status: 429, retryAfterSec: p === 'groq' ? 7.5 : 12 })
      },
      { isCancelled: () => false }
    ).catch((e) => e)
    assert.ok(err instanceof AllProvidersFailedError)
    assert.equal(err.rateLimited, true)
    assert.equal(err.retryAfterSec, 7.5)
    assert.equal(err.message, 'Rate limited. Try again in 8 seconds.')

    const none = await runWithFallback([], async () => 'x', { isCancelled: () => false }).catch((e) => e)
    assert.match(none.message, /No provider with an API key/)
  })

  await test('client streams SSE and surfaces 429 status + retry-after', async () => {
    const server = createServer((req, res) => {
      if (req.headers.authorization === 'Bearer limited') {
        res.writeHead(429, { 'Content-Type': 'application/json' })
        res.end('{"error":{"message":"Rate limit reached. Please try again in 1m7.5s."}}')
        return
      }
      res.writeHead(200, { 'Content-Type': 'text/event-stream' })
      res.write('data: {"choices":[{"delta":{"content":"Use a "}}]}\n\n')
      res.write('data: {"choices":[{"delta":{"content":"set.\\n```py\\nx = 1\\n```"}}]}\n\n')
      res.write('data: {"choices":[],"usage":{"prompt_tokens":40,"completion_tokens":12}}\n\n')
      res.end('data: [DONE]\n\n')
    })
    await new Promise<void>((r) => server.listen(0, r))
    const baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
    try {
      let text = ''
      const ok = await streamChat({ baseUrl, apiKey: 'ok', model: 'm', messages: [], onDelta: (d) => (text += d) })
      assert.deepEqual(ok.usage, { promptTokens: 40, completionTokens: 12 })
      const parsed = parseCodeResponse(text, 'typescript', 'brute-force')
      assert.equal(parsed.explanation, 'Use a set.')
      assert.equal(parsed.code, 'x = 1')

      const err = await streamChat({ baseUrl, apiKey: 'limited', model: 'm', messages: [], onDelta: () => {} }).catch((e) => e)
      assert.ok(err instanceof LlmHttpError)
      assert.equal(err.status, 429)
      assert.equal(err.retryAfterSec, 67.5)
    } finally {
      server.close()
    }
  })

  console.log(`codegen: ${passed} tests passed`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
