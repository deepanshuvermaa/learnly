import WebSocket from 'ws'
import type { Speaker, TranscriptSegment } from '@shared/types'
import type { SttEngine, SttStartOptions } from './types'

/**
 * Deepgram live transcription with TURN AGGREGATION.
 *
 * Deepgram finalizes on short pauses, so a single spoken question arrives as many
 * small `is_final` fragments ("I just went through your" / "resume." / "explain
 * the project" …). We do NOT treat each fragment as a complete thought. Instead
 * we buffer all fragments per speaker into a "turn" and only emit a final segment
 * when Deepgram signals the speaker actually stopped (the `UtteranceEnd` event,
 * driven by `utterance_end_ms`). Interim results are still emitted live so the
 * user sees the turn forming, but the copilot only ever answers whole turns.
 *
 * One socket per speaker channel ('me' = mic, 'them' = system loopback) means
 * UtteranceEnd is unambiguous per speaker.
 */

// Silence (ms) before Deepgram closes a turn. High enough to survive the natural
// mid-question pauses that were fragmenting questions before.
const ENDPOINTING_MS = 900
const UTTERANCE_END_MS = 1000
// Safety net: if UtteranceEnd never arrives, flush the buffered turn anyway.
const FALLBACK_FLUSH_MS = 3500

interface TurnBuffer {
  text: string
  startMs: number
  timer?: NodeJS.Timeout
}

export class DeepgramEngine implements SttEngine {
  readonly id = 'deepgram' as const
  private sockets = new Map<Speaker, WebSocket>()
  private buffers = new Map<Speaker, TurnBuffer>()
  private opts!: SttStartOptions
  private transcriptCb: (seg: TranscriptSegment) => void = () => {}
  private stateCb: (s: 'connecting' | 'live' | 'closed' | 'error', d?: string) => void = () => {}
  private seq = 0

  constructor(private apiKey: string) {}

  async start(opts: SttStartOptions): Promise<void> {
    this.opts = opts
    this.stateCb('connecting')
    // Sockets open lazily on first audio frame per channel.
  }

  private ensureSocket(speaker: Speaker): WebSocket {
    const existing = this.sockets.get(speaker)
    if (existing && (existing.readyState === WebSocket.OPEN || existing.readyState === WebSocket.CONNECTING)) {
      return existing
    }

    const params = new URLSearchParams({
      model: this.opts.model,
      language: this.opts.language,
      encoding: 'linear16',
      sample_rate: String(this.opts.sampleRate),
      channels: '1',
      interim_results: 'true',
      smart_format: 'true',
      punctuate: 'true',
      endpointing: String(ENDPOINTING_MS),
      utterance_end_ms: String(UTTERANCE_END_MS)
    })
    const ws = new WebSocket(`wss://api.deepgram.com/v1/listen?${params.toString()}`, {
      headers: { Authorization: `Token ${this.apiKey}` }
    })

    ws.on('open', () => this.stateCb('live'))
    ws.on('message', (raw) => this.handleMessage(speaker, raw.toString()))
    ws.on('error', (err) => this.stateCb('error', err.message))
    ws.on('close', () => this.sockets.delete(speaker))
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

    // The speaker has genuinely stopped talking → close the turn.
    if (msg.type === 'UtteranceEnd') {
      this.flush(speaker)
      return
    }
    if (msg.type && msg.type !== 'Results') return

    const alt = msg.channel?.alternatives?.[0]
    const text: string = alt?.transcript ?? ''
    if (!text) return

    const isFinal = Boolean(msg.is_final)
    const buf = this.buffers.get(speaker) ?? { text: '', startMs: Math.round((msg.start ?? 0) * 1000) }

    if (isFinal) {
      // Append this finalized fragment to the current turn; keep waiting for
      // UtteranceEnd before we consider the turn complete.
      buf.text = buf.text ? `${buf.text} ${text}` : text
      if (buf.timer) clearTimeout(buf.timer)
      buf.timer = setTimeout(() => this.flush(speaker), FALLBACK_FLUSH_MS)
      this.buffers.set(speaker, buf)
      this.emitInterim(speaker, buf.text) // live: show the turn so far
    } else {
      // Interim word(s): show buffered turn + the in-progress tail, don't commit.
      this.emitInterim(speaker, buf.text ? `${buf.text} ${text}` : text)
    }
  }

  /** Commit the buffered turn as a single final segment. */
  private flush(speaker: Speaker): void {
    const buf = this.buffers.get(speaker)
    if (!buf || !buf.text.trim()) return
    if (buf.timer) clearTimeout(buf.timer)
    this.buffers.delete(speaker)
    this.transcriptCb({
      id: `${speaker}-t${this.seq++}`,
      speaker,
      text: buf.text.trim(),
      isFinal: true,
      startMs: buf.startMs,
      endMs: buf.startMs
    })
  }

  private emitInterim(speaker: Speaker, text: string): void {
    this.transcriptCb({
      id: `${speaker}-interim`,
      speaker,
      text,
      isFinal: false,
      startMs: 0,
      endMs: 0
    })
  }

  pushAudio(speaker: Speaker, pcm: Buffer): void {
    const ws = this.ensureSocket(speaker)
    if (ws.readyState === WebSocket.OPEN) ws.send(pcm)
  }

  async stop(): Promise<void> {
    // Flush any half-spoken turns so nothing is lost.
    for (const speaker of this.buffers.keys()) this.flush(speaker)
    for (const ws of this.sockets.values()) {
      try {
        if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'CloseStream' }))
        ws.close()
      } catch {
        /* ignore */
      }
    }
    this.sockets.clear()
    this.buffers.clear()
    this.stateCb('closed')
  }

  onTranscript(cb: (seg: TranscriptSegment) => void): void {
    this.transcriptCb = cb
  }
  onState(cb: (s: 'connecting' | 'live' | 'closed' | 'error', d?: string) => void): void {
    this.stateCb = cb
  }
}
