# Listenly Code Generation Feature - Implementation Handoff

**Status**: In Progress  
**Last Updated**: 2026-10-09  
**Priority**: High (Core Product Feature)

---

## Overview

Add real-time code generation capability to Listenly where:
1. System listens to meeting transcript in real-time
2. When boss/colleague asks a technical question, Listenly auto-detects and prepares answer
3. Shows smart suggestion panel (invisible during screen-share) with scope options
4. User clicks desired scope (Brute Force / Walkthrough / Full Code)
5. Generates optimal, human-like code with explanation

**Key Constraint**: Answer should sound like an employee speaking naturally to their boss, not AI-generated text.

---

## Phase 1: Core Infrastructure

### 1.1 Settings & System Prompt Management
- [ ] Add "Code Generation" section to Settings panel
  - [ ] Textarea for custom system prompt (with char counter)
  - [ ] Real-time token estimation display
  - [ ] Save/Clear/Load Default buttons
  - [ ] Option to enable/disable feature
  - [ ] Hotkey customization (default: `Ctrl+Shift+G`)
  
- [ ] System Prompt Storage
  - [ ] Store in `electron-store` under `codeGenSettings.systemPrompt`
  - [ ] Compute SHA-256 hash of prompt on save
  - [ ] Cache hash + token count for reuse
  - [ ] Provide sensible defaults per language (Node.js, Python, Go, etc.)

### 1.2 Token Counting Utilities
- [ ] Create `src/main/services/tokenCounter.ts`
  - [ ] Implement `countTokens(text, provider)` for:
    - Groq (approx. 1 token per 4 chars)
    - Gemini (approx. 1 token per 3.5 chars)
    - OpenAI (use official tokenizer if available, fallback to 1.3 ratio)
  - [ ] Cache results by hash to avoid recounting same text
  - [ ] Export: `estimateTokens(prompt, context, estimatedOutput)`

### 1.3 Transcript Context Manager
- [ ] Create `src/main/services/transcriptContextManager.ts`
  - [ ] Maintain rolling buffer of last 15 turns
  - [ ] Filter out filler words (um, uh, like, you know, etc.)
  - [ ] Detect "question patterns" (contains: question marks, "how", "why", "design", "build", "implement", "fix", "what")
  - [ ] Extract key phrases only (strip long pauses, repeated words)
  - [ ] Format output: `[Speaker]: [cleaned text]`
  - [ ] Export: `getRelevantContext(lastNTurns = 10)` → string

---

## Phase 2: Code Generation Engine

### 2.1 Multi-LLM Provider Abstraction
- [ ] Create `src/main/services/llmProviders/index.ts`
  - [ ] Abstract interface: `LLMProvider { generate(prompt, options) }`
  
