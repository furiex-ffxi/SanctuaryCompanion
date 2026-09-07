import React, { useState, useEffect, useMemo } from 'react'

function formatDateTime(isoString) {
  if (!isoString) return '—'
  const d = new Date(isoString)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function renderFileMetadata(meta, file) {
  if (!meta) {
    if (!file) return <span className="sync-meta-none">Not present</span>
    return <span className="sync-meta-time">{formatDateTime(file.modifiedAt)}</span>
  }

  if (meta.type === 'character') {
    return (
      <div className="sync-meta-details">
        <div className="sync-meta-primary">
          <span className="sync-meta-level">Lvl {meta.level ?? '?'}</span>
          {meta.charClass && <span className="sync-meta-class">{meta.charClass}</span>}
          {typeof meta.itemCount === 'number' && (
            <span className="sync-meta-items">{meta.itemCount} items</span>
          )}
        </div>
        <div className="sync-meta-secondary">
          {typeof meta.gold === 'number' && (
            <span className="sync-meta-gold">{meta.gold.toLocaleString()} gold</span>
          )}
          <span className="sync-meta-time">{formatDateTime(file?.modifiedAt)}</span>
        </div>
      </div>
    )
  }

  if (meta.type === 'shared_stash') {
    return (
      <div className="sync-meta-details">
        <div className="sync-meta-primary">
          {typeof meta.itemCount === 'number' && (
            <span className="sync-meta-items">{meta.itemCount} items</span>
          )}
          {typeof meta.pageCount === 'number' && (
            <span className="sync-meta-pages">{meta.pageCount} pages</span>
          )}
        </div>
        <div className="sync-meta-secondary">
          <span className="sync-meta-time">{formatDateTime(file?.modifiedAt)}</span>
        </div>
      </div>
    )
  }

  return <span className="sync-meta-time">{formatDateTime(file?.modifiedAt)}</span>
}

export function SyncModal({
  isOpen,
  onClose,
  previewData,
  isLoading,
  error,
  isSyncing,
  onConfirmSync,
}) {
  const [selectedFilenames, setSelectedFilenames] = useState(new Set())
  const [resolutions, setResolutions] = useState({})
  const selectAllRef = React.useRef(null)

  useEffect(() => {
    if (!isOpen) return
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && !isSyncing) {
        onClose?.()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, isSyncing, onClose])

  // Default selection: select all files that have action 'push' or 'pull'
  useEffect(() => {
    if (!previewData?.files) return
    const defaultSelected = new Set()
    for (const f of previewData.files) {
      if (f.action === 'push' || f.action === 'pull') {
        defaultSelected.add(f.filename)
      }
    }
    setSelectedFilenames(defaultSelected)
    setResolutions({})
  }, [previewData])

  const actionFiles = useMemo(() => {
    if (!previewData?.files) return []
    return previewData.files.filter((f) => f.action === 'push' || f.action === 'pull' || Boolean(resolutions[f.filename]))
  }, [previewData, resolutions])

  const allActionSelected = actionFiles.length > 0 && actionFiles.every((f) => selectedFilenames.has(f.filename))

  useEffect(() => {
    if (selectAllRef.current) {
      const someSelected = actionFiles.some((f) => selectedFilenames.has(f.filename))
      selectAllRef.current.indeterminate = someSelected && !allActionSelected
    }
  }, [actionFiles, selectedFilenames, allActionSelected])

  const handleToggleSelectAll = () => {
    if (allActionSelected) {
      setSelectedFilenames(new Set())
    } else {
      setSelectedFilenames(new Set(actionFiles.map((f) => f.filename)))
    }
  }

  const handleToggleFile = (filename) => {
    setSelectedFilenames((prev) => {
      const next = new Set(prev)
      if (next.has(filename)) {
        next.delete(filename)
      } else {
        next.add(filename)
      }
      return next
    })
  }

  const handleResolveConflict = (filename, direction) => {
    setResolutions((prev) => {
      const next = { ...prev }
      if (!direction) {
        delete next[filename]
        setSelectedFilenames((s) => {
          const ns = new Set(s)
          ns.delete(filename)
          return ns
        })
      } else {
        next[filename] = direction
        setSelectedFilenames((s) => new Set(s).add(filename))
      }
      return next
    })
  }

  if (!isOpen) return null

  const summary = previewData?.summary || {}

  return (
    <div className="sync-modal-backdrop" onClick={onClose} role="presentation">
      <div
        className="sync-modal-dialog"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="sync-modal-title"
      >
        {/* Header */}
        <div className="sync-modal-header">
          <div className="sync-modal-title-group">
            <h2 id="sync-modal-title" className="sync-modal-title">
              Save Synchronization Preview
            </h2>
            <div className="sync-modal-subtitle">
              <span>Client: <strong>{previewData?.clientMachineId || 'Local'}</strong></span>
              <span className="sync-modal-sep">↔</span>
              <span>Host: <strong>{previewData?.hostMachineId || 'Host'}</strong></span>
            </div>
          </div>
          <button
            type="button"
            className="sync-modal-close"
            onClick={onClose}
            aria-label="Close"
            disabled={isSyncing}
          >
            ✕
          </button>
        </div>

        {/* Content Body */}
        <div className="sync-modal-body">
          {isLoading && (
            <div className="sync-modal-loading">
              <span className="sync-spinner" />
              <span>Inspecting saves and comparing with host…</span>
            </div>
          )}

          {error && (
            <div className="sync-modal-error">
              <strong>Error fetching preview:</strong> {error}
            </div>
          )}

          {!isLoading && !error && previewData && (
            <>
              {/* Summary Stats */}
              <div className="sync-summary-bar">
                <span className="sync-stat-badge sync-stat-push">
                  ↑ {summary.toPush || 0} to Push
                </span>
                <span className="sync-stat-badge sync-stat-pull">
                  ↓ {summary.toPull || 0} to Pull
                </span>
                <span className="sync-stat-badge sync-stat-insync">
                  ✓ {summary.inSync || 0} In Sync
                </span>
                {summary.conflicts > 0 && (
                  <span className="sync-stat-badge sync-stat-conflict">
                    ⚠ {summary.conflicts} Conflicts
                  </span>
                )}
                {summary.warnings > 0 && (
                  <span className="sync-stat-badge sync-stat-warning">
                    ⚠ {summary.warnings} Warnings
                  </span>
                )}
              </div>

              {/* Warning box if any warnings or conflicts */}
              {(summary.conflicts > 0 || summary.warnings > 0) && (
                <div className="sync-alert-box">
                  <strong>Notice:</strong> Some files have progression or item count differences. Review the highlighted reasons below before syncing.
                </div>
              )}

              {/* Table */}
              <div className="sync-table-container">
                <table className="sync-comparison-table">
                  <thead>
                    <tr>
                      <th className="th-check">
                        <input
                          ref={selectAllRef}
                          type="checkbox"
                          checked={allActionSelected}
                          onChange={handleToggleSelectAll}
                          disabled={actionFiles.length === 0 || isSyncing}
                          aria-label="Select all files to sync"
                        />
                      </th>
                      <th className="th-file">Save File</th>
                      <th className="th-action">Direction</th>
                      <th className="th-details">Client (Local)</th>
                      <th className="th-details">Host (Remote)</th>
                      <th className="th-reason">Comparison & Reason</th>
                    </tr>
                  </thead>
                  <tbody>
                    {previewData.files?.map((f) => {
                      const isResolved = Boolean(resolutions[f.filename])
                      const isActionable = f.action === 'push' || f.action === 'pull' || isResolved
                      const isSelected = selectedFilenames.has(f.filename)

                      let actionBadge = null
                      if (resolutions[f.filename] === 'push') {
                        actionBadge = <span className="sync-badge badge-push">↑ Force Push</span>
                      } else if (resolutions[f.filename] === 'pull') {
                        actionBadge = <span className="sync-badge badge-pull">↓ Force Pull</span>
                      } else if (f.action === 'push') {
                        actionBadge = <span className="sync-badge badge-push">↑ Push (to Host)</span>
                      } else if (f.action === 'pull') {
                        actionBadge = <span className="sync-badge badge-pull">↓ Pull (to Client)</span>
                      } else if (f.action === 'conflict') {
                        actionBadge = <span className="sync-badge badge-conflict">⚠ Conflict</span>
                      } else {
                        actionBadge = <span className="sync-badge badge-insync">✓ In Sync</span>
                      }

                      return (
                        <tr
                          key={f.filename}
                          className={`sync-row sync-row-${f.action} ${isSelected ? 'row-selected' : ''}`}
                        >
                          <td className="td-check">
                            <input
                              type="checkbox"
                              checked={isSelected}
                              disabled={!isActionable || isSyncing}
                              onChange={() => handleToggleFile(f.filename)}
                              aria-label={`Select ${f.filename}`}
                            />
                          </td>
                          <td className="td-file">
                            <span className="sync-filename">{f.filename}</span>
                            <span className="sync-filetype">
                              {f.type === 'character' ? 'Character' : 'Shared Stash'}
                            </span>
                          </td>
                          <td className="td-action">{actionBadge}</td>
                          <td className="td-details">
                            {renderFileMetadata(f.local?.metadata, f.local)}
                          </td>
                          <td className="td-details">
                            {renderFileMetadata(f.server?.metadata, f.server)}
                          </td>
                          <td className="td-reason">
                            <div className="sync-reason-text">{f.reason}</div>
                            {f.warnings?.length > 0 && (
                              <div className="sync-reason-warnings">
                                {f.warnings.map((w, idx) => (
                                  <div key={idx} className="sync-warning-item">
                                    ⚠ {w}
                                  </div>
                                ))}
                              </div>
                            )}
                            {f.action === 'conflict' && (
                              <div className="sync-conflict-actions" style={{ marginTop: '8px', display: 'flex', gap: '6px', alignItems: 'center' }}>
                                <span style={{ fontSize: '0.75rem', color: '#ffb74d' }}>Resolve:</span>
                                <button
                                  type="button"
                                  className={`btn-d2r ${resolutions[f.filename] === 'push' ? 'btn-active' : 'btn-secondary'}`}
                                  style={{ padding: '2px 8px', fontSize: '0.75rem', background: resolutions[f.filename] === 'push' ? '#2e7d32' : undefined }}
                                  onClick={() => handleResolveConflict(f.filename, 'push')}
                                  disabled={isSyncing}
                                  title="Force push: overwrite host with this client save"
                                >
                                  Keep Client (Push)
                                </button>
                                <button
                                  type="button"
                                  className={`btn-d2r ${resolutions[f.filename] === 'pull' ? 'btn-active' : 'btn-secondary'}`}
                                  style={{ padding: '2px 8px', fontSize: '0.75rem', background: resolutions[f.filename] === 'pull' ? '#1565c0' : undefined }}
                                  onClick={() => handleResolveConflict(f.filename, 'pull')}
                                  disabled={isSyncing}
                                  title="Force pull: overwrite client with host save"
                                >
                                  Keep Host (Pull)
                                </button>
                                {resolutions[f.filename] && (
                                  <button
                                    type="button"
                                    className="btn-d2r"
                                    style={{ padding: '2px 6px', fontSize: '0.75rem', color: '#ff8a80' }}
                                    onClick={() => handleResolveConflict(f.filename, null)}
                                    disabled={isSyncing}
                                    title="Undo resolution"
                                  >
                                    ✕
                                  </button>
                                )}
                              </div>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="sync-modal-footer">
          <div className="sync-footer-note">
            🛡 Pre-sync safety backups are automatically created in <code>backups/</code> before overwriting.
          </div>
          <div className="sync-footer-actions">
            <button
              type="button"
              className="btn-d2r btn-cancel"
              onClick={onClose}
              disabled={isSyncing}
            >
              Cancel
            </button>
            <button
              type="button"
              className="btn-d2r btn-sync-confirm"
              onClick={() => onConfirmSync(Array.from(selectedFilenames), resolutions)}
              disabled={selectedFilenames.size === 0 || isSyncing || isLoading}
            >
              {isSyncing
                ? 'Syncing…'
                : `Confirm & Sync (${selectedFilenames.size} file${selectedFilenames.size === 1 ? '' : 's'})`}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
