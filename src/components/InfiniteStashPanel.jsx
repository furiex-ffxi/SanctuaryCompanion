import React, { useEffect, useRef, useState } from 'react';
import ItemSprite, { getItemDisplayName } from './ItemSprite';
import { getItemColorClass } from '../domain/entities/Item';
import { getItemSlotCategory, resolveVaultBaseType } from '../domain/entities/VaultCatalog';
import { ItemTooltip } from './ItemTooltip';
import { InfiniteStashAdapter } from '../adapters/InfiniteStashAdapter';

export function InfiniteStashPanel({
  vaultItems,
  vaultTotal,
  vaultNextCursor,
  vaultFacets,
  vaultLoading,
  vaultError,
  onQuery,
  onLoadMore,
  onRemove,
  onRefresh,
  onBackupTrigger,
  isGameRunning,
  onWithdraw,
  onWithdrawShared,
  highlightIdentity,
}) {
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [selectedSlot, setSelectedSlot] = useState('All');
  const [selectedSet, setSelectedSet] = useState('All');
  const [selectedQuality, setSelectedQuality] = useState('All');
  const [activeHoverItem, setActiveHoverItem] = useState(null);
  const [backupMessage, setBackupMessage] = useState(null);
  const fileInputRef = useRef(null);
  const tooltipRef = useRef(null);

  useEffect(() => {
    const timeout = setTimeout(() => {
      onQuery({
        category: selectedCategory,
        slot: selectedSlot,
        setName: selectedSet,
        quality: selectedQuality,
      }).catch(() => {});
    }, 250);
    return () => clearTimeout(timeout);
  }, [selectedCategory, selectedSlot, selectedSet, selectedQuality, onQuery]);

  const handleRemove = async (vaultId) => {
    if (isGameRunning) {
      alert('Cannot update the vault while Diablo II: Resurrected is running.');
      return;
    }
    if (!confirm('Are you sure you want to remove this item from your Infinite Stash?')) return;
    try {
      await onRemove(vaultId, 'delete');
    } catch (error) {
      alert(`Failed to remove vault item: ${error.message}`);
    }
  };

  const handleImportFile = async (event) => {
    if (isGameRunning) {
      alert('Cannot import while Diablo II: Resurrected is running.');
      return;
    }
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const entries = JSON.parse(await file.text());
      if (!Array.isArray(entries)) throw new Error('Expected a JSON array');
      const result = await InfiniteStashAdapter.import(entries);
      await onRefresh();
      alert(`Successfully imported ${result.addedCount} items.`);
    } catch (error) {
      alert(`Failed to import vault: ${error.message}`);
    } finally {
      event.target.value = '';
    }
  };

  const handleTriggerBackup = async () => {
    const result = await onBackupTrigger?.();
    if (result?.success) {
      setBackupMessage(`Safe backup created in backups/${result.timestamp}`);
      setTimeout(() => setBackupMessage(null), 6000);
    } else {
      alert(`Backup error: ${result?.error || 'Unknown error'}`);
    }
  };

  const resetFilters = () => {
    setSelectedCategory('All');
    setSelectedSlot('All');
    setSelectedSet('All');
    setSelectedQuality('All');
  };

  const handleMouseMove = (event) => {
    if (!tooltipRef.current) return;
    tooltipRef.current.style.left = `${event.clientX + 15}px`;
    tooltipRef.current.style.top = `${event.clientY + 15}px`;
  };

  return (
    <div className="infinite-stash-container">
      <div className="stash-header-bar">
        <div className="stash-title-group">
          <h2>📦 Infinite Stash Vault</h2>
          <span className="stash-count-badge">
            {vaultItems.length} loaded ({vaultTotal} matching)
          </span>
        </div>
        <div className="stash-actions">
          <button className="btn-d2r btn-secondary" onClick={handleTriggerBackup}>🛡️ Backup Save Files</button>
          <button className="btn-d2r btn-secondary" onClick={() => InfiniteStashAdapter.export().catch((error) => alert(error.message))}>💾 Export Vault JSON</button>
          <button className="btn-d2r btn-secondary" onClick={() => fileInputRef.current?.click()}>📥 Import Vault JSON</button>
          <input type="file" accept=".json" ref={fileInputRef} style={{ display: 'none' }} onChange={handleImportFile} />
        </div>
      </div>

      {backupMessage && <div className="backup-banner-success">{backupMessage}</div>}
      {vaultError && <div className="game-running-warning-banner">Vault error: {vaultError}</div>}

      <div className="stash-toolbar">
        <div className="filter-selects">
          <div className="filter-group">
            <label>Category:</label>
            <select className="d2r-select" value={selectedCategory} onChange={(event) => setSelectedCategory(event.target.value)}>
              <option value="All">All Categories</option>
              {vaultFacets.categories.map((category) => <option key={category}>{category}</option>)}
            </select>
          </div>
          <div className="filter-group">
            <label>Slot:</label>
            <select className="d2r-select" value={selectedSlot} onChange={(event) => setSelectedSlot(event.target.value)}>
              <option value="All">All Slots</option>
              {vaultFacets.slots.map((slot) => <option key={slot}>{slot}</option>)}
            </select>
          </div>
          <div className="filter-group">
            <label>Set Name:</label>
            <select className="d2r-select" value={selectedSet} onChange={(event) => setSelectedSet(event.target.value)}>
              <option value="All">All Sets ({vaultFacets.sets.length})</option>
              {vaultFacets.sets.map((setName) => <option key={setName}>{setName}</option>)}
            </select>
          </div>
          <div className="filter-group">
            <label>Rarity:</label>
            <select className="d2r-select" value={selectedQuality} onChange={(event) => setSelectedQuality(event.target.value)}>
              <option value="All">All Qualities</option>
              <option value="7">Unique</option><option value="5">Set</option><option value="6">Rare</option>
              <option value="4">Magic</option><option value="2">Normal</option>
            </select>
          </div>
        </div>
      </div>

      {!vaultLoading && vaultItems.length === 0 ? (
        <div className="stash-empty-state">
          <h3>{vaultTotal === 0 ? 'Your Infinite Stash is empty' : 'No items match your filters'}</h3>
          {vaultTotal !== 0 && <button className="btn-d2r btn-secondary" onClick={resetFilters}>Reset All Filters</button>}
        </div>
      ) : (
        <div className="stash-list-view">
          <div className="stash-list-header">
            <span className="col-icon">Icon</span><span className="col-name">Item Name</span>
            <span className="col-type">Type & Slot</span><span className="col-set">Set / Rarity</span>
            <span className="col-source">Source Save</span><span className="col-actions">Actions</span>
          </div>
          <div className="stash-list-body">
            {vaultItems.map((entry) => {
              const item = entry.itemData;
              const colorClass = getItemColorClass(item);
              return (
                <div key={entry.vaultId} className={`stash-item-row ${highlightIdentity?.vaultId === entry.vaultId ? 'item-search-highlight' : ''}`} onMouseEnter={() => setActiveHoverItem(item)} onMouseLeave={() => setActiveHoverItem(null)} onMouseMove={handleMouseMove}>
                  <div className="col-icon icon-cell"><ItemSprite item={item} showTooltip={false} /></div>
                  <div className="col-name name-cell"><span className={`item-name-text ${colorClass}`}>{getItemDisplayName(item)}</span></div>
                  <div className="col-type type-cell"><span className="badge-type">{resolveVaultBaseType(item)}</span><span className="badge-slot">{getItemSlotCategory(item)}</span></div>
                  <div className="col-set set-cell">{item.set_name ? <span className="badge-set">{item.set_name}</span> : <span className="badge-rarity">{colorClass.replace('quality-', '')}</span>}</div>
                  <div className="col-source source-cell"><span className="source-name">{entry.sourceSave.replace('.d2s', '')}</span><span className="source-date">{new Date(entry.stashedAt).toLocaleDateString()}</span></div>
                  <div className="col-actions actions-cell" style={{ display: 'flex', gap: 6 }}>
                    <button className="btn-d2r btn-secondary" onClick={() => onWithdraw?.(entry.vaultId, item)}>👤 Personal Stash</button>
                    <button className="btn-d2r btn-secondary" onClick={() => onWithdrawShared?.(entry.vaultId, item)}>🪙 Shared Stash</button>
                    <button className="btn-remove" onClick={() => handleRemove(entry.vaultId)}>🗑️</button>
                  </div>
                </div>
              );
            })}
          </div>
          {vaultNextCursor && <button className="btn-d2r btn-secondary" disabled={vaultLoading} onClick={onLoadMore}>{vaultLoading ? 'Loading...' : 'Load 100 more'}</button>}
        </div>
      )}

      {activeHoverItem && <div ref={tooltipRef} className="floating-tooltip-wrapper" style={{ position: 'fixed', left: '-9999px', top: '-9999px', zIndex: 9999, pointerEvents: 'none' }}><ItemTooltip item={activeHoverItem} /></div>}
    </div>
  );
}
