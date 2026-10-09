import { logInfo, logWarn, logError } from './logger'

/**
 * Performance monitoring and bottleneck detection.
 * Tracks: operation latency, memory, CPU, audio quality, LLM response times, etc.
 * Identifies patterns that indicate performance degradation.
 */

export interface OperationMetric {
  name: string
  durationMs: number
  timestamp: number
  tags?: Record<string, string | number>
  success: boolean
  errorMessage?: string
}

export interface SystemMetric {
  timestamp: number
  memoryMb: number
  cpuPercent: number
  audioLatencyMs: number
  sttQuality: number // 0-1
  llmResponseTimeMs?: number
}

export interface BottleneckReport {
  type: 'latency' | 'memory' | 'cpu' | 'audio' | 'stt' | 'llm'
  severity: 'low' | 'medium' | 'high' | 'critical'
  description: string
  metrics: Partial<SystemMetric>
  recommendation: string
}

class PerformanceMonitor {
  private operations: OperationMetric[] = []
  private systemMetrics: SystemMetric[] = []
  private bottlenecks: BottleneckReport[] = []
  private maxHistorySize = 1000

  // Thresholds for bottleneck detection
  private readonly THRESHOLDS = {
    operationLatencyMs: {
      stt: 5000, // Speech-to-text should complete in <5s
      llmGeneration: 15000, // Code gen <15s
      transcriptIngest: 2000, // Processing transcript <2s
      uiRender: 100, // UI updates <100ms
    },
    memoryMb: 500, // Alert if >500MB
    cpuPercent: 80, // Alert if >80%
    audioLatencyMs: 500, // Audio latency >500ms
    sttQuality: 0.7, // Confidence threshold
  }

  /**
   * Record operation timing and success/failure
   */
  recordOperation(metric: OperationMetric): void {
    this.operations.push(metric)

    // Trim history if too large
    if (this.operations.length > this.maxHistorySize) {
      this.operations.shift()
    }

    // Log operation
    const status = metric.success ? 'OK' : 'FAIL'
    const tags = metric.tags ? JSON.stringify(metric.tags) : ''
    logInfo('perf', `[${status}] ${metric.name} ${metric.durationMs}ms ${tags}`, {
      duration: metric.durationMs,
      success: metric.success,
      error: metric.errorMessage,
    })

    // Check for latency bottleneck
    this.checkLatencyBottleneck(metric)
  }

  /**
   * Record system-level metrics
   */
  recordSystemMetric(metric: SystemMetric): void {
    this.systemMetrics.push(metric)

    if (this.systemMetrics.length > this.maxHistorySize) {
      this.systemMetrics.shift()
    }

    logInfo('perf:sys', `Memory: ${metric.memoryMb}MB | CPU: ${metric.cpuPercent}% | Audio Latency: ${metric.audioLatencyMs}ms | STT Quality: ${(metric.sttQuality * 100).toFixed(1)}%`)

    this.checkSystemBottlenecks(metric)
  }

  /**
   * Record LLM inference metrics
   */
  recordLLMMetric(provider: string, tokensUsed: number, durationMs: number, success: boolean): void {
    const metric: OperationMetric = {
      name: `llm:${provider}`,
      durationMs,
      timestamp: Date.now(),
      tags: { provider, tokensUsed },
      success,
    }
    this.recordOperation(metric)

    if (durationMs > this.THRESHOLDS.operationLatencyMs.llmGeneration) {
      this.reportBottleneck({
        type: 'llm',
        severity: durationMs > this.THRESHOLDS.operationLatencyMs.llmGeneration * 1.5 ? 'high' : 'medium',
        description: `${provider} response slow: ${durationMs}ms (${tokensUsed} tokens)`,
        metrics: { timestamp: Date.now(), llmResponseTimeMs: durationMs },
        recommendation: `Consider using faster provider (Groq) or reducing system prompt size (currently ${tokensUsed} tokens)`,
      })
    }
  }

  /**
   * Record STT (speech-to-text) quality
   */
  recordSTTMetric(confidence: number, latencyMs: number, provider: string): void {
    const metric: SystemMetric = {
      timestamp: Date.now(),
      memoryMb: this.getMemoryUsage(),
      cpuPercent: 0, // Would need native module for accurate CPU
      audioLatencyMs: latencyMs,
      sttQuality: confidence,
    }
    this.recordSystemMetric(metric)

    if (confidence < this.THRESHOLDS.sttQuality) {
      this.reportBottleneck({
        type: 'stt',
        severity: confidence < 0.5 ? 'high' : 'medium',
        description: `${provider} confidence low: ${(confidence * 100).toFixed(1)}%`,
        metrics: { sttQuality: confidence, audioLatencyMs: latencyMs },
        recommendation: 'Check microphone quality, reduce background noise, or consider different STT provider',
      })
    }
  }

  /**
   * Record transcript ingestion metrics
   */
  recordTranscriptIngestion(lines: number, durationMs: number): void {
    const metric: OperationMetric = {
      name: 'transcript:ingest',
      durationMs,
      timestamp: Date.now(),
      tags: { lines },
      success: true,
    }
    this.recordOperation(metric)

    if (durationMs > this.THRESHOLDS.operationLatencyMs.transcriptIngest) {
      this.reportBottleneck({
        type: 'latency',
        severity: 'medium',
        description: `Transcript ingestion slow: ${durationMs}ms for ${lines} lines`,
        metrics: { timestamp: Date.now() },
        recommendation: 'Consider chunking transcript processing or optimizing search algorithm',
      })
    }
  }

