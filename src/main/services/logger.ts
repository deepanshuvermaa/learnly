import { app, shell } from 'electron'
import { appendFileSync, mkdirSync, readdirSync, statSync, unlinkSync } from 'fs'
import { join } from 'path'

/**
 * Per-session, crash-safe logger. One file per app launch under
 * userData/logs/session-<timestamp>.log. Writes are synchronous appends so that
 * even a hard crash leaves the last line on disk — the whole point is that when
 * something breaks, the log already has the answer.
 *
 * Volume is deliberately low: lifecycle, errors, and state changes only. Audio
 * frames and token streams are never logged.
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error'

let logPath = ''
let ready = false

function stamp(): string {
  return new Date().toISOString()
}

function errorReplacer(_key: string, value: unknown): unknown {
  if (value instanceof Error) {
    return { name: value.name, message: value.message, stack: value.stack }
  }
  return value
}

function fmt(data: unknown): string {
  if (data === undefined) return ''
  try {
    return ' ' + JSON.stringify(data, errorReplacer)
  } catch {
    return ' ' + String(data)
  }
}

export function initLogger(): string {
  const dir = join(app.getPath('userData'), 'logs')
  mkdirSync(dir, { recursive: true })
  pruneOldLogs(dir, 20)

  const fileStamp = new Date().toISOString().replace(/[:.]/g, '-')
  logPath = join(dir, `session-${fileStamp}.log`)
  ready = true

  log('info', 'app', `Listenly ${app.getVersion()} starting`, {
    platform: process.platform,
    arch: process.arch,
    electron: process.versions.electron,
    chrome: process.versions.chrome,
    node: process.versions.node,
    logPath
  })
  // Make the path trivially findable in a terminal too.
  // eslint-disable-next-line no-console
  console.log(`[listenly] session log: ${logPath}`)
  return logPath
}

function pruneOldLogs(dir: string, keep: number): void {
  try {
    const files = readdirSync(dir)
      .filter((f) => f.startsWith('session-') && f.endsWith('.log'))
      .map((f) => ({ f, t: statSync(join(dir, f)).mtimeMs }))
      .sort((a, b) => b.t - a.t)
    for (const { f } of files.slice(keep)) {
      try {
        unlinkSync(join(dir, f))
      } catch {
        /* ignore */
      }
    }
  } catch {
    /* ignore */
  }
}

export function log(level: LogLevel, scope: string, message: string, data?: unknown): void {
  const line = `${stamp()} [${level.toUpperCase()}] [${scope}] ${message}${fmt(data)}\n`
  if (ready && logPath) {
    try {
      appendFileSync(logPath, line)
    } catch {
      /* disk error — fall through to console */
    }
  }
  // eslint-disable-next-line no-console
  const sink = level === 'error' ? console.error : level === 'warn' ? console.warn : console.log
  sink(line.trimEnd())
}

export const logInfo = (scope: string, msg: string, data?: unknown) => log('info', scope, msg, data)
export const logWarn = (scope: string, msg: string, data?: unknown) => log('warn', scope, msg, data)
export const logError = (scope: string, msg: string, data?: unknown) => log('error', scope, msg, data)

export function getLogPath(): string {
  return logPath
}

/** Open the log folder in the OS file manager. */
export function revealLogs(): void {
  if (logPath) shell.showItemInFolder(logPath)
}
