import React, { useEffect, useState } from 'react'
import type { SessionMetrics } from '../../../main/services/metricsCollector'

/**
 * Diagnostics panel showing real-time performance metrics and bottleneck detection.
 * Accessible from Settings → Diagnostics tab.
 * Shows: STT quality, LLM performance, memory usage, error rates, etc.
 */

interface DiagnosticsData {
  metrics: SessionMetrics
  bottlenecks: Array<{
    type: string
    severity: string
    description: string
    recommendation: string
  }>
  uptime: number
}

export const DiagnosticsPanel: React.FC = () => {
  const [diagnostics, setDiagnostics] = useState<DiagnosticsData | null>(null)
  const [autoRefresh, setAutoRefresh] = useState(true)

  useEffect(() => {
    const fetchDiagnostics = async () => {
      const ipcRenderer = (window as any).electron?.ipcRenderer
      if (ipcRenderer) {
        const data = await ipcRenderer.invoke('get-diagnostics')
        setDiagnostics(data)
      }
    }

    fetchDiagnostics()
    if (autoRefresh) {
      const interval = setInterval(fetchDiagnostics, 2000) // Refresh every 2 seconds
      return () => clearInterval(interval)
    }
  }, [autoRefresh])

  if (!diagnostics) {
    return <div className="p-4">Loading diagnostics...</div>
  }

  const m = diagnostics.metrics
  const health = calculateHealthScore(m)

  return (
    <div className="space-y-6 p-6 font-mono text-sm">
      {/* Health Score */}
      <div className="rounded border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-900">
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-lg font-semibold">System Health</h3>
          <input
            type="checkbox"
            checked={autoRefresh}
            onChange={(e) => setAutoRefresh(e.target.checked)}
            className="cursor-pointer"
          />
          <label className="ml-2 cursor-pointer text-xs">Auto-refresh</label>
        </div>
        <div className={`text-2xl font-bold ${health >= 80 ? 'text-green-600' : health >= 60 ? 'text-yellow-600' : 'text-red-600'}`}>
          {health.toFixed(0)}%
        </div>
        <div className="mt-2 h-2 overflow-hidden rounded bg-gray-200">
          <div
            className={`h-full transition-all ${health >= 80 ? 'bg-green-500' : health >= 60 ? 'bg-yellow-500' : 'bg-red-500'}`}
            style={{ width: `${health}%` }}
          />
        </div>
      </div>

      {/* Bottlenecks */}
      {diagnostics.bottlenecks.length > 0 && (
        <div className="space-y-2 rounded border border-red-200 bg-red-50 p-4 dark:border-red-900 dark:bg-red-950">
          <h3 className="font-semibold text-red-900 dark:text-red-100">⚠️ Bottlenecks Detected</h3>
          {diagnostics.bottlenecks.map((b, i) => (
            <div key={i} className="space-y-1 text-xs">
              <div className="font-semibold">
                [{b.severity.toUpperCase()}] {b.type}
              </div>
              <div className="text-red-800 dark:text-red-200">{b.description}</div>
              <div className="text-red-700 dark:text-red-300">→ {b.recommendation}</div>
            </div>
          ))}
        </div>
      )}

      {/* STT Metrics */}
      <MetricCard
        title="Speech-to-Text"
        metrics={[
          { label: 'Provider', value: m.stt.provider },
          { label: 'Utterances', value: m.stt.totalUtterances },
          { label: 'Avg Confidence', value: `${(m.stt.avgConfidence * 100).toFixed(1)}%` },
          { label: 'Avg Latency', value: `${m.stt.avgLatencyMs}ms` },
          { label: 'Failures', value: m.stt.failureCount, warn: m.stt.failureCount > 0 },
        ]}
      />

      {/* LLM Metrics */}
      <MetricCard
        title="LLM Code Generation"
        metrics={[
          { label: 'Provider', value: m.llm.provider },
          { label: 'Attempts', value: m.llm.generationsAttempted },
          { label: 'Successful', value: m.llm.generationsSuccessful },
          { label: 'Total Tokens', value: m.llm.totalTokensUsed },
          { label: 'Avg Response Time', value: `${m.llm.avgResponseTimeMs}ms` },
          { label: 'Estimated Cost', value: `$${m.llm.totalCostEstimate.toFixed(4)}` },
        ]}
      />

      {/* Audio Metrics */}
      <MetricCard
        title="Audio Capture"
        metrics={[
          { label: 'Total Duration', value: `${Math.round(m.audio.totalDurationMs / 1000)}s` },
          { label: 'Noise Floor', value: `${m.audio.noiseFloor}dB` },
          { label: 'Peak Volume', value: `${m.audio.peakVolume}dB` },
          { label: 'Quality', value: m.quality.audioQuality },
          { label: 'Buffer Overruns', value: m.audio.bufferOverruns, warn: m.audio.bufferOverruns > 0 },
        ]}
      />

      {/* Transcript Metrics */}
      <MetricCard
        title="Transcript Processing"
        metrics={[
          { label: 'Total Lines', value: m.transcript.totalLines },
          { label: 'Total Characters', value: m.transcript.totalCharacters },
          { label: 'Avg Line Length', value: `${m.transcript.avgLineLength} chars` },
          { label: 'Turns', value: m.transcript.turnCount },
          { label: 'Turns/Minute', value: m.transcript.avgTurnsPerMinute },
          { label: 'Processing Time', value: `${m.transcript.processingTimeMs}ms` },
        ]}
      />

      {/* System Resources */}
      <MetricCard
        title="System Resources"
        metrics={[
          {
            label: 'Memory',
            value: `${m.system.avgMemoryMb}MB avg / ${m.system.peakMemoryMb}MB peak`,
            warn: m.system.peakMemoryMb > 500,
          },
          {
            label: 'CPU',
            value: `${m.system.avgCpuPercent}% avg / ${m.system.peakCpuPercent}% peak`,
            warn: m.system.peakCpuPercent > 80,
          },
          { label: 'Uptime', value: formatUptime(m.system.upTimeMs) },
          { label: 'Errors Logged', value: m.system.errorsLogged, warn: m.system.errorsLogged > 5 },
          { label: 'Warnings Logged', value: m.system.warningsLogged },
        ]}
      />

      {/* Quality Scores */}
      <MetricCard
        title="Quality Scores"
        metrics={[
          {
            label: 'Audio Quality',
            value: m.quality.audioQuality,
            warn: m.quality.audioQuality === 'poor' || m.quality.audioQuality === 'fair',
          },
          { label: 'Transcription Accuracy', value: `${(m.quality.transcriptionAccuracy * 100).toFixed(1)}%` },
          { label: 'LLM Code Quality', value: `${(m.quality.llmCodeQuality * 100).toFixed(1)}%` },
        ]}
      />

      {/* Actions */}
      <div className="flex gap-2">
        <button
          onClick={() => exportMetrics(diagnostics)}
          className="rounded bg-blue-500 px-4 py-2 text-white hover:bg-blue-600"
        >
          📥 Export Metrics
        </button>
        <button
          onClick={() => window.location.reload()}
          className="rounded bg-gray-500 px-4 py-2 text-white hover:bg-gray-600"
        >
          🔄 Refresh
        </button>
        <button
          onClick={() => clearDiagnostics()}
          className="rounded bg-red-500 px-4 py-2 text-white hover:bg-red-600"
        >
          🗑️ Reset
        </button>
      </div>
    </div>
  )
}

