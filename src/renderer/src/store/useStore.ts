import { create } from 'zustand'
import type { Settings, SecretsStatus, TranscriptSegment, RagChunk } from '@shared/types'

/** A finalized transcript line stamped with wall-clock arrival time, so it can
 *  be interleaved chronologically with answer cards in the conversation view. */
export type TimedSegment = TranscriptSegment & { at: number }

export interface Suggestion {
  id: string
  question: string
  answer: string
  context: RagChunk[]
  streaming: boolean
  error?: string
  at: number
}

interface AppState {
  settings: Settings | null
  secrets: SecretsStatus | null
  capturing: boolean
  sttState: string
  sttDetail?: string
  interactive: boolean

  // Live transcript. Interim (non-final) segments are kept per-speaker and
  // replaced as they finalize, so the view never floods with duplicates.
  finals: TimedSegment[]
  interim: Record<'me' | 'them', TranscriptSegment | null>

  suggestions: Suggestion[]

  setSettings: (s: Settings) => void
  setSecrets: (s: SecretsStatus) => void
  setCapturing: (v: boolean) => void
  setSttState: (state: string, detail?: string) => void
  setInteractive: (v: boolean) => void

  pushTranscript: (seg: TranscriptSegment) => void
  clearTranscript: () => void
  transcriptForModel: () => TranscriptSegment[]

  startSuggestion: (question: string, context: RagChunk[]) => string
  appendSuggestion: (id: string, delta: string) => void
  finishSuggestion: (id: string) => void
  failSuggestion: (id: string, message: string) => void
}

export const useStore = create<AppState>((set, get) => ({
  settings: null,
  secrets: null,
  capturing: false,
  sttState: 'closed',
  interactive: false,
  finals: [],
  interim: { me: null, them: null },
  suggestions: [],

  setSettings: (s) => set({ settings: s }),
  setSecrets: (s) => set({ secrets: s }),
  setCapturing: (v) => set({ capturing: v }),
  setSttState: (state, detail) => set({ sttState: state, sttDetail: detail }),
  setInteractive: (v) => set({ interactive: v }),

  pushTranscript: (seg) =>
    set((st) => {
      if (seg.speaker === 'unknown') return st
      const spk = seg.speaker as 'me' | 'them'
      if (seg.isFinal) {
        return {
          finals: [...st.finals, { ...seg, at: Date.now() }].slice(-200),
          interim: { ...st.interim, [spk]: null }
        }
      }
      return { interim: { ...st.interim, [spk]: seg } }
    }),
  clearTranscript: () => set({ finals: [], interim: { me: null, them: null }, suggestions: [] }),
  transcriptForModel: () => {
    const { finals, interim } = get()
    const live = [interim.them, interim.me].filter(Boolean) as TranscriptSegment[]
    return [...finals, ...live]
  },

  startSuggestion: (question, context) => {
    const id = `sg-${Date.now().toString(36)}`
    set((st) => ({
      suggestions: [
        { id, question, answer: '', context, streaming: true, at: Date.now() },
        ...st.suggestions
      ].slice(0, 30)
    }))
    return id
  },
  appendSuggestion: (id, delta) =>
    set((st) => ({
      suggestions: st.suggestions.map((s) => (s.id === id ? { ...s, answer: s.answer + delta } : s))
    })),
  finishSuggestion: (id) =>
    set((st) => ({
      suggestions: st.suggestions.map((s) => (s.id === id ? { ...s, streaming: false } : s))
    })),
  failSuggestion: (id, message) =>
    set((st) => ({
      suggestions: st.suggestions.map((s) =>
        s.id === id ? { ...s, streaming: false, error: message } : s
      )
    }))
}))
