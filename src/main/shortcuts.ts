import { globalShortcut, BrowserWindow } from 'electron'
import { IPC } from '@shared/constants'
import type { Settings } from '@shared/types'
import { getSettings, setSettings } from './services/settings'
import { toggleOverlay, getOverlay } from './windows/overlayWindow'
import { logWarn } from './services/logger'

type ShortcutName = keyof Settings['shortcuts']

/**
 * Global shortcuts work even when the meeting app is focused (that's the point).
 * "Ask now", "toggle click-through" and "toggle code panel" are forwarded to the
 * overlay renderer as events so the UI reacts; "toggle overlay" is handled here
 * directly. Returns the names whose accelerator couldn't be registered (invalid,
 * or already claimed by another app).
 */
export function registerShortcuts(): ShortcutName[] {
  globalShortcut.unregisterAll()
  const settings = getSettings()
  const s = settings.shortcuts
  const failed: ShortcutName[] = []

  const safeRegister = (name: ShortcutName, fn: () => void) => {
    const accel = s[name]
    if (!accel) return
    try {
      if (!globalShortcut.register(accel, fn)) failed.push(name)
    } catch {
      failed.push(name) // invalid accelerator string
    }
  }

  safeRegister('toggleOverlay', () => toggleOverlay())
  safeRegister('askNow', () => forwardToOverlay('shortcut:ask-now'))
  safeRegister('toggleClickThrough', () => forwardToOverlay('shortcut:toggle-clickthrough'))
  if (settings.codeGen.enabled) {
    safeRegister('toggleCodePanel', () => forwardToOverlay(IPC.shortcutToggleCodePanel))
  }
  if (failed.length) logWarn('shortcuts', 'some shortcuts could not be registered', { failed })
  return failed
}

/** Persist a new accelerator and re-register everything; reports whether it took. */
export function setShortcut(name: ShortcutName, accel: string): { ok: boolean; failed: ShortcutName[] } {
  setSettings({ shortcuts: { ...getSettings().shortcuts, [name]: accel } })
  const failed = registerShortcuts()
  return { ok: !failed.includes(name), failed }
}

export function isShortcutRegistered(name: ShortcutName): boolean {
  const accel = getSettings().shortcuts[name]
  try {
    return !!accel && globalShortcut.isRegistered(accel)
  } catch {
    return false
  }
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
