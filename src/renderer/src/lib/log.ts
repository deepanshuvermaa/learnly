/**
 * Renderer logging. Every call is forwarded to the main process so it lands in
 * the single per-session log file alongside main-process events. Also installs
 * global handlers so uncaught renderer errors and promise rejections are never
 * silent — the whole reason this exists is so failures show up in the log
 * without anyone having to reproduce and narrate them.
 */
type Level = 'debug' | 'info' | 'warn' | 'error'

function send(level: Level, scope: string, message: string, data?: unknown): void {
  try {
    window.listenly.log.write(level, scope, message, data)
  } catch {
    /* preload not ready — ignore */
  }
}

export const rlog = {
  info: (scope: string, msg: string, data?: unknown) => send('info', scope, msg, data),
  warn: (scope: string, msg: string, data?: unknown) => send('warn', scope, msg, data),
  error: (scope: string, msg: string, data?: unknown) => send('error', scope, msg, data)
}

function serializeError(e: unknown) {
  if (e instanceof Error) return { name: e.name, message: e.message, stack: e.stack }
  return e
}

let installed = false
export function installGlobalErrorCapture(): void {
  if (installed) return
  installed = true

  window.addEventListener('error', (ev) => {
    rlog.error('window', ev.message || 'error', {
      source: ev.filename,
      line: ev.lineno,
      col: ev.colno,
      error: serializeError(ev.error)
    })
  })

  window.addEventListener('unhandledrejection', (ev) => {
    rlog.error('window', 'unhandledrejection', { reason: serializeError(ev.reason) })
  })

  // Mirror console.error into the log without breaking the real console.
  const origError = console.error.bind(console)
  console.error = (...args: unknown[]) => {
    try {
      rlog.error('console', args.map((a) => (a instanceof Error ? a.message : String(a))).join(' '), {
        detail: args.map(serializeError)
      })
    } catch {
      /* ignore */
    }
    origError(...args)
  }
}
