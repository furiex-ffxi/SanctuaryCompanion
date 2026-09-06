import React, { useState, useCallback } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { SyncAdapter } from '../adapters/SyncAdapter'
import { emitToast } from '../hooks/useToasts'

export function SyncPanel() {
  const [syncing, setSyncing] = useState(false)
  const [lastResult, setLastResult] = useState(null)
  const queryClient = useQueryClient()

  const { data: syncStatus } = useQuery({
    queryKey: ['syncStatus'],
    queryFn: () => SyncAdapter.status(),
    refetchInterval: 10_000,
    retry: false,
  })

  const isClient = syncStatus?.isClient
  const isConnected = Boolean(syncStatus?.host?.connected)
  const hostName = syncStatus?.host?.hostMachineId

  const handleSync = useCallback(async () => {
    setSyncing(true)
    try {
      const result = await SyncAdapter.syncNow()
      setLastResult(result)

      const parts = []
      if (result.pulled?.length) parts.push(`↓ ${result.pulled.length} pulled`)
      if (result.pushed?.length) parts.push(`↑ ${result.pushed.length} pushed`)
      if (result.conflicts?.length) parts.push(`⚠ ${result.conflicts.length} conflicts`)
      if (!parts.length) parts.push('Everything in sync')

      const toastType = result.errors?.length ? 'error' : 'success'
      const toastMsg = result.errors?.length
        ? `Sync finished with errors: ${result.errors.join('; ')}`
        : `Sync complete: ${parts.join(', ')}`
      emitToast(toastMsg, toastType)

      if (result.pulled?.length) {
        queryClient.invalidateQueries({ queryKey: ['sharedStash'] })
      }
    } catch (err) {
      emitToast(`Sync failed: ${err.message}`, 'error')
    } finally {
      setSyncing(false)
    }
  }, [queryClient])

  // Only render in client mode
  if (!isClient) return null

  return (
    <div className="sync-panel header-control" title={syncStatus?.syncUrl ? `Syncing with ${syncStatus.syncUrl}` : undefined}>
      <div className="sync-status">
        <span
          className={`sync-indicator ${isConnected ? 'connected' : 'disconnected'}`}
          aria-label={isConnected ? 'Host connected' : 'Host unreachable'}
        />
        <span className="sync-label">
          {isConnected ? (hostName ? `Host: ${hostName}` : 'Host connected') : 'Host unreachable'}
        </span>
      </div>

      <button
        type="button"
        className="btn-d2r btn-sync"
        onClick={handleSync}
        disabled={syncing || !isConnected}
        title={!isConnected ? 'Cannot sync while host is unreachable' : 'Synchronize save files with host'}
      >
        {syncing ? 'Syncing…' : '🔄 Sync Now'}
      </button>

      {lastResult && (
        <div className="sync-result-badge" title={new Date(lastResult.timestamp).toLocaleTimeString()}>
          {lastResult.pulled?.length > 0 && <span className="sync-pulled">↓{lastResult.pulled.length}</span>}
          {lastResult.pushed?.length > 0 && <span className="sync-pushed">↑{lastResult.pushed.length}</span>}
          {lastResult.conflicts?.length > 0 && <span className="sync-conflicts">⚠{lastResult.conflicts.length}</span>}
          {!lastResult.pulled?.length && !lastResult.pushed?.length && !lastResult.conflicts?.length && (
            <span className="sync-ok">✓ In Sync</span>
          )}
        </div>
      )}
    </div>
  )
}