  /**
   * Record UI render times
   */
  recordUIRender(componentName: string, durationMs: number): void {
    const metric: OperationMetric = {
      name: `ui:render:${componentName}`,
      durationMs,
      timestamp: Date.now(),
      success: durationMs < 1000,
    }
    this.recordOperation(metric)

    if (durationMs > this.THRESHOLDS.operationLatencyMs.uiRender * 2) {
      logWarn('perf:ui', `Slow render: ${componentName} took ${durationMs}ms`)
    }
  }

  /**
   * Get performance summary for current session
   */
  getSummary(): {
    operationStats: Record<string, { count: number; avgMs: number; failureRate: number }>
    bottlenecks: BottleneckReport[]
    memoryTrend: 'stable' | 'increasing' | 'spiking'
    uptime: number
  } {
    const stats: Record<string, { count: number; total: number; failures: number }> = {}

    for (const op of this.operations) {
      if (!stats[op.name]) {
        stats[op.name] = { count: 0, total: 0, failures: 0 }
      }
      stats[op.name].count++
      stats[op.name].total += op.durationMs
      if (!op.success) stats[op.name].failures++
    }

    const operationStats = Object.entries(stats).reduce(
      (acc, [name, { count, total, failures }]) => {
        acc[name] = {
          count,
          avgMs: Math.round(total / count),
          failureRate: count > 0 ? failures / count : 0,
        }
        return acc
      },
      {} as Record<string, { count: number; avgMs: number; failureRate: number }>
    )

    const memoryTrend = this.analyzeMemoryTrend()

    return {
      operationStats,
      bottlenecks: this.bottlenecks.slice(-10), // Last 10 bottlenecks
      memoryTrend,
      uptime: Date.now() - (this.operations[0]?.timestamp || Date.now()),
    }
  }

  /**
   * Export detailed logs for analysis
   */
  exportLogs(): {
    operations: OperationMetric[]
    systemMetrics: SystemMetric[]
    bottlenecks: BottleneckReport[]
    summary: ReturnType<typeof this.getSummary>
  } {
    return {
      operations: this.operations,
      systemMetrics: this.systemMetrics,
      bottlenecks: this.bottlenecks,
      summary: this.getSummary(),
    }
  }

  // ===== Private Methods =====

  private checkLatencyBottleneck(metric: OperationMetric): void {
    const threshold = (this.THRESHOLDS.operationLatencyMs as Record<string, number>)[metric.name.split(':')[1]] || 5000

    if (metric.durationMs > threshold) {
      this.reportBottleneck({
        type: 'latency',
        severity: metric.durationMs > threshold * 2 ? 'high' : 'medium',
        description: `${metric.name} took ${metric.durationMs}ms (threshold: ${threshold}ms)`,
        metrics: { timestamp: metric.timestamp },
        recommendation: `Investigate ${metric.name} performance or consider async batching`,
      })
    }
  }

  private checkSystemBottlenecks(metric: SystemMetric): void {
    if (metric.memoryMb > this.THRESHOLDS.memoryMb) {
      this.reportBottleneck({
        type: 'memory',
        severity: metric.memoryMb > this.THRESHOLDS.memoryMb * 1.5 ? 'high' : 'medium',
        description: `Memory usage high: ${metric.memoryMb}MB`,
        metrics: metric,
        recommendation: 'Check for memory leaks, reduce transcript history, or garbage collect',
      })
    }

    if (metric.audioLatencyMs > this.THRESHOLDS.audioLatencyMs) {
      this.reportBottleneck({
        type: 'audio',
        severity: metric.audioLatencyMs > this.THRESHOLDS.audioLatencyMs * 2 ? 'high' : 'medium',
        description: `Audio latency high: ${metric.audioLatencyMs}ms`,
        metrics: metric,
        recommendation: 'Check microphone driver, reduce system load, or adjust buffer size',
      })
    }
  }

  private analyzeMemoryTrend(): 'stable' | 'increasing' | 'spiking' {
    if (this.systemMetrics.length < 10) return 'stable'

    const recent = this.systemMetrics.slice(-10).map((m) => m.memoryMb)
    const avg = recent.reduce((a, b) => a + b, 0) / recent.length
    const max = Math.max(...recent)
    const min = Math.min(...recent)

    if (max - min > avg * 0.5) return 'spiking'
    if (recent[recent.length - 1] > recent[0] * 1.1) return 'increasing'
    return 'stable'
  }

  private reportBottleneck(bottleneck: BottleneckReport): void {
    this.bottlenecks.push(bottleneck)
    if (this.bottlenecks.length > 100) this.bottlenecks.shift()

    const logLevel = bottleneck.severity === 'critical' ? logError : bottleneck.severity === 'high' ? logWarn : logInfo
    logLevel('bottleneck', `[${bottleneck.severity.toUpperCase()}] ${bottleneck.type}: ${bottleneck.description}`, {
      recommendation: bottleneck.recommendation,
    })
  }

  private getMemoryUsage(): number {
    const usage = process.memoryUsage()
    return Math.round(usage.heapUsed / 1024 / 1024) // MB
  }
}

export const perfMonitor = new PerformanceMonitor()
