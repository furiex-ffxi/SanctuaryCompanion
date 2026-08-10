import { useState, useCallback } from 'react';

export function BackupScanPanel() {
  const [state, setState] = useState('idle'); // idle | scanning | results
  const [report, setReport] = useState(null);
  const [selected, setSelected] = useState(new Set());
  const [deleting, setDeleting] = useState(false);
  const [deleteResult, setDeleteResult] = useState(null);

  const runScan = useCallback(async () => {
    setState('scanning');
    setReport(null);
    setSelected(new Set());
    setDeleteResult(null);
    try {
      const res = await fetch('/__backup_scan');
      const data = await res.json();
      setReport(data);
      setState('results');
    } catch (err) {
      setReport({ error: err.message });
      setState('results');
    }
  }, []);

  const toggleAll = (checked) => {
    if (!report?.corrupted) return;
    if (checked) {
      setSelected(new Set(report.corrupted.map((_, i) => i)));
    } else {
      setSelected(new Set());
    }
  };

  const toggleOne = (idx) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  };

  const deleteSelected = useCallback(async () => {
    if (!report?.corrupted || selected.size === 0) return;
    setDeleting(true);
    const filesToDelete = [...selected].map((i) => ({
      folder: report.corrupted[i].folder,
      file: report.corrupted[i].file,
    }));
    try {
      const res = await fetch('/__backup_delete_corrupted', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ files: filesToDelete }),
      });
      const result = await res.json();
      setDeleteResult(result);
    } catch (err) {
      setDeleteResult({ error: err.message });
    } finally {
      setDeleting(false);
      // Re-scan to confirm
      await runScan();
    }
  }, [report, selected, runScan]);

  const allSelected =
    report?.corrupted?.length > 0 && selected.size === report.corrupted.length;

  return (
    <div className="backup-scan-panel">
      <div className="backup-scan-header">
        <h2>🛠️ Backup Scanner</h2>
        <p className="backup-scan-desc">
          Scans all timestamped backup folders for corrupted <code>.d2s</code> and{' '}
          <code>.d2i</code> files. Corrupted files are identified by attempting to parse
          them with the <code>@dschu012/d2s</code> library. Review the results before deleting.
        </p>
        <button
          className="btn-d2r btn-primary backup-scan-btn"
          onClick={runScan}
          disabled={state === 'scanning' || deleting}
        >
          {state === 'scanning' ? '⟳ Scanning…' : '🔍 Scan Backups'}
        </button>
      </div>

      {state === 'scanning' && (
        <div className="backup-scan-status">
          <span className="spinner" /> Scanning all backup folders…
        </div>
      )}

      {state === 'results' && report && (
        <>
          {report.error ? (
            <div className="backup-scan-error">❌ Scan failed: {report.error}</div>
          ) : (
            <>
              <div className="backup-scan-summary">
                <span className="scan-badge scan-badge-folders">
                  📁 {report.backupFolders} backup folders
                </span>
                <span className="scan-badge scan-badge-scanned">
                  🔎 {report.filesScanned} files scanned
                </span>
                <span className={`scan-badge ${report.corrupted.length > 0 ? 'scan-badge-corrupted' : 'scan-badge-ok'}`}>
                  {report.corrupted.length > 0
                    ? `⚠️ ${report.corrupted.length} corrupted`
                    : `✅ All clean`}
                </span>
                <span className="scan-badge scan-badge-ok">
                  ✅ {report.ok} valid
                </span>
              </div>

              {deleteResult && !deleteResult.error && (
                <div className="backup-delete-result">
                  🗑️ Deleted {deleteResult.deleted?.length ?? 0} file(s)
                  {deleteResult.removedFolders?.length > 0 &&
                    ` · Removed ${deleteResult.removedFolders.length} empty folder(s)`}
                </div>
              )}

              {report.corrupted.length === 0 ? (
                <div className="backup-scan-clean">
                  ✅ No corrupted files found. All backups are healthy.
                </div>
              ) : (
                <>
                  <div className="backup-scan-table-header">
                    <span>
                      {selected.size} of {report.corrupted.length} selected
                    </span>
                    <button
                      className="btn-d2r btn-danger backup-delete-btn"
                      onClick={deleteSelected}
                      disabled={selected.size === 0 || deleting}
                    >
                      {deleting ? '⟳ Deleting…' : `🗑️ Delete Selected (${selected.size})`}
                    </button>
                  </div>

                  <table className="backup-scan-table">
                    <thead>
                      <tr>
                        <th>
                          <input
                            type="checkbox"
                            checked={allSelected}
                            onChange={(e) => toggleAll(e.target.checked)}
                          />
                        </th>
                        <th>Backup Folder</th>
                        <th>Filename</th>
                        <th>Type</th>
                        <th>Parse Error</th>
                      </tr>
                    </thead>
                    <tbody>
                      {report.corrupted.map((item, idx) => (
                        <tr key={idx} className={selected.has(idx) ? 'row-selected' : ''}>
                          <td>
                            <input
                              type="checkbox"
                              checked={selected.has(idx)}
                              onChange={() => toggleOne(idx)}
                            />
                          </td>
                          <td className="folder-cell">{item.folder}</td>
                          <td className="file-cell">{item.file}</td>
                          <td>
                            <span className={`type-badge type-${item.type}`}>
                              .{item.type}
                            </span>
                          </td>
                          <td className="error-cell" title={item.error}>
                            {item.error?.slice(0, 80)}{item.error?.length > 80 ? '…' : ''}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}
