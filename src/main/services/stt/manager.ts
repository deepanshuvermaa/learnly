import { BrowserWindow } from 'electron'
import type { Speaker, TranscriptSegment } from '@shared/types'
import { IPC } from '@shared/constants'
import { getSettings } from '../settings'
import { getSecret } from '../secrets'
import type { SttEngine } from './types'
import { DeepgramEngine } from './deepgram'
import { WhisperLocalEngine } from './whisper'
import { logInfo, logWarn, logError } from '../logger'
import { perfMonitor } from '../performanceMonitor'
import { metricsCollector } from '../metricsCollector'

/**
 * Owns the lifecycle of the active STT engine and fans transcript/state events
 * out to every renderer window. The IPC layer feeds audio frames in here.
 */
class SttManager {
  private engine: SttEngine | null = null
  private listeners = new Set<(seg: TranscriptSegment) => void>()
  readonly sampleRate = 16000

  /** Main-process consumers of the transcript (e.g. code-question detection). */
  onTranscript(cb: (seg: TranscriptSegment) => void): () => void {
    this.listeners.add(cb)
    return () => this.listeners.delete(cb)
  }

  get active(): boolean {
    return this.engine !== null
  }

  async start(): Promise<{ ok: boolean; error?: string }> {
    const settings = getSettings()
    if (settings.stt.engine === 'off') return { ok: false, error: 'STT is disabled in settings.' }

    if (settings.stt.engine === 'deepgram') {
      const key = getSecret('deepgram')
      if (!key) {
        logWarn('stt', 'start blocked — no Deepgram key')
        return { ok: false, error: 'No Deepgram API key set.' }
      }
      this.engine = new DeepgramEngine(key)
    } else {
      this.engine = new WhisperLocalEngine()
    }

    this.engine.onTranscript((seg) => {
      this.broadcast(IPC.sttTranscript, seg)
      for (const cb of this.listeners) {
        try {
          cb(seg)
        } catch (err) {
          logError('stt', 'transcript listener failed', err)
        }
      }
    })
    this.engine.onState((state, detail) => {
      if (state === 'error') logError('stt', 'engine error', { engine: settings.stt.engine, detail })
      else logInfo('stt', `state: ${state}`, detail ? { detail } : undefined)
      this.broadcast(IPC.sttState, { state, detail })
    })

    try {
      await this.engine.start({
        language: settings.stt.language,
        model: settings.stt.deepgramModel,
        sampleRate: this.sampleRate
      })
      logInfo('stt', 'started', { engine: settings.stt.engine })
      return { ok: true }
    } catch (err: any) {
      logError('stt', 'start failed', err)
      this.engine = null
      return { ok: false, error: err?.message ?? String(err) }
    }
  }

  pushAudio(speaker: Speaker, pcm: Buffer): void {
    this.engine?.pushAudio(speaker, pcm)
  }

  async stop(): Promise<void> {
    await this.engine?.stop()
    this.engine = null
  }

  private broadcast(channel: string, payload: unknown): void {
    for (const win of BrowserWindow.getAllWindows()) {
      if (!win.isDestroyed()) win.webContents.send(channel, payload)
    }
  }
}

export const sttManager = new SttManager()
