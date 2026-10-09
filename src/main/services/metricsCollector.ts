import { logInfo } from './logger'

/**
 * Centralized metrics collection for all subsystems.
 * Tracks: STT, LLM, audio capture, transcription, UI, memory, etc.
 * Data persisted for session-level analysis.
 */

export interface SessionMetrics {
  sessionId: string
  startTime: number
  endTime?: number

  // STT Metrics
  stt: {
    provider: string
    totalUtterances: number
    avgConfidence: number
    avgLatencyMs: number
    failureCount: number
  }

  // LLM Metrics
  llm: {
    provider: string
    generationsAttempted: number
    generationsSuccessful: number
    totalTokensUsed: number
    avgTokensPerGeneration: number
    avgResponseTimeMs: number
    totalCostEstimate: number
  }

  // Audio Metrics
  audio: {
    totalDurationMs: number
    captureStartAttempts: number
    captureStopAttempts: number
    bufferOverruns: number
    noiseFloor: number // -dB
    peakVolume: number // -dB
  }

  // Transcript Metrics
  transcript: {
    totalLines: number
    totalCharacters: number
    avgLineLength: number
    processingTimeMs: number
    turnCount: number
    avgTurnsPerMinute: number
  }

  // System Metrics
  system: {
    avgMemoryMb: number
    peakMemoryMb: number
    avgCpuPercent: number
    peakCpuPercent: number
    upTimeMs: number
    errorsLogged: number
    warningsLogged: number
  }

  // Quality Metrics
  quality: {
    audioQuality: 'poor' | 'fair' | 'good' | 'excellent'
    transcriptionAccuracy: number // 0-1
    llmCodeQuality: number // 0-1
    userSatisfactionScore?: number // 1-5
  }
}

class MetricsCollector {
  private sessionId: string = `session-${Date.now()}`
  private metrics: SessionMetrics = this.initializeMetrics()
  private sttAttempts: Array<{ timestamp: number; confidence: number; latencyMs: number }> = []
  private llmAttempts: Array<{ timestamp: number; tokensUsed: number; responseTimeMs: number; success: boolean }> = []
  private errorLog: Array<{ timestamp: number; message: string; severity: string }> = []

  private initializeMetrics(): SessionMetrics {
    return {
      sessionId: this.sessionId,
      startTime: Date.now(),
      stt: {
        provider: 'deepgram',
        totalUtterances: 0,
        avgConfidence: 0,
        avgLatencyMs: 0,
        failureCount: 0,
      },
      llm: {
        provider: 'groq',
        generationsAttempted: 0,
        generationsSuccessful: 0,
        totalTokensUsed: 0,
        avgTokensPerGeneration: 0,
        avgResponseTimeMs: 0,
        totalCostEstimate: 0,
      },
      audio: {
        totalDurationMs: 0,
        captureStartAttempts: 0,
        captureStopAttempts: 0,
        bufferOverruns: 0,
        noiseFloor: 0,
        peakVolume: 0,
      },
      transcript: {
        totalLines: 0,
        totalCharacters: 0,
        avgLineLength: 0,
        processingTimeMs: 0,
        turnCount: 0,
        avgTurnsPerMinute: 0,
      },
      system: {
        avgMemoryMb: 0,
        peakMemoryMb: 0,
        avgCpuPercent: 0,
        peakCpuPercent: 0,
        upTimeMs: 0,
        errorsLogged: 0,
        warningsLogged: 0,
      },
      quality: {
        audioQuality: 'good',
        transcriptionAccuracy: 0.95,
        llmCodeQuality: 0.85,
      },
    }
  }

  /**
   * Record STT attempt
   */
  recordSTTAttempt(confidence: number, latencyMs: number, success: boolean): void {
    this.sttAttempts.push({ timestamp: Date.now(), confidence, latencyMs })
    this.metrics.stt.totalUtterances++

    if (!success) {
      this.metrics.stt.failureCount++
    }

    this.updateSTTMetrics()
  }

  /**
   * Record LLM generation attempt
   */
  recordLLMAttempt(tokensUsed: number, responseTimeMs: number, success: boolean, provider: string): void {
    this.llmAttempts.push({ timestamp: Date.now(), tokensUsed, responseTimeMs, success })
    this.metrics.llm.provider = provider
    this.metrics.llm.generationsAttempted++

    if (success) {
      this.metrics.llm.generationsSuccessful++
      this.metrics.llm.totalTokensUsed += tokensUsed
    }

    this.updateLLMMetrics()
  }

  /**
   * Record error or warning
   */
  recordError(message: string, severity: 'error' | 'warn' | 'info' = 'error'): void {
    this.errorLog.push({ timestamp: Date.now(), message, severity })

    if (severity === 'error') {
      this.metrics.system.errorsLogged++
    } else if (severity === 'warn') {
      this.metrics.system.warningsLogged++
    }
  }

  /**
   * Update transcript metrics
   */
  recordTranscriptStats(lines: number, characters: number, turns: number, processingTimeMs: number): void {
    this.metrics.transcript.totalLines += lines
    this.metrics.transcript.totalCharacters += characters
    this.metrics.transcript.turnCount = turns
    this.metrics.transcript.processingTimeMs = processingTimeMs
    this.metrics.transcript.avgLineLength = lines > 0 ? Math.round(characters / lines) : 0

    const uptimeMinutes = (Date.now() - this.metrics.startTime) / 60000
    this.metrics.transcript.avgTurnsPerMinute = uptimeMinutes > 0 ? Math.round((turns / uptimeMinutes) * 100) / 100 : 0
  }

