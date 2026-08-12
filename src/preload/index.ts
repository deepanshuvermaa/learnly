import { contextBridge, ipcRenderer } from 'electron'
import { IPC } from '@shared/constants'
import type {
  Settings,
  SecretsStatus,
  CompleteRequest,
  RagChunk,
  RagDocument,
  ChatMessage,
  TranscriptSegment,
  Session,
  SecretKey
} from '@shared/types'

/**
 * The single, audited bridge between renderer and main. contextIsolation is on
 * and the renderer has no direct Node/ipcRenderer access — only these methods.
 */
const api = {
  settings: {
    get: (): Promise<Settings> => ipcRenderer.invoke(IPC.settingsGet),
    set: (patch: Partial<Settings>): Promise<Settings> => ipcRenderer.invoke(IPC.settingsSet, patch)
  },
  secrets: {
    set: (key: SecretKey, value: string): Promise<SecretsStatus> =>
      ipcRenderer.invoke(IPC.secretsSet, key, value),
    clear: (key: SecretKey): Promise<SecretsStatus> => ipcRenderer.invoke(IPC.secretsClear, key),
    status: (): Promise<SecretsStatus> => ipcRenderer.invoke(IPC.secretsStatus)
  },
  llm: {
    complete: (req: CompleteRequest) => ipcRenderer.invoke(IPC.llmComplete, req),
    cancel: (requestId: string) => ipcRenderer.invoke(IPC.llmCancel, requestId),
    onChunk: (cb: (p: { requestId: string; delta: string }) => void) =>
      subscribe(IPC.llmStreamChunk, cb),
    onDone: (cb: (p: { requestId: string; usage?: unknown }) => void) =>
      subscribe(IPC.llmStreamDone, cb),
    onError: (cb: (p: { requestId: string; message: string }) => void) =>
      subscribe(IPC.llmStreamError, cb)
  },
  copilot: {
    prepare: (args: {
      transcript: TranscriptSegment[]
      explicitQuestion?: string
    }): Promise<{ messages: ChatMessage[]; context: RagChunk[] }> =>
      ipcRenderer.invoke(IPC.copilotPrepare, args)
  },
  stt: {
    start: (): Promise<{ ok: boolean; error?: string }> => ipcRenderer.invoke(IPC.sttStart),
    stop: (): Promise<void> => ipcRenderer.invoke(IPC.sttStop),
    sendAudio: (speaker: 'me' | 'them', pcm: ArrayBuffer) =>
      ipcRenderer.send(IPC.sttAudio, { speaker, pcm }),
    onTranscript: (cb: (seg: TranscriptSegment) => void) => subscribe(IPC.sttTranscript, cb),
    onState: (cb: (p: { state: string; detail?: string }) => void) => subscribe(IPC.sttState, cb)
  },
  rag: {
    ingestText: (source: string, text: string): Promise<RagDocument> =>
      ipcRenderer.invoke(IPC.ragIngestText, source, text),
    ingestFiles: (): Promise<RagDocument[]> => ipcRenderer.invoke(IPC.ragIngestFiles),
    query: (text: string, topK?: number): Promise<RagChunk[]> =>
      ipcRenderer.invoke(IPC.ragQuery, text, topK),
    list: (): Promise<RagDocument[]> => ipcRenderer.invoke(IPC.ragList),
    deleteDoc: (id: string): Promise<void> => ipcRenderer.invoke(IPC.ragDelete, id),
    clear: (): Promise<void> => ipcRenderer.invoke(IPC.ragClear)
  },
  system: {
    platform: process.platform,
    pickFile: (opts?: { title?: string; extensions?: string[] }): Promise<string> =>
      ipcRenderer.invoke(IPC.dialogPickFile, opts)
  },
  overlay: {
    toggle: () => ipcRenderer.invoke(IPC.overlayToggle),
    setInteractive: (v: boolean) => ipcRenderer.invoke(IPC.overlaySetInteractive, v),
    setContentProtection: (v: boolean) => ipcRenderer.invoke(IPC.overlaySetContentProtection, v),
    move: (dx: number, dy: number) => ipcRenderer.invoke(IPC.overlayMove, dx, dy),
    openSettings: () => ipcRenderer.invoke(IPC.windowOpenSettings)
  },
  sessions: {
    save: (s: Session): Promise<Session | null> => ipcRenderer.invoke(IPC.sessionSave, s),
    list: () => ipcRenderer.invoke(IPC.sessionList),
    load: (id: string): Promise<Session | null> => ipcRenderer.invoke(IPC.sessionLoad, id),
    delete: (id: string) => ipcRenderer.invoke(IPC.sessionDelete, id)
  },
  shortcuts: {
    onAskNow: (cb: () => void) => subscribe('shortcut:ask-now', () => cb()),
    onToggleClickThrough: (cb: () => void) => subscribe('shortcut:toggle-clickthrough', () => cb())
  }
}

function subscribe(channel: string, cb: (...args: any[]) => void): () => void {
  const listener = (_e: Electron.IpcRendererEvent, ...args: any[]) => cb(...args)
  ipcRenderer.on(channel, listener)
  return () => ipcRenderer.removeListener(channel, listener)
}

contextBridge.exposeInMainWorld('listenly', api)

export type ListenlyApi = typeof api
