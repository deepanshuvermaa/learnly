# Metrics Integration Guide

This document tracks where metrics are being collected across Listenly and where more instrumentation is needed.

## Current Integration Points

### ✅ STT (Speech-to-Text) - INTEGRATED

**File**: `src/main/services/stt/deepgram.ts`

**What's Tracked**:
- Operation name: `stt:deepgram`
- Duration: Time from utterance start to finalization
- Metrics: Speaker, word count, confidence (0.92 default)
- Success/Failure: Always recorded

**Code Location**: `flush()` method
```typescript
perfMonitor.recordOperation({
  name: 'stt:deepgram',
  durationMs: durationMs,
  timestamp: startTime,
  tags: { speaker, words: wordCount, confidence: avgConfidence },
  success: true
})

metricsCollector.recordSTTAttempt(avgConfidence, durationMs, true)
```

**Bottleneck Threshold**: 5 seconds (configurable in performanceMonitor.ts)

### ✅ LLM (Code Generation) - INTEGRATED

**File**: `src/main/services/llm/client.ts`

**What's Tracked**:
- Operation name: `llm:stream`
- Duration: Full streaming request time
- Metrics: Model name, total tokens (prompt + completion), memory used
- Success/Failure: Tracked for both streaming success and HTTP errors

**Code Location**: `streamChat()` function, multiple points:
- Request start: Records timestamp and initial memory
- On error (HTTP): Records failure with status code
- On completion ([DONE]): Records success with token count and duration
- Fallback end: Handles stream end without explicit [DONE]

```typescript
perfMonitor.recordOperation({
  name: 'llm:stream',
  durationMs,
  timestamp: startTime,
  tags: { model: opts.model, tokens: totalTokens, memoryMb: memoryUsedMb },
  success: true
})

pm.recordLLMMetric(opts.model, totalTokens, durationMs, true)
metricsCollector.recordLLMAttempt(totalTokens, durationMs, true, opts.model)
```

**Bottleneck Threshold**: 15 seconds (configurable)

### ✅ Transcript Processing - INTEGRATED

**File**: `src/main/services/sessions.ts`

**What's Tracked**:
- Operation name: `session:save`
- Duration: Time to save session to store
- Metrics: Session ID, line count, character count, turn count
- Transcript statistics aggregated

**Code Location**: `saveSession()` function
```typescript
perfMonitor.recordOperation({
  name: 'session:save',
  durationMs: saveDurationMs,
  timestamp: startTime,
  tags: { sessionId: session.id, lines, characters, turns },
  success: true
})

metricsCollector.recordTranscriptStats(lines, characters, turns, saveDurationMs)
```

**Bottleneck Threshold**: 2 seconds

### ✅ System Resources - INTEGRATED

**File**: `src/main/services/systemMonitor.ts`

**What's Tracked**:
- Memory (heap used in MB)
- CPU percent (placeholder, needs native module)
- Collection interval: Every 5 seconds

**Code Location**: System monitor interval
```typescript
metricsCollector.recordSystemMetrics(memoryMb, cpuPercent)
```

### ✅ STT Manager - PARTIALLY INTEGRATED

**File**: `src/main/services/stt/manager.ts`

**What's Integrated**:
- Import statements added for `perfMonitor` and `metricsCollector`

**What's Needed**:
- [ ] Track STT engine start/stop times
- [ ] Record audio capture duration
- [ ] Track buffer management metrics

## Pending Integration Points

### 🔄 Whisper (Local STT) - TODO

**File**: `src/main/services/stt/whisper.ts`

**What Should Be Tracked**:
- Operation: `stt:whisper`
- Duration: Transcription time
- Metrics: Model size, audio duration, confidence
- Success/Failure status

**Integration Needed**:
```typescript
import { perfMonitor } from '../performanceMonitor'
import { metricsCollector } from '../metricsCollector'

// In transcription method:
const startTime = Date.now()
// ... do transcription ...
const durationMs = Date.now() - startTime
perfMonitor.recordOperation({
  name: 'stt:whisper',
  durationMs,
  timestamp: startTime,
  tags: { model: this.model, confidence: result.confidence },
  success: true
})
metricsCollector.recordSTTAttempt(result.confidence, durationMs, true)
```

### 🔄 Audio Capture - TODO

**File**: `src/main/services/captureManager.ts` (or similar)

**What Should Be Tracked**:
- Operation: `audio:capture`
- Duration: Total capture session length
- Metrics: Sample rate, channels, peak volume, noise floor
- Audio quality assessment

**Integration Needed**:
```typescript
metricsCollector.recordAudioCapture(totalDurationMs, noiseFloorDb, peakVolumeDb)
```

### 🔄 Code Generation Service - TODO

**File**: `src/main/services/codegen/service.ts`

**What Should Be Tracked**:
- Operation: `codegen:generate`
- Duration: Full generation time (question detection + LLM call + post-processing)
- Metrics: Scope (brute-force/walkthrough/full), tokens, success rate
- Quality filter timing

**Integration Needed**:
```typescript
import { perfMonitor } from '../performanceMonitor'
import { metricsCollector } from '../metricsCollector'

const startTime = Date.now()
// ... code generation ...
const durationMs = Date.now() - startTime
perfMonitor.recordOperation({
  name: 'codegen:generate',
  durationMs,
  timestamp: startTime,
  tags: { scope, tokensUsed, language },
  success: true
})
```

### 🔄 Question Detection - TODO

**File**: `src/main/services/codegen/questionDetector.ts`

**What Should Be Tracked**:
- Operation: `codegen:detect`
- Duration: Time to detect and extract question from transcript
- Metrics: Confidence, question type, context window size

