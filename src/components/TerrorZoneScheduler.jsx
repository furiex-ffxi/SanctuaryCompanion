import React, { useState, useEffect } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';

export function TerrorZoneScheduler({ onClose, addToast }) {
  const [selectedZone, setSelectedZone] = useState('');
  const [showRestoreHelp, setShowRestoreHelp] = useState(false);
  const [tzMaxTime, setTzMaxTime] = useState(() => parseInt(localStorage.getItem('tz_max_time') || '0', 10));
  const [mfTimerDir, setMfTimerDir] = useState(() => localStorage.getItem('mf_timer_dir') || '');

  const { data: schedule, isLoading } = useQuery({
    queryKey: ['tzSchedule'],
    queryFn: async () => {
      const res = await fetch('/data/tz-2023-localized.json');
      if (!res.ok) throw new Error('Failed to load schedule');
      return res.json();
    }
  });

  const uniqueZones = React.useMemo(() => {
    if (!schedule) return [];
    return Array.from(new Set(schedule.map(item => item.zone.enUS))).sort();
  }, [schedule]);

  useEffect(() => {
    if (uniqueZones.length > 0 && !selectedZone) {
      setSelectedZone(uniqueZones[0]);
    }
  }, [uniqueZones, selectedZone]);

  const handleMfTimerDirBlur = () => {
    localStorage.setItem('mf_timer_dir', mfTimerDir);
  };

  const jumpMutation = useMutation({
    mutationFn: async (targetDatetime) => {
      const res = await fetch('/__d2r_set_time', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ datetime: targetDatetime })
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
    },
    onSuccess: (_, targetDatetime) => {
      const targetTime = new Date(targetDatetime).getTime();
      setTzMaxTime(targetTime);
      localStorage.setItem('tz_max_time', targetTime.toString());
      addToast(`System time changed! ${selectedZone} is now active.`, 'success');
    },
    onError: (err) => {
      addToast(`Failed to change time: ${err.message}`, 'error');
    }
  });

  const restoreMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch('/__d2r_set_time', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ restore: true })
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
    },
    onSuccess: () => {
      setTzMaxTime(0);
      localStorage.removeItem('tz_max_time');
      addToast('Clock restored and synced to present time.', 'success');
      setShowRestoreHelp(false);
    },
    onError: (err) => {
      addToast(`Failed to restore time: ${err.message}`, 'error');
    }
  });

  const repairMutation = useMutation({
    mutationFn: async () => {
      if (!mfTimerDir) throw new Error("Please enter your MF Timer folder path first.");
      const res = await fetch('/__mf_timer_repair', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mfTimerDir })
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
      return data;
    },
    onSuccess: (data) => {
      addToast(`MF Timer Repaired! Found ${data.profileCount} profiles, modified ${data.modifiedCount} files.`, 'success');
    },
    onError: (err) => {
      addToast(`Failed to repair MF Timer: ${err.message}`, 'error');
    }
  });

  const handlePinZone = () => {
    if (!schedule) return;
    let nextOccurrences = schedule.filter(item => item.zone.enUS === selectedZone);
    if (nextOccurrences.length === 0) {
      addToast('No schedule found for this zone.', 'error');
      return;
    }
    
    const now = Date.now();
    const minRequiredTime = Math.max(now, tzMaxTime);

    let target = nextOccurrences.find(item => new Date(item.datetime).getTime() > minRequiredTime);
    if (!target) {
      addToast('No future occurrences of this zone found after the latest simulated time.', 'error');
      return;
    }

    jumpMutation.mutate(target.datetime);
  };

  const isWorking = jumpMutation.isPending || restoreMutation.isPending || repairMutation.isPending;

  return (
    <div className="modal-overlay">
      <div className="modal-content tz-modal">
        <h3>Pin Terror Zone (Offline)</h3>
        <p className="tz-desc">
          This will change your Windows system clock to activate the selected Terror Zone in Single Player.
          <br/><br/>
          <span style={{ color: '#ff4444', fontWeight: 'bold' }}>⚠️ Note: A UAC Prompt will appear.</span>
          <br/><br/>
          To protect your save files, we ensure the clock only moves FORWARD into the future.
          <br/><br/>
          <strong>Close MF Timer before the jump, reopen it after the clock is forward, and close it again before restoring the clock.</strong>{' '}
          This keeps its time.time() clock from seeing a discontinuity.
        </p>
        
        <div className="form-group">
          <label>MF Timer folder</label>
          <input 
            type="text" 
            value={mfTimerDir} 
            onChange={e => setMfTimerDir(e.target.value)} 
            onBlur={handleMfTimerDirBlur}
            placeholder="C:\\path\\to\\mf_timer" 
            disabled={isWorking} 
          />
          <small>Saved on blur. Used to locate mf_config.ini and the active profile JSON.</small>
        </div>

        <div className="form-group">
          <label>Select Terror Zone</label>
          <select value={selectedZone} onChange={e => setSelectedZone(e.target.value)} disabled={isWorking || isLoading}>
            {isLoading ? <option>Loading schedule...</option> : uniqueZones.map(z => <option key={z} value={z}>{z}</option>)}
          </select>
        </div>

        <div className="modal-actions" style={{ marginTop: 20, display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '10px' }}>
          {tzMaxTime > Date.now() && (
            <button 
              className="btn-d2r btn-secondary" 
              style={{ marginRight: 'auto', borderColor: '#800' }}
              onClick={() => {
                setTzMaxTime(0);
                localStorage.removeItem('tz_max_time');
                addToast('Safety tracker reset! You can now jump from your current time.', 'success');
              }}
              title="Click this if you manually changed your Windows clock back to normal and want to start jumping from today again."
            >
              Reset Safety Tracker
            </button>
          )}

          <div className="tz-action-buttons">
            <button className="btn-d2r btn-secondary" onClick={() => repairMutation.mutate()} disabled={isWorking}>
              {repairMutation.isPending ? 'Repairing...' : 'Repair MF Timer'}
            </button>
            <button className="btn-d2r" onClick={handlePinZone} disabled={isWorking || !selectedZone || isLoading}>
              {jumpMutation.isPending ? 'Changing...' : 'Jump to Zone'}
            </button>
            <button className="btn-d2r btn-secondary" onClick={() => setShowRestoreHelp(!showRestoreHelp)}>
              How to restore time
            </button>
            <button className="btn-d2r btn-secondary" onClick={onClose} disabled={isWorking}>
              Close
            </button>
          </div>
        </div>

        {showRestoreHelp && (
          <div className="tz-restore-help">
            <h4>🔄 Safely Returning to Present Time</h4>
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
            <button className="btn-d2r" style={{backgroundColor: '#800000'}} onClick={() => restoreMutation.mutate()} disabled={isWorking}>
              {restoreMutation.isPending ? 'Restoring...' : 'Restore Windows Clock to Present'}
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
