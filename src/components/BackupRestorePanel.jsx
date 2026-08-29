import React, { useEffect, useState } from 'react';
import { D2SParserAdapter } from '../adapters/D2SParserAdapter.js';

export function BackupRestorePanel({ isGameRunning, onRestored }) {
  const [open, setOpen] = useState(false);
  const [backups, setBackups] = useState([]);
  const [selected, setSelected] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(null);

  useEffect(() => {
    if (!open) return;
    setMessage(null);
    D2SParserAdapter.listBackups()
      .then(items => { setBackups(items); setSelected(current => current || items[0]?.timestamp || ''); })
      .catch(error => setMessage({ type: 'error', text: error.message }));
  }, [open]);

  const snapshot = backups.find(item => item.timestamp === selected);
  const restore = async () => {
    if (isGameRunning || !snapshot) return;
    const description = snapshot.files.join(', ');
    if (!confirm(`Restore ${description} from ${snapshot.timestamp}? A safety backup of the current files will be created first.`)) return;
    setBusy(true);
    setMessage(null);
    try {
      const result = await D2SParserAdapter.restoreBackup(snapshot.timestamp, snapshot.files);
      setMessage({ type: 'success', text: `Restored ${result.restored.join(', ')}. Safety copy: ${result.safetyTimestamp}` });
      onRestored?.();
    } catch (error) {
      setMessage({ type: 'error', text: error.message });
    } finally {
      setBusy(false);
    }
  };

  return <div className="backup-restore-control">
    <button className="header-control btn-d2r btn-secondary" type="button" onClick={() => setOpen(value => !value)} aria-expanded={open}>Restore Snapshot</button>
    {open && <div className="backup-restore-menu" role="dialog" aria-label="Restore save snapshot">
      <strong>Restore all files from a snapshot</strong>
      <p>Includes every character and shared-stash file captured at that time. Infinite Stash remains SQLite-backed; pending vault items can be recovered from the vault list.</p>
      {backups.length ? <>
        <label htmlFor="backup-snapshot-select">Snapshot</label>
        <select id="backup-snapshot-select" value={selected} onChange={event => setSelected(event.target.value)}>
          {backups.map(item => <option key={item.timestamp} value={item.timestamp}>{item.timestamp} — {item.files.length} save files{item.vaultReference ? ' + Infinite Stash' : ''}</option>)}
        </select>
        {snapshot && <small>{snapshot.files.join(' · ')}</small>}
        <button className="btn-d2r" type="button" disabled={busy || isGameRunning} onClick={restore}>{busy ? 'Restoring…' : 'Restore selected snapshot'}</button>
      </> : <span role="status">No save snapshots found.</span>}
      {isGameRunning && <small className="backup-restore-warning">Close D2R before restoring.</small>}
      {message && <div className={message.type === 'error' ? 'search-error' : 'backup-banner-success'} role="status">{message.text}</div>}
    </div>}
  </div>;
}
