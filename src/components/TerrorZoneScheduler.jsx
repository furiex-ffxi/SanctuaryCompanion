import React, { useState, useEffect } from 'react';

export function TerrorZoneScheduler({ onClose, addToast }) {
  const [schedule, setSchedule] = useState([]);
  const [uniqueZones, setUniqueZones] = useState([]);
  const [selectedZone, setSelectedZone] = useState('');
  const [loading, setLoading] = useState(false);
  const [showRestoreHelp, setShowRestoreHelp] = useState(false);
  const [repairing, setRepairing] = useState(false);
  const [mfTimerDir, setMfTimerDir] = useState(() => localStorage.getItem('mf_timer_dir') || '');

  useEffect(() => {
    fetch('/data/tz-2023-localized.json')
      .then(r => r.json())
      .then(data => {
        setSchedule(data);
        const zones = [...new Set(data.map(item => item.zone.enUS))].sort();
        setUniqueZones(zones);
        if (zones.length > 0) setSelectedZone(zones[0]);
      })
      .catch(err => {
        console.error('Failed to load TZ schedule', err);
        addToast('Failed to load Terror Zone schedule', 'error');
      });
  }, [addToast]);

  const handleRepairMfTimer = async () => {
    setRepairing(true);
    try {
      localStorage.setItem('mf_timer_dir', mfTimerDir.trim());
      const res = await fetch('/__mf_timer_repair', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ directory: mfTimerDir.trim() })
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
      if (data.repaired) {
        addToast(`Repaired ${data.profile}: session time restored to ${Math.round(data.sessionTime)} seconds. Restart MF Timer to load it.`, 'success');
      } else {
        addToast(`${data.profile} does not have a negative session time.`, 'success');
      }
    } catch (err) {
      addToast(`MF Timer repair failed: ${err.message}`, 'error');
    } finally {
      setRepairing(false);
    }
  };
  const handleRestoreTime = async () => {
    setLoading(true);
    try {
      const res = await fetch('/__d2r_set_time', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ restore: true })
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
      addToast('System time restored. Please Save and Exit in D2R NOW.', 'success');
      localStorage.removeItem('tz_max_time'); // reset max time tracking since they followed safety procedure
      setUniqueZones([...uniqueZones]); // force re-render
    } catch (err) {
      console.error(err);
      addToast(`Failed to restore time: ${err.message}`, 'error');
    } finally {
      setLoading(false);
    }
  };

  const handlePinZone = async () => {
    if (!selectedZone) return;
    
    // Find the nearest future occurrence (or just any occurrence, since time is relative)
    const now = new Date();
    let nextOccurrences = schedule.filter(item => item.zone.enUS === selectedZone);
    if (nextOccurrences.length === 0) {
      addToast('No schedule found for this zone.', 'error');
      return;
    }
    
    // Pick the next occurrence after current system time AND any previously simulated future time
    const lastMaxTime = parseInt(localStorage.getItem('tz_max_time') || '0', 10);
    const minRequiredTime = Math.max(now.getTime(), lastMaxTime);

    let target = nextOccurrences.find(item => new Date(item.datetime).getTime() > minRequiredTime);
    if (!target) {
      addToast('No future occurrences of this zone found after the latest simulated time.', 'error');
      return;
    }

    const targetTime = new Date(target.datetime).getTime();
    localStorage.setItem('tz_max_time', targetTime.toString());

    setLoading(true);
    try {
      const res = await fetch('/__d2r_set_time', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ datetime: target.datetime })
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
      addToast(`System time changed! ${selectedZone} is now active.`, 'success');
    } catch (err) {
      console.error(err);
      addToast(`Failed to change time: ${err.message}`, 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay">
      <div className="modal-content tz-modal">
        <h3>Pin Terror Zone (Offline)</h3>
        <p className="tz-desc">
          This will change your Windows system clock to activate the selected Terror Zone in Single Player.
          <strong> Note: UAC Prompt will appear.</strong>
          <br/><br/>
          To protect your save files, we ensure the clock only moves FORWARD into the future.
          <br/><br/>
          <strong>Close MF Timer before the jump, reopen it after the clock is forward, and close it again before restoring the clock.</strong>{' '}
          This keeps its time.time() clock from seeing a discontinuity.
        </p>
        
        <div className="form-group">
          <label>MF Timer folder</label>
          <input type="text" value={mfTimerDir} onChange={e => { const value = e.target.value; setMfTimerDir(value); localStorage.setItem('mf_timer_dir', value); }} placeholder="C:\\path\\to\\mf_timer" disabled={loading || repairing} />
          <small>Saved automatically. Used to locate mf_config.ini and the active profile JSON.</small>
        </div>

        <div className="form-group">
          <label>Select Terror Zone</label>
          <select value={selectedZone} onChange={e => setSelectedZone(e.target.value)} disabled={loading}>
            {uniqueZones.map(z => <option key={z} value={z}>{z}</option>)}
          </select>
        </div>

        <div className="modal-actions" style={{ marginTop: 20, alignItems: 'center' }}>
          {localStorage.getItem('tz_max_time') && new Date().getTime() < parseInt(localStorage.getItem('tz_max_time'), 10) && (
            <button 
              className="btn-d2r btn-secondary" 
              style={{ marginRight: 'auto', borderColor: '#800' }}
              onClick={() => {
                localStorage.removeItem('tz_max_time');
                setUniqueZones([...uniqueZones]); // force re-render
                addToast('Safety tracker reset! You can now jump from your current time.', 'success');
              }}
              title="Click this if you manually changed your Windows clock back to normal and want to start jumping from today again."
            >
              Reset Safety Tracker
            </button>
          )}

          <div className="tz-action-buttons">
            <button className="btn-d2r btn-secondary" onClick={handleRepairMfTimer} disabled={loading || repairing}>
              {repairing ? 'Repairing...' : 'Repair MF Timer'}
            </button>
            <button className="btn-d2r" onClick={handlePinZone} disabled={loading || !selectedZone}>
              {loading ? 'Changing...' : 'Jump to Zone'}
            </button>
            <button className="btn-d2r btn-secondary" onClick={() => setShowRestoreHelp(!showRestoreHelp)}>
              How to restore time
            </button>
            <button className="btn-d2r btn-secondary" onClick={onClose} disabled={loading}>
              Close
            </button>
          </div>
        </div>

        {showRestoreHelp && (
          <div className="tz-restore-help">
            <h4>⚠️ Safely Returning to Present Time</h4>
            <ol>
              <li>Close MF Timer before the jump, then reopen it once the clock is forward.</li>
              <li>Before restoring the clock, close MF Timer again. After restoring it, use Repair MF Timer if needed, then reopen it.</li>
              <li>While you are <strong>IN-GAME</strong> with your character (standing in town), leave the game running.</li>
              <li>Click the button below to sync your clock back to the present.</li>
              <li>Return to D2R and click <strong>"Save and Exit"</strong>.</li>
            </ol>
            <p>
              By saving <em>after</em> restoring the clock, you force D2R to create a brand-new save file with the present timestamp, avoiding any rollback issues.
            </p>
            <button className="btn-d2r" style={{backgroundColor: '#800000'}} onClick={handleRestoreTime} disabled={loading}>
              {loading ? 'Restoring...' : 'Restore Windows Clock to Present'}
            </button>
          </div>
        )}
      </div>
      <style>{`
        .modal-overlay {
          position: fixed;
          top: 0; left: 0; right: 0; bottom: 0;
          background: rgba(0,0,0,0.7);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 1000;
        }
        .tz-modal {
          background: var(--color-panel-bg, #1a1a1a);
          border: 1px solid var(--color-border, #444);
          padding: 20px;
          border-radius: 8px;
          max-width: 500px;
          width: 100%;
          max-height: 90vh;
          overflow-y: auto;
        }
        .tz-desc {
          font-size: 0.9em;
          color: #aaa;
          margin-bottom: 20px;
        }
        .form-group {
          display: flex;
          flex-direction: column;
          gap: 7px;
          margin: 16px 0;
        }
        .form-group label {
          color: #ddd;
          font-size: 0.9em;
          font-weight: 600;
        }
        .form-group input,
        .form-group select {
          box-sizing: border-box;
          width: 100%;
          min-height: 38px;
          padding: 8px 10px;
          margin: 0;
          background: #333;
          color: #fff;
          border: 1px solid #555;
          border-radius: 4px;
        }
        .form-group small {
          color: #999;
          font-size: 0.78em;
          line-height: 1.35;
        }        .form-group select {
          width: 100%;
          padding: 8px;
          margin-top: 8px;
          background: #333;
          color: #fff;
          border: 1px solid #555;
        }
        .modal-actions {
          margin-top: 20px;
        }
        .tz-action-buttons {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 8px;
          width: 100%;
        }
        .tz-action-buttons button {
          min-height: 38px;
          width: 100%;
          white-space: nowrap;
        }
        .tz-restore-help {
          margin-top: 20px;
          padding: 15px;
          background: #2a2a2a;
          border: 1px solid #C7B377;
          border-radius: 6px;
        }
        .tz-restore-help h4 { margin-top: 0; color: #C7B377; }
        .tz-restore-help ol { margin-left: 20px; color: #ddd; }
        .tz-restore-help p { color: #aaa; font-size: 0.9em; }
      `}</style>
    </div>
  );
}
