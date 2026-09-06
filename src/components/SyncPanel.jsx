import React, { useState, useCallback, useEffect, useRef } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { SyncAdapter } from '../adapters/SyncAdapter'
import { BrowserSyncAdapter } from '../adapters/BrowserSyncAdapter.js'
import {
  isFileSystemAccessSupported,
  getStoredDirectoryHandle,
  selectSaveDirectory,
  clearStoredDirectoryHandle,
} from '../utils/browserSaveDirectory.js'
import { emitToast } from '../hooks/useToasts'
import { SyncModal } from './SyncModal'
import { useUIStore } from '../stores/useUIStore'
import { useDesktopAgent } from '../hooks/useDesktopAgent.js'

export function SyncPanel({ isGameRunning = false, onSyncComplete = null }) {
  const [syncing, setSyncing] = useState(false)
  const [lastResult, setLastResult] = useState(null)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [previewData, setPreviewData] = useState(null)
  const [previewError, setPreviewError] = useState(null)
  const [browserDirHandle, setBrowserDirHandle] = useState(null)
  const [showFsaHelp, setShowFsaHelp] = useState(false)
  const queryClient = useQueryClient()
  const { isAgentConnected, agentStatus, triggerAgentSync } = useDesktopAgent()

  useEffect(() => {
    getStoredDirectoryHandle().then((handle) => {
      if (handle) setBrowserDirHandle(handle)
    }).catch(() => {})
  }, [])

  const autoSyncOnExit = useUIStore((state) => state.autoSyncOnExit)
  const setAutoSyncOnExit = useUIStore((state) => state.setAutoSyncOnExit)

  const { data: syncStatus } = useQuery({
    queryKey: ['syncStatus'],
    queryFn: () => SyncAdapter.status(),
    refetchInterval: 10_000,
    retry: false,
  })

  const isClient = syncStatus?.isClient
  const isConnected = Boolean(syncStatus?.host?.connected)
  const hostName = syncStatus?.host?.hostMachineId
  const isSyncDisabled = syncing || !isConnected || isGameRunning

  useEffect(() => {
    if (!showFsaHelp) return
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') setShowFsaHelp(false)
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [showFsaHelp])

  const handleOpenPreview = useCallback(async () => {
    if (isSyncDisabled) return
    setIsModalOpen(true)
    setPreviewLoading(true)
    setPreviewError(null)
    try {
      const data = await SyncAdapter.preview()
      setPreviewData(data)
    } catch (err) {
      setPreviewError(err.message)
    } finally {
      setPreviewLoading(false)
    }
  }, [isSyncDisabled])

  const handleConfirmSync = useCallback(
    async (selectedFiles) => {
      setSyncing(true)
      try {
        const result = await SyncAdapter.syncNow(selectedFiles)
        setLastResult(result)

        const parts = []
        if (result.pulled?.length) parts.push(`↓ ${result.pulled.length} pulled`)
        if (result.pushed?.length) parts.push(`↑ ${result.pushed.length} pushed`)
        if (result.conflicts?.length) parts.push(`⚠ ${result.conflicts.length} conflicts`)
        if (!parts.length) parts.push('Everything in sync')

        const hasErrors = (result.errors?.length || 0) > 0
        const hasConflicts = (result.conflicts?.length || 0) > 0
        const toastType = hasErrors ? 'error' : hasConflicts ? 'warning' : 'success'
        const toastMsg = hasErrors
          ? `Sync finished with errors: ${result.errors.join('; ')}`
          : `Sync complete: ${parts.join(', ')}`
        emitToast(toastMsg, toastType)

        queryClient.invalidateQueries({ queryKey: ['syncStatus'] })
        if (result.pulled?.length) {
          queryClient.invalidateQueries({ queryKey: ['sharedStash'] })
          onSyncComplete?.()
        }
        setIsModalOpen(false)
      } catch (err) {
        emitToast(`Sync failed: ${err.message}`, 'error')
      } finally {
        setSyncing(false)
      }
    },
    [queryClient, onSyncComplete]
  )

  const handleSyncNow = useCallback(async () => {
    if (isSyncDisabled) return
    setSyncing(true)
    try {
      const result = await SyncAdapter.syncNow()
      setLastResult(result)

      const parts = []
      if (result.pulled?.length) parts.push(`↓ ${result.pulled.length} pulled`)
      if (result.pushed?.length) parts.push(`↑ ${result.pushed.length} pushed`)
      if (result.conflicts?.length) parts.push(`⚠ ${result.conflicts.length} conflicts`)
      if (!parts.length) parts.push('Everything in sync')

      const hasErrors = (result.errors?.length || 0) > 0
      const hasConflicts = (result.conflicts?.length || 0) > 0
      const toastType = hasErrors ? 'error' : hasConflicts ? 'warning' : 'success'
      const toastMsg = hasErrors
        ? `Sync finished with errors: ${result.errors.join('; ')}`
        : `Sync complete: ${parts.join(', ')}`
      emitToast(toastMsg, toastType)

      queryClient.invalidateQueries({ queryKey: ['syncStatus'] })
      if (result.pulled?.length) {
        queryClient.invalidateQueries({ queryKey: ['sharedStash'] })
        onSyncComplete?.()
      }
    } catch (err) {
      emitToast(`Sync failed: ${err.message}`, 'error')
    } finally {
      setSyncing(false)
    }
  }, [isSyncDisabled, queryClient, onSyncComplete])

  const runAutoSync = useCallback(async () => {
    if (syncing || isGameRunning || !isConnected) return
    setSyncing(true)
    try {
      const result = await SyncAdapter.syncNow()
      setLastResult(result)

      const parts = []
      if (result.pulled?.length) parts.push(`↓ ${result.pulled.length} pulled`)
      if (result.pushed?.length) parts.push(`↑ ${result.pushed.length} pushed`)
      if (result.conflicts?.length) parts.push(`⚠ ${result.conflicts.length} conflicts`)

      if (result.pulled?.length || result.pushed?.length || result.conflicts?.length || result.errors?.length) {
        const hasErrors = (result.errors?.length || 0) > 0
        const hasConflicts = (result.conflicts?.length || 0) > 0
        const toastType = hasErrors ? 'error' : hasConflicts ? 'warning' : 'success'
        const toastMsg = hasErrors
          ? `Auto-sync finished with errors: ${result.errors.join('; ')}`
          : `Auto-sync: ${parts.join(', ')}`
        emitToast(toastMsg, toastType)
      }

      queryClient.invalidateQueries({ queryKey: ['syncStatus'] })
      if (result.pulled?.length) {
        queryClient.invalidateQueries({ queryKey: ['sharedStash'] })
        onSyncComplete?.()
      }
    } catch (err) {
      console.warn('Auto-sync failed:', err.message)
      emitToast(`Auto-sync failed: ${err.message}`, 'error')
    } finally {
      setSyncing(false)
    }
  }, [syncing, isGameRunning, isConnected, queryClient, onSyncComplete])

  const prevGameRunningRef = useRef(isGameRunning)

  useEffect(() => {
    const wasRunning = prevGameRunningRef.current
    prevGameRunningRef.current = isGameRunning

    if (!isClient || !isConnected || !autoSyncOnExit) return

    // Auto-sync on D2R exit (was running -> now stopped)
    if (wasRunning && !isGameRunning && !syncing) {
      runAutoSync()
    }
  }, [isGameRunning, isClient, isConnected, autoSyncOnExit, syncing, runAutoSync])

  const handleConnectDirectory = useCallback(async () => {
    if (!isFileSystemAccessSupported()) {
      setShowFsaHelp(true)
      return
    }
    try {
      const handle = await selectSaveDirectory()
      setBrowserDirHandle(handle)
      emitToast(`Connected local saves folder: ${handle.name}`, 'success')
    } catch (err) {
      if (err.name !== 'AbortError') {
        emitToast(`Could not select folder: ${err.message}`, 'error')
      }
    }
  }, [])

  const handleDisconnectDirectory = useCallback(async () => {
    await clearStoredDirectoryHandle()
    setBrowserDirHandle(null)
    emitToast('Disconnected local save folder', 'info')
  }, [])

  const handleBrowserSync = useCallback(async () => {
    if (syncing || isGameRunning || !browserDirHandle) return
    setSyncing(true)
    try {
      const result = await BrowserSyncAdapter.syncWithServer(browserDirHandle)
      setLastResult(result)

      const parts = []
      if (result.pulled?.length) parts.push(`↓ ${result.pulled.length} pulled`)
      if (result.pushed?.length) parts.push(`↑ ${result.pushed.length} pushed`)
      if (result.conflicts?.length) parts.push(`⚠ ${result.conflicts.length} conflicts`)
      if (!parts.length) parts.push('Everything in sync')

      const hasErrors = (result.errors?.length || 0) > 0
      const hasConflicts = (result.conflicts?.length || 0) > 0
      const toastType = hasErrors ? 'error' : hasConflicts ? 'warning' : 'success'
      const toastMsg = hasErrors
        ? `Browser sync finished with errors: ${result.errors.join('; ')}`
        : `Browser sync complete: ${parts.join(', ')}`
      emitToast(toastMsg, toastType)

      queryClient.invalidateQueries({ queryKey: ['syncStatus'] })
      if (result.pulled?.length) {
        queryClient.invalidateQueries({ queryKey: ['sharedStash'] })
        onSyncComplete?.()
      }
    } catch (err) {
      emitToast(`Browser sync failed: ${err.message}`, 'error')
    } finally {
      setSyncing(false)
    }
  }, [syncing, isGameRunning, browserDirHandle, queryClient, onSyncComplete])

  const handleAgentSync = useCallback(async () => {
    if (syncing || agentStatus?.d2rRunning || isGameRunning) return
    setSyncing(true)
    try {
      const result = await triggerAgentSync()
      setLastResult(result)

      const parts = []
      if (result.pulled?.length) parts.push(`↓ ${result.pulled.length} pulled`)
      if (result.pushed?.length) parts.push(`↑ ${result.pushed.length} pushed`)
      if (result.conflicts?.length) parts.push(`⚠ ${result.conflicts.length} conflicts`)
      if (!parts.length) parts.push('Everything in sync')

      const hasErrors = (result.errors?.length || 0) > 0
      const hasConflicts = (result.conflicts?.length || 0) > 0
      const toastType = hasErrors ? 'error' : hasConflicts ? 'warning' : 'success'
      const toastMsg = hasErrors
        ? `Agent sync finished with errors: ${result.errors.join('; ')}`
        : `Agent sync complete: ${parts.join(', ')}`
      emitToast(toastMsg, toastType)

      queryClient.invalidateQueries({ queryKey: ['desktopAgentStatus'] })
      if (result.pulled?.length) {
        queryClient.invalidateQueries({ queryKey: ['sharedStash'] })
        onSyncComplete?.()
      }
    } catch (err) {
      emitToast(`Agent sync failed: ${err.message}`, 'error')
    } finally {
      setSyncing(false)
    }
  }, [syncing, agentStatus?.d2rRunning, isGameRunning, triggerAgentSync, queryClient, onSyncComplete])

  // Server-to-server client mode
  if (isClient) {
    return (
      <>
        <div
          className="sync-panel header-control"
          title={
            syncStatus?.syncUrl
              ? `Sync target: ${syncStatus.syncUrl}${syncStatus?.host?.error ? ` (Error: ${syncStatus.host.error})` : ''}`
              : undefined
          }
        >
          <div className="sync-status" title={syncStatus?.host?.error ? `Error: ${syncStatus.host.error}` : undefined}>
            <span
              className={`sync-indicator ${isConnected ? 'connected' : 'disconnected'}`}
              aria-label={isConnected ? 'Host connected' : 'Host unreachable'}
            />
            <span className="sync-label">
              {isConnected
                ? (hostName ? `Host: ${hostName}` : 'Host connected')
                : (syncStatus?.host?.error ? `Host unreachable: ${syncStatus.host.error}` : 'Host unreachable')}
            </span>
          </div>

          <label className="sync-auto-toggle" title="Automatically sync save files when D2R closes">
            <input
              type="checkbox"
              checked={Boolean(autoSyncOnExit)}
              onChange={(e) => setAutoSyncOnExit(e.target.checked)}
            />
            Auto
          </label>

          <button
            type="button"
            className="btn-d2r btn-sync"
            onClick={handleSyncNow}
            disabled={isSyncDisabled}
            title={
              isGameRunning
                ? 'Cannot sync while Diablo II: Resurrected is running'
                : !isConnected
                ? 'Cannot sync while host is unreachable'
                : 'Synchronize save files with host'
            }
          >
            {syncing ? 'Syncing…' : '🔄 Sync Now'}
          </button>

          <button
            type="button"
            className="btn-d2r btn-sync-diff"
            onClick={handleOpenPreview}
            disabled={isSyncDisabled}
            title={
              isGameRunning
                ? 'Cannot diff while Diablo II: Resurrected is running'
                : !isConnected
                ? 'Cannot sync while host is unreachable'
                : 'Review and select individual save files before syncing'
            }
            style={{ padding: '4px 8px', fontSize: '0.8rem' }}
          >
            Diff
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

        <SyncModal
          isOpen={isModalOpen}
          onClose={() => {
            if (!syncing) setIsModalOpen(false)
          }}
          previewData={previewData}
          isLoading={previewLoading}
          error={previewError}
          isSyncing={syncing}
          onConfirmSync={handleConfirmSync}
        />
      </>
    )
  }

  // Browser-based client mode: connected directory handle
  if (browserDirHandle) {
    return (
      <div className="sync-panel header-control" title="Connected to local save folder via browser File System API">
        <div className="sync-status">
          <span className="sync-indicator connected" aria-label="Folder connected" />
          <span className="sync-label" title={browserDirHandle.name}>
            📁 {browserDirHandle.name}
          </span>
        </div>

        <button
          type="button"
          className="btn-d2r btn-sync"
          onClick={handleBrowserSync}
          disabled={syncing || isGameRunning}
          title={
            isGameRunning
              ? 'Cannot sync while Diablo II: Resurrected is running'
              : 'Synchronize saves in this folder with the server'
          }
        >
          {syncing ? 'Syncing…' : '🔄 Sync Local Saves'}
        </button>

        <button
          type="button"
          className="btn-d2r"
          onClick={handleDisconnectDirectory}
          disabled={syncing}
          title="Disconnect local save folder"
          style={{ padding: '4px 8px', fontSize: '0.8rem', color: '#f08080' }}
        >
          ✕
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

  // Desktop Agent mode: connected to local desktop agent on port 5174
  if (isAgentConnected) {
    const isAgentD2RRunning = Boolean(agentStatus?.d2rRunning)
    const isAgentSyncDisabled = syncing || isAgentD2RRunning || isGameRunning

    return (
      <div
        className="sync-panel header-control"
        title={`Desktop Agent active (${agentStatus?.machineId || 'desktop'}). Saves auto-sync when D2R closes.`}
      >
        <div className="sync-status">
          <span className="sync-indicator connected" aria-label="Desktop Agent connected" />
          <span className="sync-label">
            🖥️ Desktop Agent
          </span>
        </div>

        <button
          type="button"
          className="btn-d2r btn-sync"
          onClick={handleAgentSync}
          disabled={isAgentSyncDisabled}
          title={
            isAgentD2RRunning || isGameRunning
              ? 'Cannot sync while Diablo II: Resurrected is running'
              : 'Synchronize saves between Desktop and Laptop'
          }
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

  // Browser-based client mode: prompt to connect local directory when visiting remotely
  const isLocalHost = typeof window !== 'undefined' &&
    (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')

  if (!isLocalHost) {
    return (
      <>
        <div className="sync-panel header-control">
          <button
            type="button"
            className="btn-d2r btn-sync"
            onClick={handleConnectDirectory}
            title="Connect your local Diablo II Resurrected save folder on this computer to sync saves directly in this browser"
          >
            📁 Connect Local Saves
          </button>
        </div>

        {showFsaHelp && (
          <div className="sync-modal-backdrop" onClick={() => setShowFsaHelp(false)}>
            <div
              className="sync-modal-dialog"
              role="dialog"
              aria-modal="true"
              aria-labelledby="fsa-help-title"
              onClick={(e) => e.stopPropagation()}
              style={{ maxWidth: 540 }}
            >
              <div className="sync-modal-header">
                <h3 id="fsa-help-title" className="sync-modal-title">Enable Browser Save Access in Chrome/Edge</h3>
                <button type="button" className="sync-modal-close" onClick={() => setShowFsaHelp(false)}>✕</button>
              </div>
              <div className="sync-modal-body" style={{ padding: '16px 20px', fontSize: '0.9rem', lineHeight: '1.6' }}>
                <p>
                  Chrome and Edge restrict local folder access on home network HTTP addresses. To allow this browser tab to sync with your local D2R save folder:
                </p>
                <ol style={{ paddingLeft: 20, margin: '12px 0' }}>
                  <li>Open a new tab to: <br /><code style={{ background: '#222', padding: '2px 6px', color: '#ffd700' }}>chrome://flags/#unsafely-treat-insecure-origin-as-secure</code></li>
                  <li>Set the flag to <strong>Enabled</strong>.</li>
                  <li>In the text box below it, paste: <br /><code style={{ background: '#222', padding: '2px 6px', color: '#60c0f0' }}>{typeof window !== 'undefined' ? window.location.origin : 'http://dclaptop:5173'}</code></li>
                  <li>Click <strong>Relaunch</strong> at the bottom of the browser.</li>
                </ol>
                <p style={{ color: '#aaa', fontSize: '0.8rem' }}>
                  Once relaunched, return here and click <strong>📁 Connect Local Saves</strong> to select your Saved Games folder.
                </p>
              </div>
              <div className="sync-modal-footer">
                <button type="button" className="btn-d2r" onClick={() => setShowFsaHelp(false)}>Close</button>
              </div>
            </div>
          </div>
        )}
      </>
    )
  }

  return null
}
