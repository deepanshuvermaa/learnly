import { ipcMain, dialog, BrowserWindow } from 'electron'
import { promises as fs } from 'fs'
import { basename } from 'path'
import { IPC } from '@shared/constants'
import type { CompleteRequest, Session, TranscriptSegment, RagChunk } from '@shared/types'
import { getSettings, setSettings } from '../services/settings'
import { setSecret, clearSecret, secretsStatus, type SecretKey } from '../services/secrets'
import { complete, cancel } from '../services/llm/router'
import { buildMessages } from '../services/prompt'
import { ingestText, query, listDocuments, clearAll } from '../services/rag/store'
import { sttManager } from '../services/stt/manager'
import { saveSession, listSessions, loadSession, deleteSession } from '../services/sessions'
import {
  applyContentProtection,
  setInteractive,
  toggleOverlay,
  openSettingsWindow,
  getOverlay
} from '../windows/overlayWindow'

function senderWindow(e: Electron.IpcMainInvokeEvent): BrowserWindow | null {
  return BrowserWindow.fromWebContents(e.sender)
}

export function registerIpc(): void {
  // ---- Settings & secrets -------------------------------------------------
  ipcMain.handle(IPC.settingsGet, () => getSettings())
  ipcMain.handle(IPC.settingsSet, (_e, patch) => setSettings(patch))
  ipcMain.handle(IPC.secretsSet, (_e, key: SecretKey, value: string) => {
    setSecret(key, value)
    return secretsStatus()
  })
  ipcMain.handle(IPC.secretsClear, (_e, key: SecretKey) => {
    clearSecret(key)
    return secretsStatus()
  })
  ipcMain.handle(IPC.secretsStatus, () => secretsStatus())

  // ---- LLM streaming ------------------------------------------------------
  ipcMain.handle(IPC.llmComplete, async (e, req: CompleteRequest) => {
    const sender = e.sender
    try {
      const { usage } = await complete({
        requestId: req.requestId,
        provider: req.provider,
        model: req.model,
        messages: req.messages,
        temperature: req.temperature,
        maxTokens: req.maxTokens,
        onDelta: (delta) => {
          if (!sender.isDestroyed()) sender.send(IPC.llmStreamChunk, { requestId: req.requestId, delta })
        }
      })
      if (!sender.isDestroyed()) sender.send(IPC.llmStreamDone, { requestId: req.requestId, usage })
    } catch (err: any) {
      if (!sender.isDestroyed())
        sender.send(IPC.llmStreamError, { requestId: req.requestId, message: err?.message ?? String(err) })
    }
    return { started: true }
  })
  ipcMain.handle(IPC.llmCancel, (_e, requestId: string) => cancel(requestId))

  // ---- STT ----------------------------------------------------------------
  ipcMain.handle(IPC.sttStart, async () => sttManager.start())
  ipcMain.handle(IPC.sttStop, async () => sttManager.stop())
  // High-frequency audio frames use .on (fire-and-forget), not .handle.
  ipcMain.on(IPC.sttAudio, (_e, payload: { speaker: 'me' | 'them'; pcm: ArrayBuffer }) => {
    sttManager.pushAudio(payload.speaker, Buffer.from(payload.pcm))
  })

  // ---- RAG ----------------------------------------------------------------
  ipcMain.handle(IPC.ragIngestText, (_e, source: string, text: string) => ingestText(source, text))
  ipcMain.handle(IPC.ragIngestFiles, async (e) => {
    const win = senderWindow(e)
    const res = await dialog.showOpenDialog(win!, {
      title: 'Add to knowledge base',
      properties: ['openFile', 'multiSelections'],
      filters: [{ name: 'Text & docs', extensions: ['txt', 'md', 'markdown', 'csv', 'json'] }]
    })
    if (res.canceled) return []
    const docs = []
    for (const path of res.filePaths) {
      const text = await fs.readFile(path, 'utf8')
      docs.push(await ingestText(basename(path), text))
    }
    return docs
  })
  ipcMain.handle(IPC.ragQuery, (_e, text: string, topK?: number) => query(text, topK))
  ipcMain.handle(IPC.ragList, () => listDocuments())
  ipcMain.handle(IPC.ragClear, () => clearAll())

  // ---- Copilot: retrieve context + build messages in one call -------------
  // The renderer owns transcript state; it sends it here so retrieval + prompt
  // assembly stay server-side (keys, embeddings) and the renderer just streams.
  ipcMain.handle(
    IPC.copilotPrepare,
    async (_e, args: { transcript: TranscriptSegment[]; explicitQuestion?: string }) => {
      const settings = getSettings()
      const q =
        args.explicitQuestion ??
        [...args.transcript].reverse().find((s) => s.speaker === 'them' && s.isFinal)?.text ??
        args.transcript.slice(-1)[0]?.text ??
        ''
      let context: RagChunk[] = []
      try {
        if (q) context = await query(q, settings.copilot.maxContextChunks)
      } catch {
        // Retrieval failing (e.g. no embedding key) must not block a plain answer.
      }
      const messages = buildMessages({
        systemPrompt: settings.copilot.systemPrompt,
        transcript: args.transcript,
        context,
        explicitQuestion: args.explicitQuestion
      })
      return { messages, context }
    }
  )

  // ---- Overlay controls ---------------------------------------------------
  ipcMain.handle(IPC.overlayToggle, () => toggleOverlay())
  ipcMain.handle(IPC.overlaySetInteractive, (_e, interactive: boolean) => setInteractive(interactive))
  ipcMain.handle(IPC.overlaySetContentProtection, (_e, enabled: boolean) => {
    setSettings({ overlay: { ...getSettings().overlay, contentProtection: enabled } })
    applyContentProtection(enabled)
  })
  ipcMain.handle(IPC.overlayMove, (_e, dx: number, dy: number) => {
    const o = getOverlay()
    if (!o) return
    const [x, y] = o.getPosition()
    o.setPosition(x + dx, y + dy)
  })
  ipcMain.handle(IPC.windowOpenSettings, () => {
    openSettingsWindow() // do NOT return the BrowserWindow — it isn't IPC-cloneable
  })
  ipcMain.handle(IPC.dialogPickFile, async (e, opts?: { title?: string; extensions?: string[] }) => {
    const win = senderWindow(e)
    const res = await dialog.showOpenDialog(win!, {
      title: opts?.title ?? 'Choose a file',
      properties: ['openFile'],
      filters: opts?.extensions?.length ? [{ name: 'Files', extensions: opts.extensions }] : undefined
    })
    return res.canceled ? '' : res.filePaths[0]
  })

  // ---- Sessions -----------------------------------------------------------
  ipcMain.handle(IPC.sessionSave, (_e, session: Session) => {
    if (!getSettings().consent.retainTranscripts) return null
    return saveSession(session)
  })
  ipcMain.handle(IPC.sessionList, () => listSessions())
  ipcMain.handle(IPC.sessionLoad, (_e, id: string) => loadSession(id))
  ipcMain.handle(IPC.sessionDelete, (_e, id: string) => deleteSession(id))
}
