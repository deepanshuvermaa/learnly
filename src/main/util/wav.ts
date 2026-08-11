/** Encode mono 16-bit PCM into a WAV container (what whisper.cpp expects on -f). */
export function encodeWav(pcm: Int16Array, sampleRate: number): Buffer {
  const dataBytes = pcm.length * 2
  const buf = Buffer.alloc(44 + dataBytes)
  // RIFF header
  buf.write('RIFF', 0)
  buf.writeUInt32LE(36 + dataBytes, 4)
  buf.write('WAVE', 8)
  // fmt chunk
  buf.write('fmt ', 12)
  buf.writeUInt32LE(16, 16) // PCM chunk size
  buf.writeUInt16LE(1, 20) // audio format = PCM
  buf.writeUInt16LE(1, 22) // channels = 1
  buf.writeUInt32LE(sampleRate, 24)
  buf.writeUInt32LE(sampleRate * 2, 28) // byte rate
  buf.writeUInt16LE(2, 32) // block align
  buf.writeUInt16LE(16, 34) // bits per sample
  // data chunk
  buf.write('data', 36)
  buf.writeUInt32LE(dataBytes, 40)
  for (let i = 0; i < pcm.length; i++) buf.writeInt16LE(pcm[i], 44 + i * 2)
  return buf
}
