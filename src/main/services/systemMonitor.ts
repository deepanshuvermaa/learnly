import { app } from 'electron'
import { metricsCollector } from './metricsCollector'
import { logInfo } from './logger'

/**
 * System-level monitoring: memory, CPU, etc.
 * Runs periodically during app lifecycle to track resource usage.
 */

let monitorInterval: NodeJS.Timeout | null = null
const MONITOR_INTERVAL_MS = 5000 // Sample every 5 seconds

export function startSystemMonitor(): void {
  if (monitorInterval) return

  logInfo('system:monitor', 'System monitoring started')

  monitorInterval = setInterval(() => {
    try {
      const memUsage = process.memoryUsage()
      const memoryMb = Math.round(memUsage.heapUsed / 1024 / 1024)

      // Note: Accurate CPU usage requires native modules like 'os-utils'
      // For now, use a placeholder. In production, integrate native CPU metrics.
      const cpuPercent = 0 // Would need native module

      metricsCollector.recordSystemMetrics(memoryMb, cpuPercent)
    } catch (error) {
      logInfo('system:monitor', 'Failed to collect system metrics', { error: String(error) })
    }
  }, MONITOR_INTERVAL_MS)
}

export function stopSystemMonitor(): void {
  if (monitorInterval) {
    clearInterval(monitorInterval)
    monitorInterval = null
    logInfo('system:monitor', 'System monitoring stopped')
  }
}

export function getSystemMetrics(): { memoryMb: number; cpuPercent: number } {
  const memUsage = process.memoryUsage()
  return {
    memoryMb: Math.round(memUsage.heapUsed / 1024 / 1024),
    cpuPercent: 0 // Placeholder
  }
}

// Auto-start on app ready
app.on('ready', () => {
  startSystemMonitor()
})

app.on('quit', () => {
  stopSystemMonitor()
})
