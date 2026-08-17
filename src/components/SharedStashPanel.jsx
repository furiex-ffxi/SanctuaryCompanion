import React from 'react';
import { StorageGrid } from './StorageGrid';
import { AdvancedStashPanel } from './AdvancedStashPanel';
import { D2SParserAdapter } from '../adapters/D2SParserAdapter';

export function SharedStashPanel({
  sharedStash,
  sharedStashLoading,
  sharedStashError,
  refreshSharedStash,
  depositItemToVault,
  setSharedStash,
  sharedStashFile,
  setSharedStashFile,
  sharedStashLoadedFile,
  setSharedStashLoadedFile,
  setSharedStashError,
  sharedStashTab,
  setSharedStashTab,
  highlightIdentity,
}) {
  const pages = sharedStash?.pages || [];
  const activePageIdx = Math.min(sharedStashTab ?? 0, Math.max(pages.length - 1, 0));
  const activePage = pages[activePageIdx] || pages[0];
  const items = activePage?.items || [];
  const sharedStashReady = !sharedStashLoading && !sharedStashError && sharedStashLoadedFile === sharedStashFile;

  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const buf = await file.arrayBuffer();
      const parsed = await D2SParserAdapter.parseSharedStashBuffer(buf);
      setSharedStash(parsed);
      setSharedStashFile('');
      setSharedStashLoadedFile('');
      setSharedStashError(null);
    } catch (err) {
      alert('Error parsing uploaded .d2i file: ' + err.message);
    }
  };

  return (
    <div className="shared-stash-view-container">
      {/* Header controls for Shared Stash */}
      <div className="panel shared-stash-panel-wrapper">
        <div className="shared-stash-header">
          <div className="shared-stash-title-group">
            <h2>🪙 D2R Shared Stash Viewer</h2>
            {sharedStash?.sharedGold !== undefined && (
              <div className="shared-gold-badge">
                🪙 Shared Gold: <span className="gold-val">{sharedStash.sharedGold.toLocaleString()}</span>
              </div>
            )}
          </div>

          <div className="shared-stash-actions">
            <select
              className="header-control save-picker"
              value={sharedStashFile || ""}
              onChange={(e) => {
                setSharedStashFile(e.target.value);
                refreshSharedStash(e.target.value);
              }}
            >
              {sharedStashFile === '' && <option value="">Uploaded browser file (local only)</option>}
              <option value="ModernSharedStashSoftCoreV2.d2i">Modern Softcore (ModernSharedStashSoftCoreV2.d2i)</option>
              <option value="SharedStashSoftCoreV2.d2i">Vanilla Softcore (SharedStashSoftCoreV2.d2i)</option>
              <option value="ModernSharedStashHardCoreV2.d2i">Modern Hardcore (ModernSharedStashHardCoreV2.d2i)</option>
              <option value="SharedStashHardCoreV2.d2i">Vanilla Hardcore (SharedStashHardCoreV2.d2i)</option>
            </select>

            <div className="file-input-wrapper" title="Load custom .d2i file">
              <button className="header-control btn-d2r btn-secondary">Upload .d2i…</button>
              <input type="file" accept=".d2i" onChange={handleFileUpload} />
            </div>

            <button
              className={`header-control btn-d2r btn-refresh ${sharedStashLoading ? 'spinning' : ''}`}
              onClick={() => refreshSharedStash(sharedStashFile)}
              disabled={sharedStashLoading}
            >
              {sharedStashLoading ? '↻ Loading…' : '↻ Refresh .d2i'}
            </button>
          </div>
        </div>

        {sharedStashError && (
          <div className="stash-empty-state" style={{ color: '#ff6666', marginTop: 20 }}>
            ⚠️ Could not load shared stash ({sharedStashFile}): {sharedStashError}
            <br />
            <small style={{ color: '#aaa', marginTop: 8, display: 'block' }}>
              Make sure D2R has created a shared stash file or upload your own .d2i file.
            </small>
          </div>
        )}

        {!sharedStashError && pages.length === 0 && !sharedStashLoading && (
          <div className="stash-empty-state" style={{ marginTop: 20 }}>
            <h3>No shared stash pages found</h3>
            <p>You can upload a <code>.d2i</code> file from your D2R save folder!</p>
          </div>
        )}

        {pages.length > 0 && (
          <div className="shared-stash-content" style={{ marginTop: 20 }}>
            {/* Tabs for Stash Pages (e.g. Personal / Shared 1 / Shared 2 / Shared 3) */}
            <div className="inventory-tabs shared-stash-page-tabs">
              {pages.map((page, idx) => (
                <button
                  key={idx}
                  className={`inv-tab ${activePageIdx === idx ? 'active' : ''}`}
                  onClick={() => setSharedStashTab(idx)}
                >
                  📑 Tab {idx + 1} {page.name ? `(${page.name})` : ''} — {page.items?.length || 0} items
                </button>
              ))}
            </div>

            {/* Centered grid display for active tab */}
            <div className="shared-stash-grid-center">
              {activePage.type === 1 ? (
                <AdvancedStashPanel 
                  items={items} 
                  onDeposit={sharedStashReady ? (item) => depositItemToVault(item, '__shared_stash__') : undefined}
                  highlightIdentity={highlightIdentity}
                />
              ) : activePage.type === 2 ? (
                <div className="stash-empty-state">
                  <h3>Chronicle Page</h3>
                  <p>Chronicle pages are not fully supported yet.</p>
                </div>
              ) : (
                <StorageGrid
                  meta={{
                    cols: 10,
                    rows: 10,
                    activePageIdx,
                    onDeposit: sharedStashReady ? (item) => depositItemToVault(item, '__shared_stash__') : undefined,
                  }}
                  items={items}
                  highlightIdentity={highlightIdentity}
                />
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
