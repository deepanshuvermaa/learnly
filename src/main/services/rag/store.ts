import { app } from 'electron'
import { promises as fs } from 'fs'
import { join } from 'path'
import type { RagChunk, RagDocument } from '@shared/types'
import { embedTexts } from '../llm/router'

/**
 * Local-first vector store. Backed by a single JSON file in userData; search is
 * an in-memory cosine scan. This is intentionally dependency-free and is more
 * than adequate for a personal knowledge base (thousands of chunks). The read/
 * search/ingest surface matches what a LanceDB or sqlite-vec backend would
 * expose, so swapping to an ANN index later is a store-file change, not an API
 * change for the rest of the app.
 */

interface StoredChunk {
  id: string
  docId: string
  source: string
  text: string
  vector: number[]
  addedAt: number
}

interface StoreFile {
  version: 1
  dim: number | null
  docs: Record<string, { source: string; addedAt: number }>
  chunks: StoredChunk[]
}

const EMPTY: StoreFile = { version: 1, dim: null, docs: {}, chunks: [] }

function storePath(): string {
  return join(app.getPath('userData'), 'listenly-rag.json')
}

let cache: StoreFile | null = null

async function load(): Promise<StoreFile> {
  if (cache) return cache
  try {
    const raw = await fs.readFile(storePath(), 'utf8')
    cache = JSON.parse(raw) as StoreFile
  } catch {
    cache = structuredClone(EMPTY)
  }
  return cache
}

async function persist(): Promise<void> {
  if (!cache) return
  await fs.writeFile(storePath(), JSON.stringify(cache), 'utf8')
}

/** Split text into overlapping chunks on paragraph/sentence boundaries. */
function chunkText(text: string, target = 900, overlap = 150): string[] {
  const clean = text.replace(/\r\n/g, '\n').trim()
  if (clean.length <= target) return clean ? [clean] : []
  const chunks: string[] = []
  let i = 0
  while (i < clean.length) {
    let end = Math.min(i + target, clean.length)
    if (end < clean.length) {
      const slice = clean.slice(i, end)
      const brk = Math.max(slice.lastIndexOf('\n\n'), slice.lastIndexOf('. '), slice.lastIndexOf('\n'))
      if (brk > target * 0.5) end = i + brk + 1
    }
    chunks.push(clean.slice(i, end).trim())
    i = end - overlap
    if (i < 0) i = 0
  }
  return chunks.filter(Boolean)
}

function cosine(a: number[], b: number[]): number {
  let dot = 0
  let na = 0
  let nb = 0
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]
    na += a[i] * a[i]
    nb += b[i] * b[i]
  }
  return dot / (Math.sqrt(na) * Math.sqrt(nb) + 1e-8)
}

export async function ingestText(source: string, text: string): Promise<RagDocument> {
  const store = await load()
  const pieces = chunkText(text)
  if (pieces.length === 0) throw new Error('Nothing to ingest (empty text).')

  const vectors = await embedTexts(pieces)
  const docId = `doc-${Date.now()}-${Math.floor(performance.now())}`
  const addedAt = Date.now()

  store.dim ??= vectors[0]?.length ?? null
  store.docs[docId] = { source, addedAt }
  pieces.forEach((text, idx) => {
    store.chunks.push({
      id: `${docId}-${idx}`,
      docId,
      source,
      text,
      vector: vectors[idx],
      addedAt
    })
  })
  await persist()
  return { id: docId, source, chunks: pieces.length, addedAt }
}

export async function query(text: string, topK = 6): Promise<RagChunk[]> {
  const store = await load()
  if (store.chunks.length === 0) return []
  const [qv] = await embedTexts([text])
  return store.chunks
    .map((c) => ({ id: c.id, source: c.source, text: c.text, score: cosine(qv, c.vector) }))
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
    .slice(0, topK)
}

export async function listDocuments(): Promise<RagDocument[]> {
  const store = await load()
  return Object.entries(store.docs).map(([id, d]) => ({
    id,
    source: d.source,
    addedAt: d.addedAt,
    chunks: store.chunks.filter((c) => c.docId === id).length
  }))
}

export async function clearAll(): Promise<void> {
  cache = structuredClone(EMPTY)
  await persist()
}
