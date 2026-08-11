import type { Speaker, TranscriptSegment } from '@shared/types'

export interface SttStartOptions {
  language: string
  model: string
  sampleRate: number
}

/**
 * A speech-to-text engine consumes 16-bit PCM frames tagged by speaker channel
 * ('me' = local mic, 'them' = system loopback) and emits transcript segments.
 * Deepgram (cloud) and Whisper (local) both implement this so they are swappable.
 */
export interface SttEngine {
  readonly id: 'deepgram' | 'whisper-local'
  start(opts: SttStartOptions): Promise<void>
  /** pcm is a mono Int16 little-endian buffer at the negotiated sample rate. */
  pushAudio(speaker: Speaker, pcm: Buffer): void
  stop(): Promise<void>
  onTranscript(cb: (seg: TranscriptSegment) => void): void
  onState(cb: (state: 'connecting' | 'live' | 'closed' | 'error', detail?: string) => void): void
}
