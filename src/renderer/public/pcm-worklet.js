// AudioWorkletProcessor: resamples the incoming stream to 16 kHz mono and emits
// Int16 little-endian PCM frames (~50ms) to the main thread. Deepgram consumes
// linear16 @ 16k, so we do the conversion here off the main thread for low jitter.
class PcmDownsampler extends AudioWorkletProcessor {
  constructor(options) {
    super()
    this.targetRate = 16000
    this.inputRate = sampleRate // global in AudioWorkletGlobalScope
    this.ratio = this.inputRate / this.targetRate
    this._acc = 0
    this._buf = []
    this.speaker = (options && options.processorOptions && options.processorOptions.speaker) || 'me'
  }

  process(inputs) {
    const input = inputs[0]
    if (!input || input.length === 0) return true
    const chan = input[0]
    if (!chan) return true

    // Linear-interpolation downsample from inputRate -> 16k.
    for (let i = 0; i < chan.length; i++) {
      this._acc += 1
      if (this._acc >= this.ratio) {
        this._acc -= this.ratio
        let s = chan[i]
        s = Math.max(-1, Math.min(1, s))
        this._buf.push(s < 0 ? s * 0x8000 : s * 0x7fff)
      }
    }

    // Flush ~50ms (800 samples @16k) at a time.
    if (this._buf.length >= 800) {
      const pcm = new Int16Array(this._buf.splice(0, this._buf.length))
      this.port.postMessage({ speaker: this.speaker, pcm: pcm.buffer }, [pcm.buffer])
    }
    return true
  }
}

registerProcessor('pcm-downsampler', PcmDownsampler)