interface MetricCardProps {
  title: string
  metrics: Array<{ label: string; value: string | number; warn?: boolean }>
}

const MetricCard: React.FC<MetricCardProps> = ({ title, metrics }) => (
  <div className="space-y-2 rounded border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
    <h3 className="font-semibold">{title}</h3>
    <div className="grid grid-cols-2 gap-3 text-xs">
      {metrics.map((m) => (
        <div key={m.label} className="flex flex-col">
          <span className={`text-xs opacity-70 ${m.warn ? 'text-orange-600 dark:text-orange-400' : ''}`}>{m.label}</span>
          <span className={`font-mono ${m.warn ? 'font-bold text-orange-600 dark:text-orange-400' : ''}`}>{m.value}</span>
        </div>
      ))}
    </div>
  </div>
)

function calculateHealthScore(m: SessionMetrics): number {
  let score = 100

  // STT health
  if (m.stt.avgConfidence < 0.85) score -= 10
  if (m.stt.failureCount > 5) score -= 15
  if (m.stt.avgLatencyMs > 5000) score -= 10

  // LLM health
  const successRate = m.llm.generationsAttempted > 0 ? m.llm.generationsSuccessful / m.llm.generationsAttempted : 1
  if (successRate < 0.9) score -= 15
  if (m.llm.avgResponseTimeMs > 15000) score -= 10

  // System health
  if (m.system.peakMemoryMb > 500) score -= 15
  if (m.system.peakCpuPercent > 80) score -= 10
  if (m.system.errorsLogged > 10) score -= 20

  // Audio quality
  if (m.quality.audioQuality === 'poor') score -= 20
  else if (m.quality.audioQuality === 'fair') score -= 10

  return Math.max(0, score)
}

function formatUptime(ms: number): string {
  const seconds = Math.floor(ms / 1000)
  const minutes = Math.floor(seconds / 60)
  const hours = Math.floor(minutes / 60)
  const days = Math.floor(hours / 24)

  if (days > 0) return `${days}d ${hours % 24}h`
  if (hours > 0) return `${hours}h ${minutes % 60}m`
  if (minutes > 0) return `${minutes}m ${seconds % 60}s`
  return `${seconds}s`
}

async function exportMetrics(diagnostics: DiagnosticsData): Promise<void> {
  const ipcRenderer = (window as any).electron?.ipcRenderer
  if (ipcRenderer) {
    await ipcRenderer.invoke('export-metrics')
    alert('✅ Metrics exported to logs folder')
  }
}

function clearDiagnostics(): void {
  if (confirm('Reset all diagnostic data?')) {
    const ipcRenderer = (window as any).electron?.ipcRenderer
    if (ipcRenderer) {
      ipcRenderer.invoke('reset-diagnostics')
      window.location.reload()
    }
  }
}
