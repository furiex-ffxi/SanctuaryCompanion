import React, { useState, useMemo, useRef } from 'react';
import ItemSprite, { getItemDisplayName } from './ItemSprite';
import { getItemColorClass } from '../domain/entities/Item';
import { ItemTooltip } from './ItemTooltip';
import {
  getVaultItems,
  removeVaultItem,
  clearVaultItems,
  exportVaultJSON,
  importVaultJSON,
  getItemSlotCategory,
  extractUniqueSetsAndSlots,
} from '../domain/entities/InfiniteStash';

export function InfiniteStashPanel({ vaultItems, setVaultItems, onBackupTrigger, isGameRunning, onWithdraw, onWithdrawShared }) {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [selectedSlot, setSelectedSlot] = useState('All');
  const [selectedSet, setSelectedSet] = useState('All');
  const [selectedQuality, setSelectedQuality] = useState('All');
  const [activeHoverItem, setActiveHoverItem] = useState(null);
  const [backupMessage, setBackupMessage] = useState(null);
  const fileInputRef = useRef(null);
  const tooltipRef = useRef(null);

  const { setNames, slots } = useMemo(
    () => extractUniqueSetsAndSlots(vaultItems),
    [vaultItems]
  );

  const filteredItems = useMemo(() => {
    return vaultItems.filter((entry) => {
      const item = entry.itemData;
      if (!item) return false;

      // 1. Text Search (Matches Name, Type, Set Name, or Magic Attributes)
      if (searchTerm.trim() !== '') {
        const query = searchTerm.toLowerCase();
        const displayName = getItemDisplayName(item).toLowerCase();
        const typeName = (item.type_name || '').toLowerCase();
        const setName = (item.set_name || '').toLowerCase();
        const rawAttrs =
          item.displayed_combined_magic_attributes ||
          item.displayed_magic_attributes ||
          item.combined_magic_attributes ||
          item.magic_attributes ||
          [];
        const attrMatch = rawAttrs.some((a) => {
          const desc = a.description || `${a.name.replace(/_/g, ' ')}: ${a.values?.join(', ')}`;
          return desc.toLowerCase().includes(query);
        });

        if (
          !displayName.includes(query) &&
          !typeName.includes(query) &&
          !setName.includes(query) &&
          !attrMatch
        ) {
          return false;
        }
      }

      // 2. Slot Filter
      if (selectedSlot !== 'All') {
        const slotCategory = getItemSlotCategory(item);
        if (slotCategory !== selectedSlot) return false;
      }

      // 3. Set Name Filter
      if (selectedSet !== 'All') {
        if (item.set_name !== selectedSet) return false;
      }

      // 4. Quality Filter
      if (selectedQuality !== 'All') {
        const qualityNum = Number(selectedQuality);
        if (item.quality !== qualityNum) return false;
      }

      // 5. Category Filter
      if (selectedCategory !== 'All') {
        const slotCat = getItemSlotCategory(item);
        if (selectedCategory === 'Set Items' && !item.set_name) return false;
        if (selectedCategory === 'Unique Items' && item.quality !== 7) return false;
        if (selectedCategory === 'Rings & Amulets' && !['Ring', 'Amulet'].includes(slotCat)) return false;
        if (selectedCategory === 'Runes & Gems' && !['Rune', 'Gem'].includes(slotCat)) return false;
        if (selectedCategory === 'Charms' && !slotCat.includes('Charm')) return false;
        if (selectedCategory === 'Armor' && !['Torso', 'Head', 'Gloves', 'Boots', 'Belt', 'Shield'].includes(slotCat)) return false;
        if (selectedCategory === 'Weapons' && slotCat !== 'Weapon') return false;
      }

      return true;
    });
  }, [vaultItems, searchTerm, selectedCategory, selectedSlot, selectedSet, selectedQuality]);

  const handleRemove = (vaultId) => {
    if (isGameRunning) {
      alert('⛔ CANNOT UPDATE STASH / SAVE FILE: Diablo II: Resurrected is currently running! Please exit to the main menu or close the game before modifying or removing items.');
      return;
    }
    if (confirm('Are you sure you want to remove this item from your Infinite Stash?')) {
      const updated = removeVaultItem(vaultId);
      setVaultItems(updated);
    }
  };

  const handleImportFile = (e) => {
    if (isGameRunning) {
      alert('⛔ CANNOT UPDATE STASH / SAVE FILE: Diablo II: Resurrected is currently running! Please exit to the main menu or close the game before importing stash files.');
      return;
    }
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const parsed = JSON.parse(event.target.result);
        const { updated, addedCount } = importVaultJSON(parsed);
        setVaultItems(updated);
        alert(`Successfully imported ${addedCount} items into your Infinite Stash!`);
      } catch (err) {
        alert('Failed to import JSON vault: ' + err.message);
      }
    };
    reader.readAsText(file);
  };

  const handleTriggerBackup = async () => {
    if (onBackupTrigger) {
      const res = await onBackupTrigger();
      if (res?.success) {
        setBackupMessage(`Safe Backup Created: ${res.count} save files saved to backups/${res.timestamp}`);
        setTimeout(() => setBackupMessage(null), 6000);
      } else {
        alert('Backup error: ' + (res?.error || 'Unknown error'));
      }
    }
  };

  const handleMouseMove = (e) => {
    if (tooltipRef.current) {
      tooltipRef.current.style.left = `${e.clientX + 15}px`;
      tooltipRef.current.style.top = `${e.clientY + 15}px`;
    }
  };

  return (
    <div className="infinite-stash-container">
      {/* Top Controls Header */}
      <div className="stash-header-bar">
        <div className="stash-title-group">
          <h2>📦 Infinite Stash Vault</h2>
          <span className="stash-count-badge">
            {filteredItems.length} {filteredItems.length === 1 ? 'item' : 'items'} showing ({vaultItems.length} total)
          </span>
        </div>

        <div className="stash-actions">
          <button className="btn-d2r btn-secondary" onClick={handleTriggerBackup} title="Backup .d2s character and .d2i shared stash files">
            🛡️ Backup Save Files
          </button>
          <button className="btn-d2r btn-secondary" onClick={exportVaultJSON} title="Export Stash items as a portable JSON file">
            💾 Export Vault JSON
          </button>
          <button className="btn-d2r btn-secondary" onClick={() => fileInputRef.current?.click()} title="Import JSON Stash backup file">
            📥 Import Vault JSON
          </button>
          <input
            type="file"
            accept=".json"
            ref={fileInputRef}
            style={{ display: 'none' }}
            onChange={handleImportFile}
          />
        </div>
      </div>

      {backupMessage && <div className="backup-banner-success">{backupMessage}</div>}

      {/* Filter and Search Toolbar */}
      <div className="stash-toolbar">
        <div className="search-box">
          <input
            type="text"
            className="d2r-input"
            placeholder="🔍 Search items, stats, or set names..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
          {searchTerm && (
            <button className="search-clear-btn" onClick={() => setSearchTerm('')}>
              ✕
            </button>
          )}
        </div>

        <div className="filter-selects">
          <div className="filter-group">
            <label>Slot:</label>
            <select
              className="d2r-select"
              value={selectedSlot}
              onChange={(e) => setSelectedSlot(e.target.value)}
            >
              <option value="All">All Slots</option>
              {slots.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>

          <div className="filter-group">
            <label>Set Name:</label>
            <select
              className="d2r-select"
              value={selectedSet}
              onChange={(e) => setSelectedSet(e.target.value)}
            >
              <option value="All">All Sets ({setNames.length})</option>
              {setNames.map((set) => (
                <option key={set} value={set}>
                  {set}
                </option>
              ))}
            </select>
          </div>

          <div className="filter-group">
            <label>Rarity:</label>
            <select
              className="d2r-select"
              value={selectedQuality}
              onChange={(e) => setSelectedQuality(e.target.value)}
            >
              <option value="All">All Qualities</option>
              <option value="7">Unique (Gold)</option>
              <option value="5">Set (Green)</option>
              <option value="6">Rare (Yellow)</option>
              <option value="4">Magic (Blue)</option>
              <option value="2">Normal (White)</option>
            </select>
          </div>
        </div>
      </div>

      {/* Item List View */}
      {filteredItems.length === 0 ? (
        <div className="stash-empty-state">
          {vaultItems.length === 0 ? (
            <>
              <h3>Your Infinite Stash is empty</h3>
              <p>Transfer items directly from your character's equipment or storage tabs into this vault!</p>
            </>
          ) : (
            <>
              <h3>No items match your active search filters</h3>
              <button
                className="btn-d2r btn-secondary"
                onClick={() => {
                  setSearchTerm('');
                  setSelectedSlot('All');
                  setSelectedSet('All');
                  setSelectedQuality('All');
                  setSelectedCategory('All');
                }}
              >
                Reset All Filters
              </button>
            </>
          )}
        </div>
      ) : (
        <div className="stash-list-view">
          <div className="stash-list-header">
            <span className="col-icon">Icon</span>
            <span className="col-name">Item Name</span>
            <span className="col-type">Type & Slot</span>
            <span className="col-set">Set / Rarity</span>
            <span className="col-source">Source Save</span>
            <span className="col-actions">Actions</span>
          </div>

          <div className="stash-list-body">
            {filteredItems.map((entry) => {
              const item = entry.itemData;
              const name = getItemDisplayName(item);
              const colorClass = getItemColorClass(item);
              const slot = getItemSlotCategory(item);
              const stashedDate = new Date(entry.stashedAt).toLocaleDateString();

              return (
                <div
                  key={entry.vaultId}
                  className="stash-item-row"
                  onMouseEnter={() => setActiveHoverItem(item)}
                  onMouseLeave={() => setActiveHoverItem(null)}
                  onMouseMove={handleMouseMove}
                >
                  <div className="col-icon icon-cell">
                    <ItemSprite item={item} showTooltip={false} />
                  </div>

                  <div className="col-name name-cell">
                    <span className={`item-name-text ${colorClass}`}>{name}</span>
                    {item.socketed === 1 && (
                      <span className="socket-badge">
                        [{item.total_nr_of_sockets || item.socketed_items?.length || 0} Sockets]
                      </span>
                    )}
                  </div>

                  <div className="col-type type-cell">
                    <span className="badge-type">{item.type_name || item.type?.toUpperCase()}</span>
                    <span className="badge-slot">{slot}</span>
                  </div>

                  <div className="col-set set-cell">
                    {item.set_name ? (
                      <span className="badge-set">{item.set_name}</span>
                    ) : item.quality === 7 ? (
                      <span className="badge-unique">Unique</span>
                    ) : (
                      <span className="badge-rarity">{colorClass.replace('quality-', '')}</span>
                    )}
                  </div>

                  <div className="col-source source-cell">
                    <span className="source-name">{entry.sourceSave.replace('.d2s', '')}</span>
                    <span className="source-date">{stashedDate}</span>
                  </div>

                  <div className="col-actions actions-cell" style={{ display: 'flex', gap: 6 }}>
                    <button
                      className="btn-d2r btn-secondary"
                      style={{ padding: '6px 12px', fontSize: '0.8rem' }}
                      title="Move item from Infinite Stash back to personal character stash"
                      onClick={() => onWithdraw && onWithdraw(entry.vaultId, item)}
                    >
                      👤 Personal Stash
                    </button>
                    <button
                      className="btn-d2r btn-secondary"
                      style={{ padding: '6px 12px', fontSize: '0.8rem' }}
                      title="Move item from Infinite Stash to Shared Stash"
                      onClick={() => onWithdrawShared && onWithdrawShared(entry.vaultId, item)}
                    >
                      🪙 Shared Stash
                    </button>
                    <button
                      className="btn-remove"
                      title="Delete item from Infinite Stash Vault"
                      onClick={() => handleRemove(entry.vaultId)}
                    >
                      🗑️
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Floating D2R Tooltip on hover */}
      {activeHoverItem && (
        <div
          ref={tooltipRef}
          className="floating-tooltip-wrapper"
          style={{
            position: 'fixed',
            left: '-9999px',
            top: '-9999px',
            zIndex: 9999,
            pointerEvents: 'none',
          }}
        >
          <ItemTooltip item={activeHoverItem} />
        </div>
      )}
    </div>
  );
}
