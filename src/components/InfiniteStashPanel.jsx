import React, { useEffect, useMemo, useRef, useState } from 'react';
import ItemSprite, { getItemDisplayName } from './ItemSprite';
import { getItemColorClass } from '../domain/entities/Item';
import { getItemSlotCategory, resolveVaultBaseType } from '../domain/entities/VaultCatalog';
import { InfiniteStashAdapter } from '../adapters/InfiniteStashAdapter';
import { TooltipTrigger } from './TooltipTrigger';
import { getVirtualRange } from '../domain/virtualList';
import { EMPTY_ITEM_FILTERS, ItemFilterControls } from './ItemFilterControls';

const VIRTUAL_ROW_HEIGHT = 86;
const VIRTUAL_OVERSCAN = 8;

export function InfiniteStashPanel({
  vaultItems,
  vaultTotal,
  vaultNextCursor,
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
  vaultFilters,
  vaultFacets = {},
  movingItemKeys = new Set(),
}) {
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
  const [filterDraft, setFilterDraft] = useState(() => ({ ...EMPTY_ITEM_FILTERS }));
  const filters = filterDraft;

  useEffect(() => {
    setFilterDraft({ ...EMPTY_ITEM_FILTERS, ...(vaultFilters || {}) });
  }, [vaultFilters]);

  const handleFilterChange = (nextFilters) => {
    setFilterDraft(nextFilters);
    Promise.resolve(onQuery?.({ ...nextFilters, sort, direction })).catch(() => {});
  };

  useEffect(() => {
    const timeout = setTimeout(() => {
      listScrollTopRef.current = 0;
      setListScrollTop(0);
      loadMoreTriggerRef.current = null;
      if (listBodyRef.current) listBodyRef.current.scrollTop = 0;
      onQuery({
        sort,
        direction,
      }).catch(() => {});
    }, 250);
    return () => clearTimeout(timeout);
  }, [sort, direction, onQuery]);

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

  useEffect(() => {
    if (!highlightIdentity?.vaultId || !listBodyRef.current) return;
    const index = vaultItems.findIndex(entry => entry.vaultId === highlightIdentity.vaultId);
    if (index < 0) return;
    const targetTop = index * VIRTUAL_ROW_HEIGHT;
    listBodyRef.current.scrollTop = targetTop;
    listScrollTopRef.current = targetTop;
    setListScrollTop(targetTop);
  }, [highlightIdentity, vaultItems]);

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
  const selectSort = (field) => {
    if (sort === field) setDirection(current => current === 'asc' ? 'desc' : 'asc');
    else { setSort(field); setDirection('asc'); }
  };
  const sortAria = field => sort === field ? (direction === 'asc' ? 'ascending' : 'descending') : 'none';
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
      <div className="infinite-stash-filters" aria-label="Infinite Stash filters">
        <ItemFilterControls
          prefix="vault"
          filters={filters}
          facets={vaultFacets}
          showQuery
          query={filters.q}
          onQueryChange={(q) => handleFilterChange({ ...filters, q })}
          onChange={handleFilterChange}
        />
      </div>
      {vaultError && <div className="game-running-warning-banner" role="alert">Vault error: {vaultError}</div>}
      <div className="stash-status" role="status" aria-live="polite">{vaultLoading ? (vaultItems.length ? `Loading more items… ${vaultItems.length} shown` : "Loading vault…") : ""}</div>

      {!vaultLoading && vaultItems.length === 0 ? (
        <div className="stash-empty-state">
          <div className="stash-empty-sort-controls" aria-label="Sort empty stash">
            {['name', 'type', 'rarity', 'source', 'dateAdded'].map((field) => (
              <button key={field} type="button" className={`list-sort-header${sort === field ? ' active' : ''}`} aria-label={`Sort by ${field === 'dateAdded' ? 'date added' : field}`} aria-sort={sortAria(field)} onClick={() => selectSort(field)}>
                {field === 'dateAdded' ? 'Added' : field[0].toUpperCase() + field.slice(1)} {sort === field ? (direction === 'asc' ? '↑' : '↓') : ''}
              </button>
            ))}
          </div>
          <h3>{vaultTotal === 0 ? 'Your Infinite Stash is empty' : 'No items available'}</h3>
        </div>
      ) : (
        <div className="stash-list-view">
          <div className="stash-list-header" ref={listHeaderRef}>
            <span className="col-icon">Icon</span><button type="button" className={`list-sort-header col-name${sort === 'name' ? ' active' : ''}`} aria-label="Sort by item name" aria-sort={sortAria('name')} onClick={() => selectSort('name')}>Item Name {sort === 'name' ? (direction === 'asc' ? '↑' : '↓') : ''}</button>
            <button type="button" className={`list-sort-header col-type${sort === 'type' ? ' active' : ''}`} aria-label="Sort by type" aria-sort={sortAria('type')} onClick={() => selectSort('type')}>Type {sort === 'type' ? (direction === 'asc' ? '↑' : '↓') : ''}</button><button type="button" className={`list-sort-header col-set${sort === 'rarity' ? ' active' : ''}`} aria-label="Sort by rarity" aria-sort={sortAria('rarity')} onClick={() => selectSort('rarity')}>Rarity {sort === 'rarity' ? (direction === 'asc' ? '↑' : '↓') : ''}</button>
            <button type="button" className={`list-sort-header col-source${sort === 'source' ? ' active' : ''}`} aria-label="Sort by source save" aria-sort={sortAria('source')} onClick={() => selectSort('source')}>Source Save {sort === 'source' ? (direction === 'asc' ? '↑' : '↓') : ''}</button><button type="button" className={`list-sort-header col-added${sort === 'dateAdded' ? ' active' : ''}`} aria-label="Sort by date added" aria-sort={sortAria('dateAdded')} onClick={() => selectSort('dateAdded')}>Added {sort === 'dateAdded' ? (direction === 'asc' ? '↑' : '↓') : ''}</button><span className="col-actions">Actions</span>
          </div>
          <div className="stash-list-body" ref={listBodyRef} onScroll={handleListScroll}>
                        <div className="stash-virtual-spacer" style={{ height: `${virtualStart * VIRTUAL_ROW_HEIGHT}px` }} aria-hidden="true" />
            {virtualItems.map((entry) => {
              const item = entry.itemData;
              const colorClass = getItemColorClass(item);
              const moving = movingItemKeys.has(`withdraw:${entry.vaultId}`);
              return (
                <TooltipTrigger key={entry.vaultId} className={`stash-item-row ${highlightIdentity?.vaultId === entry.vaultId ? 'item-search-highlight' : ''}`} item={item}>
                  <div className="col-icon icon-cell"><ItemSprite item={item} showTooltip={false} /></div>
                  <div className="col-name name-cell"><span className={`item-name-text ${colorClass}`}>{getItemDisplayName(item)}</span></div>
                  <div className="col-type type-cell"><span className="badge-type">{resolveVaultBaseType(item)}</span><span className="badge-slot">{getItemSlotCategory(item)}</span></div>
                  <div className="col-set set-cell">{item.set_name ? <span className="badge-set">{item.set_name}</span> : <span className="badge-rarity">{colorClass.replace('quality-', '')}</span>}</div>
                  <div className="col-source source-cell"><span className="source-name">{entry.sourceSave.replace('.d2s', '')}</span></div>
                  <div className="col-added source-cell"><span className="source-date">{new Date(entry.stashedAt).toLocaleDateString()}</span></div>
                  <div className="col-actions actions-cell" style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                    {moving ? (
                      <button className="btn-d2r btn-secondary" disabled>Moving…</button>
                    ) : entry.status === 'pending_withdraw' ? (
                      <button className="btn-d2r btn-secondary" onClick={() => onRecover?.(entry.vaultId)}>🔄 Recover</button>
                    ) : (
                      <>
                        <button className="btn-d2r btn-secondary" onClick={() => onWithdraw?.(entry.vaultId, item)}>👤 Personal Stash</button>
                        <button className="btn-d2r btn-secondary" onClick={() => onWithdrawShared?.(entry.vaultId, item)}>🪙 Shared Stash</button>
                      </>
                    )}
                    {!moving && <button className="btn-remove" aria-label={`Remove ${getItemDisplayName(item)} from Infinite Stash`} onClick={() => handleRemove(entry.vaultId)}>🗑️</button>}
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
