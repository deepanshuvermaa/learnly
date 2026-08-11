import WebSocket from 'ws'
import type { Speaker, TranscriptSegment } from '@shared/types'
import type { SttEngine, SttStartOptions } from './types'

/**
 * Deepgram live transcription. We open one socket per speaker channel so that
 * 'me' (mic) and 'them' (system loopback) are diarised by construction — cleaner
 * and lower-latency than post-hoc diarisation on a mixed stream. The API key
 * lives here in the main process and is never exposed to the renderer.
 */
export class DeepgramEngine implements SttEngine {
  readonly id = 'deepgram' as const
  private sockets = new Map<Speaker, WebSocket>()
  private opts!: SttStartOptions
  private transcriptCb: (seg: TranscriptSegment) => void = () => {}
  private stateCb: (s: 'connecting' | 'live' | 'closed' | 'error', d?: string) => void = () => {}
  private seq = 0

  constructor(private apiKey: string) {}

  async start(opts: SttStartOptions): Promise<void> {
    this.opts = opts
    this.stateCb('connecting')
    // Sockets are opened lazily on first audio frame per channel to avoid holding
    // idle connections (Deepgram closes idle sockets after ~10s).
  }

  private ensureSocket(speaker: Speaker): WebSocket {
    const existing = this.sockets.get(speaker)
    if (existing && existing.readyState === WebSocket.OPEN) return existing
    if (existing && existing.readyState === WebSocket.CONNECTING) return existing

    const params = new URLSearchParams({
      model: this.opts.model,
      language: this.opts.language,
      encoding: 'linear16',
      sample_rate: String(this.opts.sampleRate),
      channels: '1',
      interim_results: 'true',
      smart_format: 'true',
      punctuate: 'true'
    })
    const ws = new WebSocket(`wss://api.deepgram.com/v1/listen?${params.toString()}`, {
      headers: { Authorization: `Token ${this.apiKey}` }
    })

    ws.on('open', () => this.stateCb('live'))
    ws.on('message', (raw) => this.handleMessage(speaker, raw.toString()))
    ws.on('error', (err) => this.stateCb('error', err.message))
    ws.on('close', () => {
      this.sockets.delete(speaker)
    })
    this.sockets.set(speaker, ws)
    return ws
  }

  private handleMessage(speaker: Speaker, raw: string): void {
    let msg: any
    try {
      msg = JSON.parse(raw)
    } catch {
      return
    }
    if (msg.type && msg.type !== 'Results') return
    const alt = msg.channel?.alternatives?.[0]
    const text: string = alt?.transcript ?? ''
    if (!text) return
    this.transcriptCb({
      id: `${speaker}-${this.seq++}`,
      speaker,
      text,
      isFinal: Boolean(msg.is_final),
      startMs: Math.round((msg.start ?? 0) * 1000),
      endMs: Math.round(((msg.start ?? 0) + (msg.duration ?? 0)) * 1000)
    })
  }

  pushAudio(speaker: Speaker, pcm: Buffer): void {
    const ws = this.ensureSocket(speaker)
    if (ws.readyState === WebSocket.OPEN) ws.send(pcm)
  }

  async stop(): Promise<void> {
    for (const ws of this.sockets.values()) {
      try {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'CloseStream' }))
        }
        ws.close()
      } catch {
        /* ignore */
      }
    }
    this.sockets.clear()
    this.stateCb('closed')
  }

  onTranscript(cb: (seg: TranscriptSegment) => void): void {
    this.transcriptCb = cb
  }
  onState(cb: (s: 'connecting' | 'live' | 'closed' | 'error', d?: string) => void): void {
    this.stateCb = cb
  }
}
