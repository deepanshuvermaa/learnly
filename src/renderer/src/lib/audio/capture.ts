/**
 * Dual-stream audio capture.
 *
 *  - 'me'   = local microphone (getUserMedia)
 *  - 'them' = system loopback (getDisplayMedia with audio) — this is what the
 *             other participants say, coming out of your speakers. On Windows the
 *             main process grants a 'loopback' audio source (see index.ts's
 *             setDisplayMediaRequestHandler).
 *
 * Each stream is fed through the pcm-downsampler AudioWorklet and the resulting
 * Int16 PCM frames are forwarded to the main process for transcription. Keeping
 * this in the renderer is deliberate: the Web Audio + capture APIs live here, and
 * only already-decoded PCM (not keys) crosses IPC.
 */
export class CaptureController {
  private micStream: MediaStream | null = null
  private sysStream: MediaStream | null = null
  private ctx: AudioContext | null = null
  private nodes: AudioWorkletNode[] = []
  private running = false

  get active(): boolean {
    return this.running
  }

  async start(opts: {
    captureMic: boolean
    captureSystem: boolean
    macSystemDeviceId?: string
  }): Promise<void> {
    if (this.running) return
    this.ctx = new AudioContext()
    await this.ctx.audioWorklet.addModule('/pcm-worklet.js')

    if (opts.captureMic) {
      this.micStream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, channelCount: 1 }
      })
      this.wire(this.micStream, 'me')
    }

    if (opts.captureSystem) {
      this.sysStream =
        window.listenly.system.platform === 'darwin'
          ? await this.captureSystemMac(opts.macSystemDeviceId)
          : await this.captureSystemLoopback()
      this.wire(this.sysStream, 'them')
    }

    this.running = true
  }

  /** Windows/Linux: Chromium loopback via getDisplayMedia (main grants 'loopback'). */
  private async captureSystemLoopback(): Promise<MediaStream> {
    // Video is required by the spec to obtain system audio; we grab it and
    // immediately drop the video track, keeping only the loopback audio.
    const stream = await navigator.mediaDevices.getDisplayMedia({
      video: true,
      audio: {
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false
      } as MediaTrackConstraints
    })
    stream.getVideoTracks().forEach((t) => t.stop())
    if (stream.getAudioTracks().length === 0) {
      throw new Error('No system audio was shared. In the picker, choose a screen/tab and enable "Share audio".')
    }
    return stream
  }

  /**
   * macOS: capture system audio from a virtual loopback input device (BlackHole,
   * Loopback, or an Aggregate device that includes one). getDisplayMedia audio is
   * not reliable on macOS, so we route the system output into a virtual input and
   * read it like a microphone.
   */
  private async captureSystemMac(preferredId?: string): Promise<MediaStream> {
    const deviceId = await findLoopbackDevice(preferredId)
    if (!deviceId) {
      throw new Error(
        'No virtual loopback device found. Install BlackHole (or Loopback), create an Aggregate/Multi-Output that routes your meeting audio into it, then select it in Settings → Transcription.'
      )
    }
    return navigator.mediaDevices.getUserMedia({
      audio: {
        deviceId: { exact: deviceId },
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false
      } as MediaTrackConstraints
    })
  }

  private wire(stream: MediaStream, speaker: 'me' | 'them'): void {
    if (!this.ctx) return
    const src = this.ctx.createMediaStreamSource(stream)
    const node = new AudioWorkletNode(this.ctx, 'pcm-downsampler', {
      processorOptions: { speaker }
    })
    node.port.onmessage = (ev: MessageEvent) => {
      const { speaker: spk, pcm } = ev.data as { speaker: 'me' | 'them'; pcm: ArrayBuffer }
      window.listenly.stt.sendAudio(spk, pcm)
    }
    src.connect(node)
    // Do NOT connect node to destination — we don't want to echo audio out.
    this.nodes.push(node)
  }

  async stop(): Promise<void> {
    this.running = false
    this.nodes.forEach((n) => n.port.close())
    this.nodes = []
    this.micStream?.getTracks().forEach((t) => t.stop())
    this.sysStream?.getTracks().forEach((t) => t.stop())
    this.micStream = null
    this.sysStream = null
    await this.ctx?.close()
    this.ctx = null
  }
}

const LOOPBACK_LABEL = /blackhole|loopback|soundflower|aggregate|multi-?output|virtual/i

/**
 * Finds a virtual loopback audio input on macOS. Device labels are only exposed
 * after mic permission is granted, so we prime permission once if needed.
 */
export async function findLoopbackDevice(preferredId?: string): Promise<string | null> {
  let devices = await navigator.mediaDevices.enumerateDevices()
  const hasLabels = devices.some((d) => d.kind === 'audioinput' && d.label)
  if (!hasLabels) {
    // Prime permission to unlock labels, then release immediately.
    try {
      const prime = await navigator.mediaDevices.getUserMedia({ audio: true })
      prime.getTracks().forEach((t) => t.stop())
      devices = await navigator.mediaDevices.enumerateDevices()
    } catch {
      /* user denied — we'll just fail to find a labelled device below */
    }
  }
  const inputs = devices.filter((d) => d.kind === 'audioinput')
  if (preferredId) {
    const match = inputs.find((d) => d.deviceId === preferredId)
    if (match) return match.deviceId
  }
  const byLabel = inputs.find((d) => LOOPBACK_LABEL.test(d.label))
  return byLabel?.deviceId ?? null
}

/** Enumerate audio inputs for the Settings device picker (macOS). */
export async function listAudioInputs(): Promise<{ id: string; label: string }[]> {
  let devices = await navigator.mediaDevices.enumerateDevices()
  if (!devices.some((d) => d.kind === 'audioinput' && d.label)) {
    try {
      const prime = await navigator.mediaDevices.getUserMedia({ audio: true })
      prime.getTracks().forEach((t) => t.stop())
      devices = await navigator.mediaDevices.enumerateDevices()
    } catch {
      /* ignore */
    }
  }
  return devices
    .filter((d) => d.kind === 'audioinput')
    .map((d) => ({ id: d.deviceId, label: d.label || 'Unnamed input' }))
}

export const capture = new CaptureController()
