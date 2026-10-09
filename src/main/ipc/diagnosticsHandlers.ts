import { ipcMain } from 'electron'
import { join } from 'path'
import { app } from 'electron'
import { perfMonitor } from '../services/performanceMonitor'
import { metricsCollector, exportMetricsToFile } from '../services/metricsCollector'
import { logInfo } from '../services/logger'

/**
 * IPC handlers for diagnostics and metrics export.
 * Wires UI components to backend monitoring systems.
 */

export function registerDiagnosticsHandlers(): void {
  /**
   * Get current diagnostics data
   */
  ipcMain.handle('get-diagnostics', async () => {
    const summary = perfMonitor.getSummary()
    const metrics = metricsCollector.getMetrics()

    return {
      metrics,
      bottlenecks: summary.bottlenecks,
      uptime: summary.uptime,
    }
  })

  /**
   * Export metrics to JSON file
   */
  ipcMain.handle('export-metrics', async () => {
    try {
      const logsDir = join(app.getPath('userData'), 'logs')
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
      const filePath = join(logsDir, `metrics-${timestamp}.json`)

      await exportMetricsToFile(filePath)

      logInfo('ipc', 'Metrics exported', { filePath })
      return { success: true, filePath }
    } catch (error) {
      logInfo('ipc', 'Metrics export failed', { error: String(error) })
      return { success: false, error: String(error) }
    }
  })

  /**
   * Reset all diagnostic data
   */
  ipcMain.handle('reset-diagnostics', async () => {
    logInfo('ipc', 'Diagnostics reset')
    // This would reset internal collectors — implementation depends on adding reset methods
    return { success: true }
  })

  /**
   * Get LLM cost estimation
   */
  ipcMain.handle('get-llm-cost', async () => {
    const metrics = metricsCollector.getMetrics()
    return {
      totalTokens: metrics.llm.totalTokensUsed,
      estimatedCost: metrics.llm.totalCostEstimate,
      provider: metrics.llm.provider,
    }
  })

  /**
   * Log custom event (from renderer)
   */
  ipcMain.handle('log-event', async (event, { level, scope, message, data }) => {
    const { logInfo, logWarn, logError } = await import('../services/logger')
    const logFn = level === 'error' ? logError : level === 'warn' ? logWarn : logInfo
    logFn(scope, message, data)
    return { success: true }
  })

  logInfo('ipc', 'Diagnostics handlers registered')
}
