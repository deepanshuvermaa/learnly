import Store from 'electron-store'
import type { Session } from '@shared/types'
import { perfMonitor } from './performanceMonitor'
import { metricsCollector } from './metricsCollector'
import { logInfo } from './logger'

/**
 * Meeting sessions (transcript + suggestions) persisted on-device. Retention is
 * governed by settings.consent.retainTranscripts — the IPC layer refuses to save
 * when the user has opted out.
 */
const store = new Store<{ sessions: Record<string, Session> }>({ name: 'listenly-sessions' })

export function saveSession(session: Session): Session {
  const startTime = Date.now()
  const sessions = store.get('sessions', {})
  const next = { ...session, updatedAt: Date.now() }
  sessions[session.id] = next

  const saveDurationMs = Date.now() - startTime
  const lines = session.transcript?.length ?? 0
  const characters = session.transcript?.reduce((sum, t) => sum + t.text.length, 0) ?? 0
  const turns = new Set(session.transcript?.map(t => t.speaker)).size

  perfMonitor.recordOperation({
    name: 'session:save',
    durationMs: saveDurationMs,
    timestamp: startTime,
    tags: { sessionId: session.id, lines, characters, turns },
    success: true
  })

  metricsCollector.recordTranscriptStats(lines, characters, turns, saveDurationMs)
  logInfo('session', 'Session saved', { sessionId: session.id, lines, characters, turns, durationMs: saveDurationMs })

  store.set('sessions', sessions)
  return next
}

export function listSessions(): Array<Pick<Session, 'id' | 'title' | 'createdAt' | 'updatedAt'>> {
  const sessions = store.get('sessions', {})
  return Object.values(sessions)
    .map(({ id, title, createdAt, updatedAt }) => ({ id, title, createdAt, updatedAt }))
    .sort((a, b) => b.updatedAt - a.updatedAt)
}

export function loadSession(id: string): Session | null {
  return store.get('sessions', {})[id] ?? null
}

export function deleteSession(id: string): void {
  const sessions = store.get('sessions', {})
  delete sessions[id]
  store.set('sessions', sessions)
}
