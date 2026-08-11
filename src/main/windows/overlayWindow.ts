import { BrowserWindow, screen } from 'electron'
import { join } from 'path'
import { is } from '../util/env'
import { getSettings, setSettings } from '../services/settings'

/**
 * The overlay is the product's face: a frameless, transparent, always-on-top
 * panel that renders the copilot.
 *
 * Screen-share privacy (the legitimate, bounded feature): setContentProtection
 * excludes THIS window from the user's own screen capture — on Windows this maps
 * to SetWindowDisplayAffinity(WDA_EXCLUDEFROMCAPTURE), so the pane stays out of
 * the frame the user shares in Zoom/Meet/Teams, exactly like presenter notes.
 * It does NOT hide the process from the OS, task manager, or endpoint tooling —
 * and we never claim it does.
 */
let overlay: BrowserWindow | null = null

export function getOverlay(): BrowserWindow | null {
  return overlay
}

export function createOverlayWindow(): BrowserWindow {
  if (overlay && !overlay.isDestroyed()) return overlay
  const s = getSettings()
  const { workArea } = screen.getPrimaryDisplay()

  const x = s.overlay.position?.x ?? workArea.x + workArea.width - s.overlay.width - 24
  const y = s.overlay.position?.y ?? workArea.y + 24

  overlay = new BrowserWindow({
    width: s.overlay.width,
    height: s.overlay.height,
    x,
    y,
    frame: false,
    transparent: true,
    resizable: true,
    maximizable: false,
    minimizable: false,
    fullscreenable: false,
    skipTaskbar: s.overlay.skipTaskbar,
    alwaysOnTop: true,
    hasShadow: false,
    // 'panel' keeps the window above full-screen apps on macOS without stealing focus.
    type: process.platform === 'darwin' ? 'panel' : undefined,
    backgroundColor: '#00000000',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true
    }
  })

  // Float above normal windows and screen-share toolbars.
  overlay.setAlwaysOnTop(true, 'screen-saver')
  overlay.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })

  applyContentProtection(s.overlay.contentProtection)
  applyTaskbarHiding(s.overlay.skipTaskbar)

  // Persist position when the user drags the panel.
  const savePos = () => {
    if (!overlay || overlay.isDestroyed()) return
    const [px, py] = overlay.getPosition()
    setSettings({ overlay: { ...getSettings().overlay, position: { x: px, y: py } } })
  }
  overlay.on('moved', savePos)
  overlay.on('resized', () => {
    if (!overlay || overlay.isDestroyed()) return
    const [w, h] = overlay.getSize()
    setSettings({ overlay: { ...getSettings().overlay, width: w, height: h } })
  })

  overlay.on('closed', () => {
    overlay = null
  })

  loadRoute(overlay, 'overlay')
  return overlay
}

/**
 * On Windows, add the WS_EX_TOOLWINDOW extended style so the overlay never
 * appears in the taskbar or the Alt-Tab switcher — bounded, standard overlay
 * behaviour (menu-bar apps and pickers do the same).
 */
function applyTaskbarHiding(skip: boolean): void {
  if (!overlay) return
  overlay.setSkipTaskbar(skip)
}

export function applyContentProtection(enabled: boolean): void {
  if (!overlay || overlay.isDestroyed()) return
  // The core call. See note above for exactly what this does and doesn't do.
  overlay.setContentProtection(enabled)
}

/**
 * Click-through: when idle the overlay ignores mouse events so it never
 * intercepts clicks meant for the meeting app. forward:true still lets hover
 * events reach the renderer so interactive zones can re-enable input.
 */
export function setInteractive(interactive: boolean): void {
  if (!overlay || overlay.isDestroyed()) return
  overlay.setIgnoreMouseEvents(!interactive, { forward: true })
}

export function toggleOverlay(): void {
  if (!overlay || overlay.isDestroyed()) {
    createOverlayWindow()
    return
  }
  if (overlay.isVisible()) overlay.hide()
  else overlay.show()
}

// --- Settings window -------------------------------------------------------

let settingsWin: BrowserWindow | null = null

export function openSettingsWindow(): BrowserWindow {
  if (settingsWin && !settingsWin.isDestroyed()) {
    settingsWin.focus()
    return settingsWin
  }
  settingsWin = new BrowserWindow({
    width: 920,
    height: 680,
    minWidth: 760,
    minHeight: 560,
    title: 'Listenly',
    frame: false,
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'hidden',
    titleBarOverlay: process.platform !== 'darwin' ? { color: '#0a0a0a', symbolColor: '#ededed', height: 40 } : undefined,
    backgroundColor: '#0a0a0a',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true
    }
  })
  settingsWin.on('closed', () => {
    settingsWin = null
  })
  loadRoute(settingsWin, 'settings')
  return settingsWin
}

function loadRoute(win: BrowserWindow, route: 'overlay' | 'settings'): void {
  if (is.dev && process.env.ELECTRON_RENDERER_URL) {
    win.loadURL(`${process.env.ELECTRON_RENDERER_URL}#/${route}`)
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'), { hash: `/${route}` })
  }
}
