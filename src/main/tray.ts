import { Tray, Menu, nativeImage, app } from 'electron'
import { toggleOverlay, openSettingsWindow, getOverlay } from './windows/overlayWindow'

let tray: Tray | null = null

// A tiny embedded 16x16 dot icon so the app has a tray presence without shipping
// a binary asset in this scaffold. Replace with resources/trayTemplate.png later.
const ICON_DATA =
  'iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAWklEQVR4nGNgGAWjYBSMglEwCkbBKBgFo2AUjIJRMApGwSgYBaNgFIyCUTAKRsEoGAWjYBSMglEwCkbBKBgFo2AUjIJRMApGwSgYBaNgFIyCUTAKRgEAAJ0AAeH0Q3AAAAAASUVORK5CYII='

export function createTray(): void {
  if (tray) return
  const icon = nativeImage.createFromDataURL(`data:image/png;base64,${ICON_DATA}`)
  tray = new Tray(icon)
  tray.setToolTip('Listenly')
  const menu = Menu.buildFromTemplate([
    { label: 'Toggle overlay', click: () => toggleOverlay() },
    { label: 'Settings…', click: () => openSettingsWindow() },
    { type: 'separator' },
    { label: 'Quit Listenly', click: () => app.quit() }
  ])
  tray.setContextMenu(menu)
  tray.on('click', () => {
    getOverlay()?.isVisible() ? toggleOverlay() : toggleOverlay()
  })
}
