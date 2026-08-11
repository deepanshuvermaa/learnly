import { spawn } from 'child_process'
import { promises as fs } from 'fs'
import { existsSync } from 'fs'
import { join } from 'path'
import { randomUUID } from 'crypto'
import { app } from 'electron'
import type { Speaker, TranscriptSegment } from '@shared/types'
import { getSettings } from '../settings'
import { encodeWav } from '../../util/wav'
import type { SttEngine, SttStartOptions } from './types'

/**
 * Local Whisper engine — the privacy tier where audio never leaves the device.
 *
 * Pipeline per speaker channel:
 *   PCM frames → energy VAD → utterance buffer → WAV → whisper.cpp binary → text
 *
 * The user supplies a whisper.cpp binary (whisper-cli / main) and a ggml model
 * in Settings → Transcription. We segment on silence so each utterance is
 * transcribed as soon as the speaker pauses, which keeps latency bounded without
 * needing a true streaming whisper build.
 */

const VAD = {
  // Int16 RMS above this counts as speech (~ -40 dBFS). Tunable per mic.
  speechRms: 550,
  // Flush after this much trailing silence once speech has been detected.
  silenceMs: 600,
  // Don't bother transcribing utterances shorter than this.
  minSpeechMs: 350,
  // Hard cap so a monologue still gets flushed periodically.
  maxUtteranceMs: 14000
}

interface ChannelState {
  buf: number[]
  speaking: boolean
  silenceSamples: number
  speechSamples: number
  // Serialises whisper invocations per channel so we never spawn a pile-up.
  queue: Promise<void>
}

export class WhisperLocalEngine implements SttEngine {
  readonly id = 'whisper-local' as const
  private sampleRate = 16000
  private lang = 'en'
  private binaryPath = ''
  private modelPath = ''
  private threads = 4
  private seq = 0
  private tmpDir = ''
  private channels: Record<Speaker, ChannelState> = {
    me: this.fresh(),
    them: this.fresh(),
    unknown: this.fresh()
  }
  private transcriptCb: (seg: TranscriptSegment) => void = () => {}
  private stateCb: (s: 'connecting' | 'live' | 'closed' | 'error', d?: string) => void = () => {}

  private fresh(): ChannelState {
    return { buf: [], speaking: false, silenceSamples: 0, speechSamples: 0, queue: Promise.resolve() }
  }

  async start(opts: SttStartOptions): Promise<void> {
    const w = getSettings().stt.whisper
    this.sampleRate = opts.sampleRate
    this.lang = opts.language
    this.binaryPath = w.binaryPath
    this.modelPath = w.modelPath
    this.threads = w.threads || 4
    this.tmpDir = join(app.getPath('temp'), 'listenly-whisper')

    if (!this.binaryPath || !existsSync(this.binaryPath)) {
      this.stateCb('error', 'Whisper binary not found. Set its path in Settings → Transcription.')
      throw new Error('whisper binary missing')
    }
    if (!this.modelPath || !existsSync(this.modelPath)) {
      this.stateCb('error', 'Whisper model not found. Set the ggml model path in Settings → Transcription.')
      throw new Error('whisper model missing')
    }
    await fs.mkdir(this.tmpDir, { recursive: true })
    this.stateCb('live')
  }

  pushAudio(speaker: Speaker, pcm: Buffer): void {
    const st = this.channels[speaker]
    if (!st) return
    const samples = new Int16Array(pcm.buffer, pcm.byteOffset, Math.floor(pcm.byteLength / 2))
    const rms = this.rms(samples)
    const isSpeech = rms >= VAD.speechRms

    if (isSpeech) {
      st.speaking = true
      st.silenceSamples = 0
      st.speechSamples += samples.length
      for (let i = 0; i < samples.length; i++) st.buf.push(samples[i])
    } else if (st.speaking) {
      // Keep trailing silence in the buffer so words aren't clipped.
      st.silenceSamples += samples.length
      for (let i = 0; i < samples.length; i++) st.buf.push(samples[i])
    }

    const bufMs = (st.buf.length / this.sampleRate) * 1000
    const silenceMs = (st.silenceSamples / this.sampleRate) * 1000
    const speechMs = (st.speechSamples / this.sampleRate) * 1000

    if (st.speaking && ((silenceMs >= VAD.silenceMs && speechMs >= VAD.minSpeechMs) || bufMs >= VAD.maxUtteranceMs)) {
      this.flush(speaker)
    }
  }

  private rms(samples: Int16Array): number {
    if (samples.length === 0) return 0
    let sum = 0
    for (let i = 0; i < samples.length; i++) sum += samples[i] * samples[i]
    return Math.sqrt(sum / samples.length)
  }

  private flush(speaker: Speaker): void {
    const st = this.channels[speaker]
    if (st.buf.length === 0) return
    const utterance = Int16Array.from(st.buf)
    st.buf = []
    st.speaking = false
    st.silenceSamples = 0
    st.speechSamples = 0
    // Chain onto this channel's queue to serialise transcription.
    st.queue = st.queue.then(() => this.transcribe(speaker, utterance)).catch(() => {})
  }

  private async transcribe(speaker: Speaker, utterance: Int16Array): Promise<void> {
    const startMs = 0
    const durMs = Math.round((utterance.length / this.sampleRate) * 1000)
    const wav = encodeWav(utterance, this.sampleRate)
    const file = join(this.tmpDir, `${speaker}-${randomUUID()}.wav`)
    await fs.writeFile(file, wav)
    try {
      const text = await this.runWhisper(file)
      const clean = text.trim()
      if (clean) {
        this.transcriptCb({
          id: `${speaker}-w${this.seq++}`,
          speaker,
          text: clean,
          isFinal: true,
          startMs,
          endMs: startMs + durMs
        })
      }
    } finally {
      fs.unlink(file).catch(() => {})
    }
  }

  private runWhisper(wavPath: string): Promise<string> {
    return new Promise((resolve, reject) => {
      // -nt no timestamps, -np no prints (suppress system info), -l language.
      const args = ['-m', this.modelPath, '-f', wavPath, '-l', this.lang, '-t', String(this.threads), '-nt', '-np']
      const proc = spawn(this.binaryPath, args, { windowsHide: true })
      let out = ''
      let err = ''
      proc.stdout.on('data', (d) => (out += d.toString()))
      proc.stderr.on('data', (d) => (err += d.toString()))
      proc.on('error', reject)
      proc.on('close', (code) => {
        if (code === 0) resolve(out)
        else reject(new Error(`whisper exited ${code}: ${err.slice(0, 300)}`))
      })
    })
  }

  async stop(): Promise<void> {
    // Flush any in-progress utterances so trailing speech isn't lost.
    ;(['me', 'them', 'unknown'] as Speaker[]).forEach((s) => this.flush(s))
    await Promise.allSettled((['me', 'them', 'unknown'] as Speaker[]).map((s) => this.channels[s].queue))
    this.channels = { me: this.fresh(), them: this.fresh(), unknown: this.fresh() }
    this.stateCb('closed')
  }

  onTranscript(cb: (seg: TranscriptSegment) => void): void {
    this.transcriptCb = cb
  }
  onState(cb: (s: 'connecting' | 'live' | 'closed' | 'error', d?: string) => void): void {
    this.stateCb = cb
  }
}
