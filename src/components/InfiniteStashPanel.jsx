import React, { useEffect, useMemo, useRef, useState } from 'react';
import ItemSprite, { getItemDisplayName } from './ItemSprite';
import { getItemColorClass } from '../domain/entities/Item';
import { getItemSlotCategory, resolveVaultBaseType } from '../domain/entities/VaultCatalog';
import { InfiniteStashAdapter } from '../adapters/InfiniteStashAdapter';
import { TooltipTrigger } from './TooltipTrigger';
import { getVirtualRange } from '../domain/virtualList';

const VIRTUAL_ROW_HEIGHT = 86;
const VIRTUAL_OVERSCAN = 8;
const SORT_DIRECTION_LABELS = {
  dateAdded: { asc: 'Oldest', desc: 'Newest' },
  name: { asc: 'A\u2013Z', desc: 'Z\u2013A' },
  type: { asc: 'A\u2013Z', desc: 'Z\u2013A' },
  rarity: { asc: 'Lowest', desc: 'Highest' },
  source: { asc: 'A\u2013Z', desc: 'Z\u2013A' },
};


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
  onRecover,
  highlightIdentity,
  searchQuery = '',
  onSearchQueryChange = () => {},
}) {
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [selectedSlot, setSelectedSlot] = useState('All');
  const [selectedSet, setSelectedSet] = useState('All');
  const [selectedQuality, setSelectedQuality] = useState('All');
  const [minLevel, setMinLevel] = useState('');
  const [maxLevel, setMaxLevel] = useState('');
  const [status, setStatus] = useState('active');
  const [sort, setSort] = useState('dateAdded');
  const [direction, setDirection] = useState('desc');
  const [backupMessage, setBackupMessage] = useState(null);
  const [listScrollTop, setListScrollTop] = useState(0);
  const [listViewportHeight, setListViewportHeight] = useState(600);
  const fileInputRef = useRef(null);
  const listBodyRef = useRef(null);
  const listHeaderRef = useRef(null);
  const listScrollTopRef = useRef(0);
  const scrollFrameRef = useRef(null);
  const loadMoreTriggerRef = useRef(null);
  const loadMoreRef = useRef(null);
  const backupTimerRef = useRef(null);

  useEffect(() => {
    const timeout = setTimeout(() => {
      listScrollTopRef.current = 0;
      setListScrollTop(0);
      if (listBodyRef.current) listBodyRef.current.scrollTop = 0;
      onQuery({
        category: selectedCategory,
        slot: selectedSlot,
        setName: selectedSet,
        quality: selectedQuality,
        minLevel: minLevel || null,
        maxLevel: maxLevel || null,
        q: searchQuery,
        sort,
        direction,
        status,
      }).catch(() => {});
    }, 250);
    return () => clearTimeout(timeout);
  }, [selectedCategory, selectedSlot, selectedSet, selectedQuality, minLevel, maxLevel, searchQuery, sort, direction, status, onQuery]);

  useEffect(() => () => {
    clearTimeout(backupTimerRef.current);
    if (scrollFrameRef.current != null) cancelAnimationFrame(scrollFrameRef.current);
  }, []);
  useEffect(() => {
    const root = listBodyRef.current;
    if (!root || typeof ResizeObserver === 'undefined') return undefined;
    const resizeObserver = new ResizeObserver(([entry]) => setListViewportHeight(entry.contentRect.height));
    resizeObserver.observe(root);
    setListViewportHeight(root.clientHeight);
    return () => resizeObserver.disconnect();
  }, [vaultItems.length]);
  useEffect(() => {
    const sentinel = loadMoreRef.current;
    const root = listBodyRef.current;
    if (!sentinel || !root || !vaultNextCursor) return undefined;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !vaultLoading && loadMoreTriggerRef.current !== vaultNextCursor) {
          loadMoreTriggerRef.current = vaultNextCursor;
          Promise.resolve(onLoadMore?.()).catch(() => { loadMoreTriggerRef.current = null; });
        }
      },
      { root, rootMargin: '240px 0px' },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [vaultNextCursor, vaultLoading, onLoadMore]);

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
    try {
      const result = await onBackupTrigger?.();
      if (result?.success) {
        setBackupMessage(`Safe backup created in backups/${result.timestamp}`);
        clearTimeout(backupTimerRef.current);
        backupTimerRef.current = setTimeout(() => setBackupMessage(null), 6000);
      } else {
        alert(`Backup error: ${result?.error || 'Unknown error'}`);
      }
    } catch (error) {
      alert(`Backup error: ${error.message}`);
    }
  };

  const { start: virtualStart, end: virtualEnd } = getVirtualRange(
    vaultItems.length,
    listScrollTop,
    listViewportHeight,
    VIRTUAL_ROW_HEIGHT,
    VIRTUAL_OVERSCAN,
  );
  const virtualItems = useMemo(() => vaultItems.slice(virtualStart, virtualEnd), [vaultItems, virtualStart, virtualEnd]);
  const handleListScroll = (event) => {
    const target = event.currentTarget;
    listScrollTopRef.current = target.scrollTop;
    if (listHeaderRef.current) listHeaderRef.current.scrollLeft = target.scrollLeft;
    if (scrollFrameRef.current == null) {
      scrollFrameRef.current = requestAnimationFrame(() => {
        scrollFrameRef.current = null;
        setListScrollTop(listScrollTopRef.current);
      });
    }
  };
  const resetFilters = () => {
    setSelectedCategory('All');
    setSelectedSlot('All');
    setSelectedSet('All');
    setSelectedQuality('All');
    setMinLevel('');
    setMaxLevel('');
    onSearchQueryChange('');
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
      {vaultError && <div className="game-running-warning-banner" role="alert">Vault error: {vaultError}</div>}
      <div className="stash-status" role="status" aria-live="polite">{vaultLoading ? (vaultItems.length ? `Loading more items… ${vaultItems.length} shown` : "Loading vault…") : ""}</div>

      <div className="stash-toolbar">
        <div className="filter-selects">
          <div className="filter-group vault-search-filter">
            <label htmlFor="infinite-vault-search">Search vault:</label>
            <div className="search-box">
              <input
                id="infinite-vault-search"
                className="d2r-input vault-search-input"
                type="search"
                placeholder="Item name..."
                value={searchQuery}
                onChange={(event) => onSearchQueryChange(event.target.value)}
              />
              {searchQuery && <button className="search-clear-btn" type="button" onClick={() => onSearchQueryChange('')} aria-label="Clear vault search">×</button>}
            </div>
          </div>
          <div className="filter-group">
            <label htmlFor="infinite-vault-category">Category:</label>
            <select id="infinite-vault-category" className="d2r-select" value={selectedCategory} onChange={(event) => setSelectedCategory(event.target.value)}>
              <option value="All">All Categories</option>
              {vaultFacets.categories.map((category) => <option key={category}>{category}</option>)}
            </select>
          </div>
          <div className="filter-group">
            <label htmlFor="infinite-vault-slot">Slot:</label>
            <select id="infinite-vault-slot" className="d2r-select" value={selectedSlot} onChange={(event) => setSelectedSlot(event.target.value)}>
              <option value="All">All Slots</option>
              {vaultFacets.slots.map((slot) => <option key={slot}>{slot}</option>)}
            </select>
          </div>
          <div className="filter-group">
            <label htmlFor="infinite-vault-set">Set Name:</label>
            <select id="infinite-vault-set" className="d2r-select" value={selectedSet} onChange={(event) => setSelectedSet(event.target.value)}>
              <option value="All">All Sets ({vaultFacets.sets.length})</option>
              {vaultFacets.sets.map((setName) => <option key={setName}>{setName}</option>)}
            </select>
          </div>
          <div className="filter-group">
            <label htmlFor="infinite-vault-quality">Rarity:</label>
            <select id="infinite-vault-quality" className="d2r-select" value={selectedQuality} onChange={(event) => setSelectedQuality(event.target.value)}>
              <option value="All">All Qualities</option>
              <option value="7">Unique</option><option value="5">Set</option><option value="6">Rare</option>
              <option value="4">Magic</option><option value="2">Normal</option>
            </select>
          </div>
          <div className="filter-group">
            <label htmlFor="infinite-vault-min-level">Level:</label>
            <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
              <input id="infinite-vault-min-level" className="d2r-input" type="number" placeholder="Min" style={{ width: '64px', padding: '8px 4px' }} value={minLevel} onChange={(e) => setMinLevel(e.target.value)} />
              <span>-</span>
              <input className="d2r-input" type="number" placeholder="Max" style={{ width: '64px', padding: '8px 4px' }} value={maxLevel} onChange={(e) => setMaxLevel(e.target.value)} />
            </div>
          </div>
          <div className="filter-group">
            <label htmlFor="infinite-vault-status">Status:</label>
            <select id="infinite-vault-status" className="d2r-select" value={status} onChange={(event) => setStatus(event.target.value)}>
              <option value="active">Active Items</option>
              <option value="pending_withdraw">Pending Recovery</option>
            </select>
          </div>
          <div className="filter-group vault-sort-controls">
            <label htmlFor="infinite-vault-sort">Sort by:</label>
            <select id="infinite-vault-sort" className="d2r-select" value={sort} onChange={(event) => setSort(event.target.value)}>
              <option value="dateAdded">Date added</option>
              <option value="name">Item name</option>
              <option value="type">Base type</option>
              <option value="rarity">Rarity</option>
              <option value="source">Source save</option>
            </select>
            <button
              type="button"
              className="btn-d2r btn-secondary vault-sort-direction"
              aria-label={'Sort direction: ' + SORT_DIRECTION_LABELS[sort][direction]}
              onClick={() => setDirection((current) => current === 'asc' ? 'desc' : 'asc')}
            >
              {SORT_DIRECTION_LABELS[sort][direction]}
            </button>
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
          <div className="stash-list-header" ref={listHeaderRef}>
            <span className="col-icon">Icon</span><span className="col-name">Item Name</span>
            <span className="col-type">Type & Slot</span><span className="col-set">Set / Rarity</span>
            <span className="col-source">Source Save</span><span className="col-actions">Actions</span>
          </div>
          <div className="stash-list-body" ref={listBodyRef} onScroll={handleListScroll}>
                        <div className="stash-virtual-spacer" style={{ height: `${virtualStart * VIRTUAL_ROW_HEIGHT}px` }} aria-hidden="true" />
            {virtualItems.map((entry) => {
              const item = entry.itemData;
              const colorClass = getItemColorClass(item);
              return (
                <TooltipTrigger key={entry.vaultId} className={`stash-item-row ${highlightIdentity?.vaultId === entry.vaultId ? 'item-search-highlight' : ''}`} item={item}>
                  <div className="col-icon icon-cell"><ItemSprite item={item} showTooltip={false} /></div>
                  <div className="col-name name-cell"><span className={`item-name-text ${colorClass}`}>{getItemDisplayName(item)}</span></div>
                  <div className="col-type type-cell"><span className="badge-type">{resolveVaultBaseType(item)}</span><span className="badge-slot">{getItemSlotCategory(item)}</span></div>
                  <div className="col-set set-cell">{item.set_name ? <span className="badge-set">{item.set_name}</span> : <span className="badge-rarity">{colorClass.replace('quality-', '')}</span>}</div>
                  <div className="col-source source-cell"><span className="source-name">{entry.sourceSave.replace('.d2s', '')}</span><span className="source-date">{new Date(entry.stashedAt).toLocaleDateString()}</span></div>
                  <div className="col-actions actions-cell" style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                    {entry.status === 'pending_withdraw' ? (
                      <button className="btn-d2r btn-secondary" onClick={() => onRecover?.(entry.vaultId)}>🔄 Recover</button>
                    ) : (
                      <>
                        <button className="btn-d2r btn-secondary" onClick={() => onWithdraw?.(entry.vaultId, item)}>👤 Personal Stash</button>
                        <button className="btn-d2r btn-secondary" onClick={() => onWithdrawShared?.(entry.vaultId, item)}>🪙 Shared Stash</button>
                      </>
                    )}
                    <button className="btn-remove" aria-label={`Remove ${getItemDisplayName(item)} from Infinite Stash`} onClick={() => handleRemove(entry.vaultId)}>🗑️</button>
                  </div>
                </TooltipTrigger>
              );
            })}
            <div className="stash-virtual-spacer" style={{ height: `${(vaultItems.length - virtualEnd) * VIRTUAL_ROW_HEIGHT}px` }} aria-hidden="true" />
          {vaultNextCursor && (
            <div ref={loadMoreRef} className="stash-load-more" aria-live="polite">
              <button className="btn-d2r btn-secondary" disabled={vaultLoading} onClick={() => Promise.resolve(onLoadMore?.()).catch(() => {})}>
                {vaultLoading ? 'Loading...' : 'Load more items'}
              </button>
            </div>
          )}
          </div>
          {!vaultNextCursor && vaultItems.length > 0 && <div className="stash-end-message" role="status" aria-live="polite">Showing all {vaultTotal} matching items</div>}
        </div>
      )}
    </div>
  );
}
