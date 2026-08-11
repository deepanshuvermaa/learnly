import { globalShortcut, BrowserWindow } from 'electron'
import { IPC } from '@shared/constants'
import { getSettings } from './services/settings'
import { toggleOverlay, getOverlay } from './windows/overlayWindow'

/**
 * Global shortcuts work even when the meeting app is focused (that's the point).
 * "Ask now" and "toggle click-through" are forwarded to the overlay renderer as
 * events so the UI reacts; "toggle overlay" is handled here directly.
 */
export function registerShortcuts(): void {
  globalShortcut.unregisterAll()
  const s = getSettings().shortcuts

  const safeRegister = (accel: string, fn: () => void) => {
    if (!accel) return
    try {
      globalShortcut.register(accel, fn)
    } catch {
      /* invalid accelerator string — ignore */
    }
  }

  safeRegister(s.toggleOverlay, () => toggleOverlay())
  safeRegister(s.askNow, () => forwardToOverlay('shortcut:ask-now'))
  safeRegister(s.toggleClickThrough, () => forwardToOverlay('shortcut:toggle-clickthrough'))
}

function forwardToOverlay(channel: string): void {
  const o = getOverlay()
  if (o && !o.isDestroyed()) {
    if (!o.isVisible()) o.show()
    o.webContents.send(channel)
  }
}

export function unregisterShortcuts(): void {
  globalShortcut.unregisterAll()
}

// Re-export for callers that only need the IPC constant surface nearby.
export { IPC }
export type { BrowserWindow }
