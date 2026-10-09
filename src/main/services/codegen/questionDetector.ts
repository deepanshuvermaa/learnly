import type { CodeGenScope, CodeIntent } from '@shared/types'
import { cleanUtterance } from './transcriptContext'

/**
 * Decides whether a finalized turn from the other side is a technical ask worth
 * offering code for. Pure heuristics: it runs on every turn, so it can't cost a
 * model call. A turn needs an ask signal AND technical vocabulary to clear the
 * threshold; small talk and status check-ins are filtered out.
 */

export const DETECTION_THRESHOLD = 0.7

export interface Detection {
  question: string
  intent: CodeIntent
  confidence: number
  recommendedScope: CodeGenScope
}

const SMALL_TALK = [
  /\bhow (?:are|r) (?:you|u|things|we doing|y'all)\b/i,
  /\bhow(?:'s| is| was) (?:it going|everyone|everybody|your (?:day|weekend|morning|week|evening|trip|vacation)|the weekend|life|the family)\b/i,
  /\b(?:did|have) you (?:see|get|read|check) (?:the|my|our|his|her|their) (?:email|mail|message|invite|slack|calendar|deck)\b/i,
  /\bcan (?:you|everyone|everybody) (?:hear|see) (?:me|us|my screen)\b/i,
  /\b(?:are you|is everyone|is everybody) (?:there|here|ready|on mute|muted)\b/i,
  /\b(?:any (?:other )?questions|does that make sense|sound good|are we good|is that ok(?:ay)?)\s*\??$/i,
  /\b(?:lunch|coffee|weather|weekend|holiday|vacation)\b/i
]

const STATUS_CHECK =
  /\b(?:what(?:'s| is) the (?:status|eta|update|timeline)|is (?:it|that|this) (?:done|ready|merged|deployed|live|finished)|did (?:you|we|they) (?:finish|merge|deploy|ship|push|send|get a chance)|when (?:will|can|do) (?:you|we|it) (?:finish|ship|deploy|be done|be ready)|how (?:did|was) (?:the|your|it)\b)/i

const QUESTION_LEAD =
  /^(?:so|okay|ok|alright|and|then|now|also|well)?[, ]*(?:how|why|what|which|where|can|could|would|should|is there|do we|does|any idea)\b/i

const REQUEST =
  /\b(?:let'?s (?:design|build|write|implement|create|figure out|sketch|think through)|(?:can|could|would) you (?:write|show|code|walk|sketch|explain|implement|build|design|whip up|put together)|we need to|we have to|i need you to|how (?:do|would|should|can|could) (?:we|you|i|one)|how to|what(?:'s| is) the best way|best way to|is there a way to)\b/i

const INTENTS: [CodeIntent, RegExp][] = [
  ['debug', /\b(?:fix|bug|broken|failing|fails|crash(?:es|ing)?|error|exception|debug|not working|doesn'?t work|leak|race condition|deadlock|timing out)\b/i],
  ['design', /\b(?:design|architect(?:ure)?|structure|schema|model (?:the|this)|scalable|scale (?:this|it|to))\b/i],
  ['optimize', /\b(?:optimi[sz]e|faster|speed (?:it|this) up|performance|slow|bottleneck|complexity|efficient|latency)\b/i],
  ['implement', /\b(?:implement|build|write|code|create|add|set up|integrate|parse|convert|reverse|sort|validate|migrate|refactor)\b/i],
  ['explain', /\b(?:explain|how does|difference between|walk (?:me|us) through|what(?:'s| is) (?:a|an|the))\b/i]
]

const SCOPE_FOR_INTENT: Record<CodeIntent, CodeGenScope> = {
  debug: 'brute-force',
  design: 'walkthrough',
  optimize: 'walkthrough',
  implement: 'full-code',
  explain: 'walkthrough',
  'how-to': 'brute-force'
}

const TECH_TERMS = [
  'api', 'apis', 'endpoint', 'endpoints', 'rest', 'restful', 'graphql', 'grpc', 'webhook', 'websocket', 'http', 'https',
  'database', 'db', 'sql', 'postgres', 'postgresql', 'mysql', 'mongo', 'mongodb', 'redis', 'query', 'queries', 'index',
  'indexes', 'schema', 'migration', 'orm', 'transaction', 'sharding', 'replication', 'cache', 'caching', 'cdn',
  'queue', 'kafka', 'rabbitmq', 'pubsub', 'microservice', 'microservices', 'service', 'server', 'backend', 'frontend',
  'auth', 'authentication', 'authorization', 'oauth', 'jwt', 'token', 'tokens', 'session', 'login', 'password', 'hashing',
  'function', 'method', 'class', 'interface', 'module', 'library', 'package', 'dependency', 'algorithm', 'array', 'arrays',
  'string', 'strings', 'linked list', 'hash map', 'hashmap', 'dictionary', 'tree', 'binary tree', 'graph', 'stack', 'heap',
  'recursion', 'recursive', 'binary search', 'sorting', 'dynamic programming', 'time complexity', 'big o', 'o\\(n\\)',
  'palindrome', 'fibonacci', 'two sum', 'thread', 'threads', 'async', 'await', 'promise', 'concurrency', 'mutex', 'lock',
  'race condition', 'deadlock', 'memory leak', 'null pointer', 'stack trace', 'exception', 'bug', 'regex', 'json', 'csv',
  'xml', 'yaml', 'parse', 'parser', 'serialize', 'deploy', 'deployment', 'docker', 'kubernetes', 'k8s', 'ci', 'pipeline',
  'lambda', 'serverless', 'aws', 'gcp', 'azure', 's3', 'load balancer', 'rate limit', 'rate limiting', 'rate limiter',
  'pagination', 'latency', 'throughput', 'unit test', 'unit tests', 'integration test', 'crud', 'react', 'component',
  'hook', 'state', 'redux', 'node', 'nodejs', 'express', 'typescript', 'javascript', 'python', 'django', 'flask',
  'fastapi', 'golang', 'java', 'spring', 'rust', 'bash', 'shell script', 'script', 'cron', 'code', 'refactor', 'repo'
]

const TECH_RE = new RegExp(`\\b(?:${TECH_TERMS.join('|')})(?![\\w])`, 'gi')

function techTermCount(text: string): number {
  const found = new Set((text.match(TECH_RE) ?? []).map((t) => t.toLowerCase()))
  return found.size
}

/** The sentence carrying the ask, plus the one before it for context. */
function extractAsk(text: string): string {
  const sentences = text.match(/[^.?!]+[.?!]?/g)?.map((s) => s.trim()).filter(Boolean) ?? [text]
  let idx = -1
  for (let i = sentences.length - 1; i >= 0; i--) {
    const s = sentences[i]
    if (s.endsWith('?') || QUESTION_LEAD.test(s) || REQUEST.test(s)) {
      idx = i
      break
    }
  }
  if (idx === -1) return text.slice(-400)
  return sentences.slice(Math.max(0, idx - 1), idx + 1).join(' ').slice(-400)
}

export function detectCodeQuestion(raw: string): Detection | null {
  const text = cleanUtterance(raw)
  const words = text.split(/\s+/).filter(Boolean).length
  if (words < 3) return null

  const question = extractAsk(text)
  if (SMALL_TALK.some((re) => re.test(question))) return null

  const asksQuestion = /\?/.test(question)
  const leadsWithQuestion = QUESTION_LEAD.test(question)
  const isRequest = REQUEST.test(question)
  const terms = techTermCount(text)
  const intent = INTENTS.find(([, re]) => re.test(question))?.[0] ?? 'how-to'

  let score = 0
  if (asksQuestion) score += 0.3
  if (leadsWithQuestion) score += 0.1
  if (isRequest) score += 0.35
  score += Math.min(terms, 3) * 0.17
  if (intent !== 'explain' && intent !== 'how-to') score += 0.15
  if (words < 5) score -= 0.2
  if (STATUS_CHECK.test(question)) score -= 0.45
  // No technical vocabulary at all: never confident enough to interrupt.
  if (terms === 0) score = Math.min(score, 0.5)
  // No ask at all: a technical statement isn't a question.
  if (!asksQuestion && !leadsWithQuestion && !isRequest) score = Math.min(score, 0.5)

  const confidence = Math.max(0, Math.min(1, Math.round(score * 100) / 100))
  if (confidence < DETECTION_THRESHOLD) return null
  return { question, intent, confidence, recommendedScope: SCOPE_FOR_INTENT[intent] }
}
