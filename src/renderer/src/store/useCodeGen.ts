import { create } from 'zustand'
import type { CodeGenResult, CodeGenScope, CodeSuggestion } from '@shared/types'

/** One code request as the panel sees it: raw stream while running, parsed result after. */
export interface CodeGeneration {
  requestId: string
  scope: CodeGenScope
  question: string
  stream: string
  status?: string
  result?: CodeGenResult
  error?: string
  streaming: boolean
  startedAt: number
}

export interface Toast {
  id: number
  message: string
  tone: 'ok' | 'warn' | 'error'
}

const HISTORY = 3

interface CodeGenState {
  panelOpen: boolean
  suggestion: CodeSuggestion | null
  draftQuestion: string
  /** Newest first, capped so the user can cycle the last few. */
  generations: CodeGeneration[]
  viewIndex: number
  toast: Toast | null

  openPanel: (question?: string) => void
  closePanel: () => void
  setSuggestion: (s: CodeSuggestion | null) => void
  setDraft: (q: string) => void
  setView: (i: number) => void

  start: (g: Pick<CodeGeneration, 'requestId' | 'scope' | 'question'>) => void
  append: (requestId: string, delta: string) => void
  setStatus: (requestId: string, message: string, reset?: boolean) => void
  finish: (result: CodeGenResult) => void
  fail: (requestId: string, message: string) => void

  showToast: (message: string, tone?: Toast['tone']) => void
  dismissToast: () => void
}

const patchGen = (gens: CodeGeneration[], id: string, fn: (g: CodeGeneration) => CodeGeneration) =>
  gens.map((g) => (g.requestId === id ? fn(g) : g))

export const useCodeGen = create<CodeGenState>((set) => ({
  panelOpen: false,
  suggestion: null,
  draftQuestion: '',
  generations: [],
  viewIndex: 0,
  toast: null,

  openPanel: (question) =>
    set((st) => ({ panelOpen: true, draftQuestion: question ?? st.draftQuestion })),
  closePanel: () => set({ panelOpen: false, suggestion: null }),
  setSuggestion: (s) => set({ suggestion: s }),
  setDraft: (q) => set({ draftQuestion: q }),
  setView: (i) => set((st) => ({ viewIndex: Math.max(0, Math.min(i, st.generations.length - 1)) })),

  start: (g) =>
    set((st) => ({
      generations: [{ ...g, stream: '', streaming: true, startedAt: Date.now() }, ...st.generations].slice(0, HISTORY),
      viewIndex: 0
    })),
  append: (id, delta) =>
    set((st) => ({ generations: patchGen(st.generations, id, (g) => ({ ...g, stream: g.stream + delta })) })),
  setStatus: (id, message, reset) =>
    set((st) => ({
      generations: patchGen(st.generations, id, (g) => ({ ...g, status: message, stream: reset ? '' : g.stream }))
    })),
  finish: (result) =>
    set((st) => ({
      generations: patchGen(st.generations, result.requestId, (g) => ({
        ...g,
        result,
        streaming: false,
        status: undefined
      }))
    })),
  fail: (id, message) =>
    set((st) => ({
      generations: patchGen(st.generations, id, (g) => ({ ...g, error: message, streaming: false, status: undefined }))
    })),

  showToast: (message, tone = 'ok') => set({ toast: { id: Date.now(), message, tone } }),
  dismissToast: () => set({ toast: null })
}))