### 🔄 IPC Handlers - TODO

**Files**: `src/main/ipc/handlers.ts`, `src/main/ipc/diagnosticsHandlers.ts`

**What Should Be Tracked**:
- Operation: `ipc:[handlerName]`
- Duration: Request → response time
- Metrics: Handler name, payload size, response status

**Integration Needed**:
```typescript
// Wrap handler invocations
ipcMain.handle('handler-name', async (event, data) => {
  const startTime = Date.now()
  try {
    const result = await doWork(data)
    const durationMs = Date.now() - startTime
    perfMonitor.recordOperation({
      name: 'ipc:handler-name',
      durationMs,
      timestamp: startTime,
      tags: { payloadSize: JSON.stringify(data).length },
      success: true
    })
    return result
  } catch (error) {
    const durationMs = Date.now() - startTime
    perfMonitor.recordOperation({
      name: 'ipc:handler-name',
      durationMs,
      timestamp: startTime,
      success: false,
      errorMessage: String(error)
    })
    throw error
  }
})
```

### 🔄 UI Rendering - TODO

**File**: `src/renderer/src/components/**/*.tsx`

**What Should Be Tracked**:
- React.Profiler component wrapping major sections
- Operation: `ui:render:[ComponentName]`
- Duration: Component render time
- Performance warning if >100ms

**Integration Needed**:
```typescript
import { Profiler, ProfilerOnRenderCallback } from 'react'
import { perfMonitor } from '../../../main/services/performanceMonitor'

const onRenderCallback: ProfilerOnRenderCallback = (id, phase, actualDuration) => {
  perfMonitor.recordUIRender(id, Math.round(actualDuration))
}

export function MyComponent() {
  return (
    <Profiler id="MyComponent" onRender={onRenderCallback}>
      {/* Component content */}
    </Profiler>
  )
}
```

### 🔄 RAG/Search - TODO

**File**: `src/main/services/rag/context.ts`

**What Should Be Tracked**:
- Operation: `rag:search` or `rag:context-retrieval`
- Duration: Search query time
- Metrics: Query type, results count, semantic relevance score

## Metrics Export & Analysis

### How to View Metrics

1. **In Settings → Diagnostics Tab**:
   - Real-time health score
   - All metric categories
   - Bottleneck warnings
   - Export button

2. **Programmatically**:
   ```typescript
   import { metricsCollector } from './services/metricsCollector'
   import { perfMonitor } from './services/performanceMonitor'
   
   const summary = perfMonitor.getSummary()
   const metrics = metricsCollector.getMetrics()
   const logs = perfMonitor.exportLogs()
   ```

3. **Export to JSON**:
   - Button in Diagnostics UI
   - Saves to: `AppData/Roaming/listenly/logs/metrics-<timestamp>.json`

### Analysis Workflow

**To debug a bottleneck**:

1. Open Diagnostics → see warning (e.g., "LLM response slow: 18s")
2. Click Export Metrics
3. Open JSON file and examine:
   - `operations`: Find `llm:stream` entries, check `durationMs` and `tags.tokensUsed`
   - `systemMetrics`: Check if memory was spiking during slow response
   - `summary`: See pattern (e.g., "LLM always slow after 1 hour?")

**Common Issues to Look For**:

| Bottleneck | Root Cause | Solution |
|---|---|---|
| STT latency increases over time | Memory leak in audio buffers | Clear old buffers, check WeakMaps |
| LLM always slow after 30 min | Token count growing (transcript size) | Trim context window, use summarization |
| UI renders >200ms | Too many transcript items re-rendering | Virtualize list, memoize components |
| Memory climbs to 500MB+ | Transcript history not garbage collected | Add GC trigger, clear old sessions |
| Audio quality "poor" | Background noise or mic issue | User feedback needed, noise gate |

## Testing Metrics Integration

### Unit Test Template

```typescript
import { perfMonitor } from '../performanceMonitor'
import { metricsCollector } from '../metricsCollector'

describe('Metrics Integration', () => {
  it('should record STT operation', () => {
    perfMonitor.recordOperation({
      name: 'stt:deepgram',
      durationMs: 1500,
      timestamp: Date.now(),
      tags: { speaker: 'user', words: 10 },
      success: true
    })
    
    const summary = perfMonitor.getSummary()
    expect(summary.operationStats['stt:deepgram'].count).toBe(1)
    expect(summary.operationStats['stt:deepgram'].avgMs).toBe(1500)
  })

  it('should detect bottleneck on slow operation', () => {
    perfMonitor.recordOperation({
      name: 'llm:stream',
      durationMs: 20000, // Exceeds 15s threshold
      timestamp: Date.now(),
      tags: { model: 'groq' },
      success: true
    })
    
    const summary = perfMonitor.getSummary()
    expect(summary.bottlenecks.length).toBeGreaterThan(0)
    expect(summary.bottlenecks[0].type).toBe('latency')
  })
})
```

### Manual QA Checklist

- [ ] Open app, perform normal workflow (record meeting, etc.)
- [ ] Check Diagnostics panel: See operations being recorded in real-time
- [ ] Trigger slow operation (large transcript, slow API), check bottleneck warning appears
- [ ] Export metrics JSON, verify structure is complete
- [ ] Check `~/.pith/state.json`: Metrics should be aggregated over time
- [ ] Restart app, check metrics persist across sessions

## Next Steps

1. **Integrate pending services** (see TODO list above)
2. **Add CPU monitoring** (requires native module like `os-utils`)
3. **Implement metric retention policy** (keep 1 week of history)
4. **Create automated alerts** (email/Slack when health drops below 60%)
5. **Build analytics dashboard** (web UI to analyze patterns across sessions)
