export const is = {
  dev: !!process.env.ELECTRON_RENDERER_URL || !require('electron').app.isPackaged
}