- [ ] Implement `src/main/services/llmProviders/groq.ts`
  - [ ] Use Groq API (priority #1)
  - [ ] Handle streaming responses
  - [ ] Token limit awareness (Groq has lower limits)
  - [ ] Error handling for rate limits
  - [ ] Fallback to next provider on failure

- [ ] Implement `src/main/services/llmProviders/gemini.ts`
  - [ ] Use Google Gemini API (priority #2)
  - [ ] Support both `gemini-pro` and newer models
  - [ ] Handle streaming
  - [ ] Token counting per Gemini's rules

- [ ] Implement `src/main/services/llmProviders/openai.ts`
  - [ ] Use OpenAI API (priority #3)
  - [ ] Support GPT-4 and GPT-3.5-turbo
  - [ ] Handle streaming
  - [ ] Use official token counter

- [ ] Provider Priority Logic
  - [ ] Try Groq first
  - [ ] Fall back to Gemini if Groq fails
  - [ ] Fall back to OpenAI if Gemini fails
  - [ ] Allow user override in settings
  - [ ] Log provider used + tokens spent

### 2.2 Code Generation Service
- [ ] Create `src/main/services/codeGenerator.ts`
  - [ ] Function: `generateCode(scope, userRequest, transcript, systemPrompt, provider?)`
  - [ ] **Input**:
    - `scope`: "brute-force" | "walkthrough" | "full-code"
    - `userRequest`: string (extracted from transcript, e.g., "Design REST auth")
    - `transcript`: last N turns of meeting
    - `systemPrompt`: user's custom system prompt
    - `provider`: optional override (Groq/Gemini/OpenAI)
  
  - [ ] **Output**:
    ```typescript
    {
      explanation: string,  // Natural language, sounds like employee speaking
      code: string,         // Generated code
      scope: string,
      tokensUsed: number,
      timeMs: number,
      provider: string,
      codeLanguage: string  // Detected language (typescript, python, etc.)
    }
    ```

- [ ] Prompt Templates (per scope)
  - [ ] **Brute Force**:
    ```
    User said: "[request]"
    Context: [recent transcript]
    
    As a backend engineer, briefly explain your approach (2-3 sentences, conversational).
    Then provide minimal working code (function only, no imports).
    No comments. No console.log. Keep it simple.
    ```
  
  - [ ] **Walkthrough**:
    ```
    User said: "[request]"
    Context: [recent transcript]
    
    Explain your approach (3-4 sentences, like talking to your boss).
    Then provide commented code with inline explanations (50-100 lines).
    Show the "why" behind each decision.
    ```
  
  - [ ] **Full Code**:
    ```
    User said: "[request]"
    Context: [recent transcript]
    
    Explain your approach (2-3 sentences).
    Provide production-ready code (300-500 lines):
    - Include proper error handling
    - Add validation
    - Show real imports (detect user's package.json)
    - Match project conventions (if available)
    - Real variable names, no "temp" or "data"
    - Natural async/await patterns
    ```

- [ ] System Prompt Injection
  - [ ] Prepend user's saved system prompt to every request
  - [ ] If prompt hash matches cached hash, skip re-counting
  - [ ] Always include: "Generate human-readable code that looks production-ready, not AI-written"

- [ ] Language Detection
  - [ ] Detect from context or user settings
  - [ ] Fallback to TypeScript/JavaScript
  - [ ] Support: JavaScript, TypeScript, Python, Go, Java, Rust, SQL, Bash

### 2.3 Human-Like Code Quality Filters
- [ ] Create `src/main/services/codeQualityFilter.ts`
  - [ ] Post-processing function: `sanitizeCode(code, language)`
  
  - [ ] Remove patterns that scream "AI-generated":
    - [ ] Strip lines like `// TODO`, `// FIXME`, `// NOTE`
    - [ ] Remove `console.log`, `print()`, `debugger` statements
    - [ ] Remove excessive comments (real code is sparse)
    - [ ] Replace generic names: `temp` → contextual, `data` → domain-specific, `result` → specific name
  
  - [ ] Ensure patterns that sound "real":
    - [ ] Proper indentation (detect from project, default 2 spaces)
    - [ ] Natural async/await (not Promise-heavy)
    - [ ] Realistic error handling (not every line in try-catch)
    - [ ] Real imports from user's package.json/dependencies
    - [ ] Consistent naming conventions
  
  - [ ] Language-specific rules:
    - [ ] Python: Use `if __name__ == "__main__"` pattern, proper docstrings (one-liner max)
    - [ ] JS/TS: Use destructuring, modern syntax
    - [ ] Go: Follow idiomatic error handling (err != nil)
    - [ ] SQL: Use proper formatting, avoid SELECT *

---

## Phase 3: Detection & Auto-Suggestion

### 3.1 Question Detection Engine
- [ ] Create `src/main/services/questionDetector.ts`
  - [ ] Listen to transcript in real-time
  - [ ] Detect patterns like:
    - Direct questions: "How do we...?", "Can we...?", "Should we...?"
    - Design requests: "Let's design", "Build a", "Create an", "Implement"
    - Problem statements: "We need to", "How to fix", "What's the best way"
  - [ ] Extract speaker name + question text
  - [ ] Emit event: `codeGenerationNeeded { speaker, question, context }`

- [ ] Smart Filtering
  - [ ] Ignore small-talk questions ("How are you?", "Did you see the email?")
  - [ ] Detect technical depth (ignore trivial questions)
  - [ ] Only trigger if confidence > 70%

### 3.2 Auto-Suggestion Panel
- [ ] Create React component `src/renderer/src/components/CodeSuggestionPanel.tsx`
  - [ ] **Initially Hidden** (position: fixed, off-screen)
  - [ ] Only appears when question detected
  - [ ] Shows:
    - Question detected: "Design REST auth for our product"
    - AI suggestion: "I think we should use JWT with refresh tokens. Here's why: [2-3 sentence explanation]"
    - Three buttons: 
      - [ ] "Brute Force" (quick snippet)
      - [ ] "Walkthrough" (commented code)
      - [ ] "Full Code" (production-ready)
    - [ ] "Dismiss" button (closes panel)
  
  - [ ] Position & Visibility
    - [ ] Float bottom-right by default
    - [ ] Draggable to any position
    - [ ] Can be moved off-screen (x: -500px)
    - [ ] Hotkey toggle (Ctrl+Shift+G) to show/hide
    - [ ] **Never visible during screen-share** (detect via display API or user setting)
    - [ ] CSS: `display: none !important` when screen-sharing
  
  - [ ] State Management
    - [ ] Store suggestion + generated code in component state
    - [ ] Keep history of last 3 generations (user can cycle)
    - [ ] Show generation time: "Generated in 4.2s"
    - [ ] Show tokens used: "~280 tokens"

### 3.3 Hotkey Handler
- [ ] Update `src/main/shortcuts.ts`
  - [ ] Add hotkey listener (default: `Ctrl+Shift+G`)
  - [ ] Toggles suggestion panel visibility
  - [ ] Allow user customization in Settings
  - [ ] Send IPC message to renderer: `toggle-code-suggestion-panel`

---

## Phase 4: UI & UX

### 4.1 Settings Panel Extension
- [ ] Update `src/renderer/src/windows/overlayWindow.tsx` or create `CodeGenSettings.tsx`
  - [ ] **System Prompt Section**:
    - [ ] Textarea (min 200px height)
    - [ ] Char counter (e.g., "245 / 5000 chars")
    - [ ] Real-time token estimate: "~45 tokens"
    - [ ] Load Default templates (dropdown)
    - [ ] Save, Clear buttons
    - [ ] Tooltip: "This prompt is prepended to every code generation request"
  
  - [ ] **LLM Provider Section**:
    - [ ] Radio buttons: Groq (default), Gemini, OpenAI
    - [ ] Show each provider's status (available/configured/error)
    - [ ] Warning if API key missing: "Please add your Groq API key in settings"
  
  - [ ] **Scope Preference Section**:
    - [ ] Dropdown: "Default scope when generating code"
    - [ ] Options: Brute Force, Walkthrough, Full Code
    - [ ] Explanation of each
  
  - [ ] **Hotkey Section**:
    - [ ] Input field (record actual keypress)
    - [ ] Default: `Ctrl+Shift+G`
    - [ ] Test button: "Test hotkey"
  
  - [ ] **Feature Toggle**:
    - [ ] On/Off switch for code generation
    - [ ] When off: suggestion panel never appears

### 4.2 Code Display Component
- [ ] Create `src/renderer/src/components/CodeDisplay.tsx`
  - [ ] Syntax highlighting (use Prism.js or similar)
  - [ ] Copy to Clipboard button
  - [ ] Download as file button (`.ts`, `.py`, etc.)
  - [ ] Language badge (e.g., "TypeScript")
  - [ ] Read-only textarea or `<pre>`

### 4.3 Notification & Toast
- [ ] Create toast notification on generation complete
  - [ ] "✓ Code generated in 3.2s (245 tokens)"
  - [ ] Auto-dismiss after 5s
  - [ ] Click to show full panel

### 4.4 Screen-Share Detection
- [ ] Update display capture detection logic
  - [ ] When screen-share active: hide suggestion panel
  - [ ] Add setting: "Hide code panel during screen-share" (default: ON)
  - [ ] Check `navigator.mediaDevices.getDisplayMedia()` or Electron's display capture status
  - [ ] CSS: `display: none !important` when sharing

---

## Phase 5: Integration & IPC

### 5.1 IPC Messages (Main ↔ Renderer)
- [ ] Main → Renderer: `code-suggestion-detected`
  ```typescript
  {
    question: string,
    speaker: string,
    suggestion: string  // AI's natural language suggestion
  }
  ```

- [ ] Renderer → Main: `generate-code`
  ```typescript
  {
    scope: "brute-force" | "walkthrough" | "full-code",
    question: string,
    provider?: string
  }
  ```

- [ ] Main → Renderer: `code-generated`
  ```typescript
  {
    explanation: string,
    code: string,
    tokensUsed: number,
    timeMs: number,
    provider: string
  }
  ```

- [ ] Renderer → Main: `toggle-code-panel`
- [ ] Main → Renderer: `screen-share-status-changed`
  ```typescript
  { isSharing: boolean }
  ```

### 5.2 Electron Store Schema
- [ ] Add to settings:
  ```typescript
  codeGenSettings: {
    enabled: boolean,
    systemPrompt: string,
    systemPromptHash: string,
    systemPromptTokens: number,
    provider: "groq" | "gemini" | "openai",
    defaultScope: "brute-force" | "walkthrough" | "full-code",
    hotkey: string,
    hideOnScreenShare: boolean,
    history: Array<{
      question: string,
      scope: string,
      code: string,
      provider: string,
      tokensUsed: number,
      timestamp: number
    }>,
    totalTokensUsed: number,
    totalGenerations: number
  }
  ```

---

## Phase 6: Analytics & Monitoring

### 6.1 Usage Tracking
- [ ] Log each generation:
  - [ ] Question asked
  - [ ] Scope selected
  - [ ] Provider used
  - [ ] Tokens consumed
  - [ ] Time taken (ms)
  - [ ] Success/failure
  - [ ] Timestamp

- [ ] Display in Settings:
  - [ ] "Total generations: 42"
  - [ ] "Total tokens used: 12,450"
  - [ ] "Average time: 4.2s"
  - [ ] "Provider breakdown: Groq 38, Gemini 3, OpenAI 1"

### 6.2 Error Handling & Fallbacks
- [ ] If Groq fails:
  - [ ] Show warning toast: "Groq unavailable, trying Gemini..."
  - [ ] Retry with Gemini
- [ ] If all fail:
  - [ ] Show error: "Code generation failed. Check API keys or internet."
  - [ ] Log error to session log
- [ ] Rate limit handling:
  - [ ] Detect 429 responses
  - [ ] Show: "Rate limited. Try again in X seconds."
  - [ ] Queue request for retry

---

## Phase 7: Testing & Quality Assurance

### 7.1 Unit Tests
- [ ] Token counter accuracy (compare with official tools)
- [ ] Question detection (test various question patterns)
- [ ] Code quality filter (ensure "bad AI patterns" are removed)
- [ ] Transcript context extraction (verify key phrases retained)

### 7.2 Integration Tests
- [ ] End-to-end: Question asked → Code generated → Displayed
- [ ] Provider fallback chain (Groq → Gemini → OpenAI)
- [ ] Settings persistence (save prompt, reload, verify)
- [ ] Hotkey triggering

### 7.3 Manual QA
- [ ] [ ] Test with real meeting transcript (various topics)
- [ ] [ ] Verify code quality (no console.log, proper imports, human-like)
- [ ] [ ] Test all scopes (Brute Force, Walkthrough, Full Code)
- [ ] [ ] Verify panel invisibility during screen-share
- [ ] [ ] Test with all three providers (Groq, Gemini, OpenAI)
- [ ] [ ] Test token counting accuracy
- [ ] [ ] Test various programming languages (JS, TS, Python, Go, SQL, Bash)

---

## Implementation Order (Recommended)

1. **Week 1: Core Infrastructure**
   - [ ] Phase 1.1-1.3: Settings, token counting, transcript context
   
2. **Week 2: Code Generation Engine**
   - [ ] Phase 2.1-2.3: LLM providers, code gen service, quality filters
   
3. **Week 3: Detection & UI**
   - [ ] Phase 3: Question detection, suggestion panel
   - [ ] Phase 4.1-4.2: Settings UI, code display
   
4. **Week 4: Integration & Polish**
   - [ ] Phase 5: IPC messages, store schema
   - [ ] Phase 4.3-4.4: Notifications, screen-share detection
   - [ ] Phase 6: Analytics
   
5. **Week 5: QA & Refinement**
   - [ ] Phase 7: Testing, bug fixes, edge cases

---

## Key Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| LLM Priority | Groq → Gemini → OpenAI | Fastest, cheapest, good code quality |
| Token Counting | Approx formula + official API | Balance speed with accuracy |
| System Prompt | User-customizable + defaults | Flexibility for different teams |
| Code Quality | Heavy filtering + human patterns | Avoid "AI-written" detection |
| Screen-Share Detection | CSS display:none + setting toggle | Simple, user-controlled |
| Scope Selection | Post-generation user choice | Optimal for latency, UX |

---

## Known Challenges & Solutions

| Challenge | Solution |
|-----------|----------|
| LLM latency (5-10s) | Show suggestion immediately, code loads in background |
| Token costs (multiple providers) | Cache system prompt, estimate before sending, track usage |
| Code detection (architecture vs algorithm) | Flexible prompt templates, no domain restriction |
| Human-like code | Post-gen filtering, detect + remove "AI patterns" |
| Screen-share invisibility | CSS + Electron display capture API |
| Codebase agnostic | Detect language from context, offer defaults, user config |

---

## Logging & Metrics Infrastructure (CRITICAL FOUNDATION)

**Purpose**: Comprehensive system monitoring to identify bottlenecks before they become production issues.

### Core Components

#### 1. **Performance Monitor** (`performanceMonitor.ts`)
- Tracks operation latency (STT, LLM, transcription, UI rendering)
- Detects bottlenecks automatically via threshold comparison
- Logs every operation: name, duration, success/failure, tags
- Generates reports: operation statistics, memory trends, bottleneck analysis

**Key Thresholds**:
- STT: <5s
- LLM Code Gen: <15s
- Transcription Ingest: <2s
- UI Render: <100ms
- Memory: <500MB
- CPU: <80%
- Audio Latency: <500ms

**Usage**:
```typescript
perfMonitor.recordOperation({
  name: 'stt:deepgram',
  durationMs: 2341,
  timestamp: Date.now(),
  tags: { engine: 'deepgram', confidence: 0.95 },
  success: true
})

perfMonitor.recordLLMMetric('groq', 280, 4200, true)
perfMonitor.recordSTTMetric(0.92, 1200, 'deepgram')
perfMonitor.getSummary() // Returns operations stats + bottleneck list
```

#### 2. **Metrics Collector** (`metricsCollector.ts`)
- Maintains session-wide aggregated metrics
- Tracks: STT quality, LLM performance, audio stats, transcript processing, system resources
- Calculates running averages, peak values, quality scores
- Exports detailed metrics for analysis

**Tracked Metrics**:
- **STT**: utterances, avg confidence, latency, failures
- **LLM**: attempts, successes, tokens used, cost, response time
- **Audio**: duration, noise floor, peak volume, quality rating
- **Transcript**: lines, characters, turns, processing time
- **System**: memory (avg/peak), CPU, uptime, errors, warnings
- **Quality**: audio quality, transcription accuracy, LLM code quality

**Usage**:
```typescript
metricsCollector.recordSTTAttempt(0.94, 1500, true)
metricsCollector.recordLLMAttempt(280, 4200, true, 'groq')
metricsCollector.recordTranscriptStats(450, 12000, 15, 1200)
metricsCollector.recordSystemMetrics(240, 35)
metricsCollector.getSummary() // Text summary
metricsCollector.getMetrics() // Full metrics object
await exportMetricsToFile('/path/to/file.json') // Export for analysis
```

#### 3. **Diagnostics UI** (`DiagnosticsPanel.tsx`)
- Real-time metrics dashboard in Settings → Diagnostics
- Shows health score (0-100%)
- Displays all metric categories with color-coded warnings
- Lists detected bottlenecks with recommendations
- Export & reset buttons

**Health Score Calculation**:
- Starts at 100%
- -10% if STT confidence <85%
- -15% if STT failures >5
- -15% if LLM success rate <90%
- -20% if audio quality is "poor"
- -15% if peak memory >500MB
- -20% if errors logged >10

#### 4. **IPC Handlers** (`diagnosticsHandlers.ts`)
- `get-diagnostics`: Fetch current metrics + bottlenecks
- `export-metrics`: Save detailed metrics to JSON file in logs folder
- `reset-diagnostics`: Clear all diagnostic data
- `get-llm-cost`: Query estimated LLM costs
- `log-event`: Log custom events from renderer

### What Gets Logged

**Session-Level (Always Logged)**:
```
2026-10-09T07:13:56.865Z [INFO] [stt] started {"engine":"deepgram"}
2026-10-09T07:14:00.862Z [INFO] [stt] state: live
2026-10-09T07:16:06.318Z [INFO] [stt] state: closed
2026-10-09T07:16:06.500Z [INFO] [perf] [OK] stt:deepgram 2341ms {"confidence":0.95,"engine":"deepgram"}
2026-10-09T07:16:10.200Z [INFO] [perf] [OK] llm:groq 4200ms {"provider":"groq","tokensUsed":280}
2026-10-09T07:16:15.100Z [WARN] [bottleneck] [MEDIUM] latency: llm:groq took 4200ms (threshold: 15000ms)
```

**Per-Session Metrics Snapshot** (exported on demand):
```json
{
  "sessionId": "session-1728480000000",
  "metrics": {
    "stt": {
      "totalUtterances": 15,
      "avgConfidence": 0.927,
      "avgLatencyMs": 1823,
      "failureCount": 0
    },
    "llm": {
      "generationsSuccessful": 3,
      "totalTokensUsed": 850,
      "avgResponseTimeMs": 4100,
      "totalCostEstimate": 0.0004
    },
    "system": {
      "avgMemoryMb": 240,
      "peakMemoryMb": 380,
      "errorsLogged": 1,
      "warningsLogged": 3
    },
    "quality": {
      "audioQuality": "good",
      "transcriptionAccuracy": 0.94,
      "llmCodeQuality": 0.87
    }
  }
}
```

### Integration Checklist

- [ ] Add `perfMonitor` calls in:
  - [ ] STT service (before/after each utterance)
  - [ ] LLM service (track token usage, response time)
  - [ ] Transcript processor (measure ingest time)
  - [ ] UI components (React Profiler integration)

- [ ] Add `metricsCollector` calls in:
  - [ ] STT handlers
  - [ ] LLM handlers
  - [ ] Audio capture start/stop
  - [ ] Transcript processing
  - [ ] System monitoring (every 5s)

- [ ] Wire up IPC handlers in `registerIpc()`
  - [ ] Import `registerDiagnosticsHandlers()`
  - [ ] Call in main process init

- [ ] Add Diagnostics tab to Settings UI
  - [ ] Import `DiagnosticsPanel` component
  - [ ] Render in settings tabs

- [ ] Periodic exports:
  - [ ] On app close: auto-export metrics
  - [ ] On error: trigger metrics snapshot
  - [ ] On user request: manual export

### Analysis Workflow

**To identify bottlenecks**:
1. Open Settings → Diagnostics
2. Look for red warnings in bottleneck section
3. Click "Export Metrics" to save detailed JSON
4. Share JSON file with team for analysis
5. Extract patterns: Is STT slow on certain audio? Is LLM always slow at peak hours?

**Common Patterns to Watch**:
- STT latency increasing over session (likely memory leak)
- LLM response time degrading (check token count trend)
- Memory climbing steadily (check for transcript buffer leaks)
- Audio quality "poor" → check microphone or background noise
- High error rate → check API key/network status

---

## Completed Checklist

### ✅ Done
- [x] Initial architecture design
- [x] Feature requirements documented
- [x] Implementation phases outlined
- [x] Handoff document created
- [x] Logging & metrics infrastructure created
  - [x] Performance monitor service
  - [x] Metrics collector service
  - [x] Diagnostics UI panel
  - [x] IPC handlers for data export

### 🔄 In Progress
- [ ] Phase 1: Core Infrastructure (Code Gen Settings)
- [x] Metrics integration into STT, LLM, Transcript services
  - [x] STT Deepgram: Records utterance timing, confidence
  - [x] LLM Client: Records token usage, response time, errors
  - [x] Session Save: Records transcript stats
  - [x] System Monitor: Periodic memory/CPU sampling

### ⏳ Pending
- [ ] Integrate metrics into remaining services:
  - [ ] Whisper (local STT)
  - [ ] Audio capture
  - [ ] Code generation service
  - [ ] Question detection
  - [ ] IPC handlers
  - [ ] UI rendering (React.Profiler)
  - [ ] RAG/search operations
- [ ] Phase 2-7: Code Gen Development & QA
- [ ] Test metrics collection with real meetings
- [ ] Add CPU monitoring (native module)
- [ ] Create automated alerts on health degradation

**Reference**: See [METRICS_INTEGRATION.md](METRICS_INTEGRATION.md) for complete integration checklist.

---

## Questions for Development Team

1. Should system prompt be per-meeting or global across meetings?
2. Should code history persist across sessions or reset daily?
3. Do we need user analytics dashboard or just local logging?
4. Should "explanation" be generated separately or extracted from LLM response?
5. Any codebase patterns we should detect (monorepo, microservices, etc.)?

---

**Next Step**: Start Phase 1.1 (Settings & System Prompt Management)
