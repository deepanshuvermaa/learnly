import { app, BrowserWindow, session, systemPreferences, desktopCapturer } from 'electron'
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
    // Grant system loopback audio for getDisplayMedia. Electron 31 requires a
    // real DesktopCapturerSource for the video field even when we only want
    // audio, so we hand it a screen source; the renderer immediately drops the
    // video track and keeps only the loopback audio. This also means no
    // "pick a screen / Share audio" prompt appears — capture just starts.
    session.defaultSession.setDisplayMediaRequestHandler((_request, callback) => {
      desktopCapturer
        .getSources({ types: ['screen'] })
        .then((sources) => {
          if (sources.length > 0) {
            callback({ video: sources[0], audio: 'loopback' as any })
          } else {
            logError('capture', 'no screen source available for loopback audio')
            callback({} as any)
          }
        })
        .catch((err) => {
          logError('capture', 'desktopCapturer.getSources failed', err)
          callback({} as any)
        })
    })
  } catch (err) {
    logError('capture', 'setDisplayMediaRequestHandler unavailable', err)
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