  /**
   * Update audio capture metrics
   */
  recordAudioCapture(durationMs: number, noiseFloor: number, peakVolume: number): void {
    this.metrics.audio.totalDurationMs += durationMs
    this.metrics.audio.noiseFloor = noiseFloor
    this.metrics.audio.peakVolume = peakVolume

    if (peakVolume < -40) {
      this.metrics.quality.audioQuality = 'poor'
    } else if (peakVolume < -30) {
      this.metrics.quality.audioQuality = 'fair'
    } else if (peakVolume < -20) {
      this.metrics.quality.audioQuality = 'good'
    } else {
      this.metrics.quality.audioQuality = 'excellent'
    }
  }

  /**
   * Update system resource metrics
   */
  recordSystemMetrics(memoryMb: number, cpuPercent: number): void {
    const currentUptime = Date.now() - this.metrics.startTime

    if (this.metrics.system.peakMemoryMb === 0) {
      this.metrics.system.avgMemoryMb = memoryMb
      this.metrics.system.peakMemoryMb = memoryMb
      this.metrics.system.avgCpuPercent = cpuPercent
      this.metrics.system.peakCpuPercent = cpuPercent
    } else {
      // Running average
      const sampleCount = Math.round(currentUptime / 5000) // Sample every 5 seconds
      this.metrics.system.avgMemoryMb = Math.round(
        (this.metrics.system.avgMemoryMb * (sampleCount - 1) + memoryMb) / sampleCount
      )
      this.metrics.system.peakMemoryMb = Math.max(this.metrics.system.peakMemoryMb, memoryMb)
      this.metrics.system.avgCpuPercent = Math.round(
        (this.metrics.system.avgCpuPercent * (sampleCount - 1) + cpuPercent) / sampleCount
      )
      this.metrics.system.peakCpuPercent = Math.max(this.metrics.system.peakCpuPercent, cpuPercent)
    }

    this.metrics.system.upTimeMs = currentUptime
  }

  /**
   * Get current session metrics
   */
  getMetrics(): SessionMetrics {
    return {
      ...this.metrics,
      endTime: Date.now(),
    }
  }

  /**
   * Export detailed metrics for analysis
   */
  exportDetailedMetrics() {
    return {
      sessionId: this.sessionId,
      metrics: this.metrics,
      sttAttempts: this.sttAttempts,
      llmAttempts: this.llmAttempts,
      errors: this.errorLog,
    }
  }

  /**
   * Generate metrics summary for logging
   */
  getSummary(): string {
    const m = this.metrics
    const upMinutes = Math.round(m.system.upTimeMs / 60000 * 100) / 100

    return `
=== SESSION METRICS (${upMinutes} min) ===
STT: ${m.stt.totalUtterances} utterances, ${(m.stt.avgConfidence * 100).toFixed(1)}% confidence, ${m.stt.failureCount} failures
LLM: ${m.llm.generationsSuccessful}/${m.llm.generationsAttempted} successful, ${m.llm.totalTokensUsed} tokens, ${m.llm.avgResponseTimeMs}ms avg
Audio: ${Math.round(m.audio.totalDurationMs / 1000)}s captured, noise floor ${m.audio.noiseFloor}dB
Transcript: ${m.transcript.totalLines} lines, ${m.transcript.turnCount} turns, ${m.transcript.avgTurnsPerMinute} turns/min
System: ${m.system.avgMemoryMb}MB avg (peak ${m.system.peakMemoryMb}MB), ${m.system.errorsLogged} errors, ${m.system.warningsLogged} warnings
Quality: Audio ${m.quality.audioQuality}, Transcription ${(m.quality.transcriptionAccuracy * 100).toFixed(1)}%, LLM Code ${(m.quality.llmCodeQuality * 100).toFixed(1)}%
    `.trim()
  }

  // ===== Private Methods =====

  private updateSTTMetrics(): void {
    if (this.sttAttempts.length === 0) return

    const avgConfidence = this.sttAttempts.reduce((sum, a) => sum + a.confidence, 0) / this.sttAttempts.length
    const avgLatency = this.sttAttempts.reduce((sum, a) => sum + a.latencyMs, 0) / this.sttAttempts.length

    this.metrics.stt.avgConfidence = Math.round(avgConfidence * 10000) / 10000
    this.metrics.stt.avgLatencyMs = Math.round(avgLatency)
  }

  private updateLLMMetrics(): void {
    if (this.llmAttempts.length === 0) return

    const successful = this.llmAttempts.filter((a) => a.success)
    if (successful.length > 0) {
      this.metrics.llm.avgTokensPerGeneration = Math.round(this.metrics.llm.totalTokensUsed / successful.length)
      this.metrics.llm.avgResponseTimeMs = Math.round(
        successful.reduce((sum, a) => sum + a.responseTimeMs, 0) / successful.length
      )

      // Rough cost estimate (Groq: ~$0.05 per 1M tokens)
      this.metrics.llm.totalCostEstimate = (this.metrics.llm.totalTokensUsed / 1000000) * 0.05
    }
  }
}

export const metricsCollector = new MetricsCollector()

/**
 * Export session metrics to JSON file for analysis
 */
export async function exportMetricsToFile(filePath: string): Promise<void> {
  const data = metricsCollector.exportDetailedMetrics()
  const summary = metricsCollector.getSummary()

  const { writeFileSync } = await import('fs')
  writeFileSync(filePath, JSON.stringify({ summary, ...data }, null, 2))

  logInfo('metrics', 'Metrics exported', { filePath })
}
