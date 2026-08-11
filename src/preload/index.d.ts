import type { ListenlyApi } from './index'

declare global {
  interface Window {
    listenly: ListenlyApi
  }
}

export {}
