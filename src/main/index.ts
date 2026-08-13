import { app, BrowserWindow, session, systemPreferences } from 'electron'
import { createOverlayWindow, openSettingsWindow } from './windows/overlayWindow'
import { registerIpc } from './ipc/handlers'
import { registerShortcuts, unregisterShortcuts } from './shortcuts'
import { createTray } from './tray'
import { getSettings } from './services/settings'
import { initLogger, logInfo, logError } from './services/logger'

// Capture anything that would otherwise crash silently. Registered before
// anything else runs so early failures are recorded too.
process.on('uncaughtException', (err) => logError('main', 'uncaughtException', err))
process.on('unhandledRejection', (reason) => logError('main', 'unhandledRejection', reason))

// Single-instance: a second launch just reveals the overlay.
if (!app.requestSingleInstanceLock()) {
  app.quit()
}

app.on('second-instance', () => {
  const win = createOverlayWindow()
  win.show()
})

// Loopback/system-audio capture via getDisplayMedia needs a display-media
// request handler. We auto-grant here (the user is capturing their own screen)
// and let the renderer pick the source. Requires Electron 30+.
function wireDisplayMedia(): void {
  try {
    // Grant system loopback audio for getDisplayMedia. The renderer's constraints
    // decide whether audio is actually pulled. (useSystemPicker is available on
    // newer Electron; on 31 the built-in picker/handler path is used.)
    session.defaultSession.setDisplayMediaRequestHandler((_request, callback) => {
      callback({ video: undefined as any, audio: 'loopback' as any })
    })
  } catch {
    // Older Electron without setDisplayMediaRequestHandler — renderer falls back.
  }
}

app.whenReady().then(async () => {
  initLogger()

  // macOS gates microphone access; ask up front so capture doesn't fail silently.
  if (process.platform === 'darwin') {
    try {
      await systemPreferences.askForMediaAccess('microphone')
    } catch {
      /* user can grant later in System Settings → Privacy */
    }
  }

  wireDisplayMedia()
  registerIpc()

  const settings = getSettings()
  if (!settings.onboarded) {
    openSettingsWindow() // onboarding lives inside the settings shell
  }
  createOverlayWindow()
  createTray()
  registerShortcuts()
  logInfo('app', 'ready — windows, tray, shortcuts initialised', { onboarded: settings.onboarded })

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createOverlayWindow()
  })
})

// The overlay lives in the tray; closing windows should not quit the app.
app.on('window-all-closed', () => {
  // Keep running in the tray on all platforms.
})

app.on('will-quit', () => {
  unregisterShortcuts()
})
