import Store from 'electron-store'
import type { ProviderId } from '@shared/constants'
import type { CodeGenRecord, CodeGenStats } from '@shared/types'

/**
 * Local usage log for code generation. Running totals are kept separately from
 * the capped record list so stats stay accurate after old records roll off.
 */
const MAX_RECORDS = 50

interface Totals {
  generations: number
  failures: number
  tokens: number
  timeMs: number
  byProvider: Partial<Record<ProviderId, number>>
}

const emptyTotals = (): Totals => ({ generations: 0, failures: 0, tokens: 0, timeMs: 0, byProvider: {} })

const store = new Store<{ records: CodeGenRecord[]; totals: Totals }>({
  name: 'listenly-codegen',
  defaults: { records: [], totals: emptyTotals() }
})

export function recordGeneration(record: CodeGenRecord): void {
  store.set('records', [record, ...store.get('records')].slice(0, MAX_RECORDS))
  const t = store.get('totals')
  if (record.ok) {
    t.generations++
    t.tokens += record.tokensUsed
    t.timeMs += record.timeMs
    if (record.provider) t.byProvider[record.provider] = (t.byProvider[record.provider] ?? 0) + 1
  } else {
    t.failures++
  }
  store.set('totals', t)
}

export function getStats(): CodeGenStats {
  const t = store.get('totals')
  return {
    totalGenerations: t.generations,
    failures: t.failures,
    totalTokens: t.tokens,
    avgTimeMs: t.generations ? Math.round(t.timeMs / t.generations) : 0,
    byProvider: t.byProvider
  }
}

export function getHistory(): CodeGenRecord[] {
  return store.get('records')
}

export function clearHistory(): void {
  store.set({ records: [], totals: emptyTotals() })
}
