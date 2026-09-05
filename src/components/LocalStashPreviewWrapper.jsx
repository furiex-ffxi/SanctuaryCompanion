import React, { useMemo, useState, useEffect, useCallback } from 'react';
import { InfiniteStashPanel } from './InfiniteStashPanel';
import { getItemDisplayName } from '../domain/entities/ItemDisplay';
import { resolveVaultBaseType, getItemSlotCategory } from '../domain/entities/VaultCatalog';
import { InfiniteStashAdapter } from '../adapters/InfiniteStashAdapter';
import { useUIStore } from '../stores/useUIStore';
import { getItemFilterFacets } from './ItemFilterControls';

export function LocalStashPreviewWrapper({ sharedStash, refreshVault }) {
  const [filters, setFilters] = useState({});
  const [sort, setSort] = useState('dateAdded');
  const [direction, setDirection] = useState('desc');
  const globalRealm = useUIStore((state) => state.vaultRealm);
  
  // Keep realm string strictly matched to app conventions ('expansion' or 'rotw')
  const [targetRealm, setTargetRealm] = useState(globalRealm);
  
  const allItems = useMemo(() => {
    const arr = [];
    if (!sharedStash?.pages) return arr;
    sharedStash.pages.forEach((page, pageIdx) => {
      (page.items || []).forEach((item, itemIdx) => {
        arr.push({
          vaultId: `${pageIdx}-${itemIdx}-${item.guid || Math.random().toString(36).slice(2)}`,
          stashedAt: new Date().toISOString(),
          sourceSave: sharedStash.originalFileName || 'Uploaded File',
          itemData: item
        });
      });
    });
    return arr;
  }, [sharedStash]);

  const filteredItems = useMemo(() => {
    return allItems.filter(entry => {
      const item = entry.itemData;
      if (filters.q) {
        const q = filters.q.toLowerCase();
        const name = getItemDisplayName(item).toLowerCase();
        const type = resolveVaultBaseType(item).toLowerCase();
        if (!name.includes(q) && !type.includes(q)) return false;
      }
      if (filters.category && filters.category !== 'All') {
        if (getItemSlotCategory(item) !== filters.category) return false;
      }
      if (filters.slot && filters.slot !== 'All') {
        // Advanced slot filtering logic can go here (simplified for now)
        const facets = getItemFilterFacets([item]);
        if (!facets.slots.includes(filters.slot)) return false;
      }
      if (filters.quality && filters.quality !== 'All') {
        if (String(item.quality) !== String(filters.quality)) return false;
      }
      if (filters.minLevel != null && item.level_req < filters.minLevel) return false;
      if (filters.maxLevel != null && item.level_req > filters.maxLevel) return false;
      
      return true;
    }).sort((a, b) => {
      let cmp = 0;
      if (sort === 'name') {
        cmp = getItemDisplayName(a.itemData).localeCompare(getItemDisplayName(b.itemData));
      } else if (sort === 'type') {
        cmp = resolveVaultBaseType(a.itemData).localeCompare(resolveVaultBaseType(b.itemData));
      } else if (sort === 'rarity') {
        cmp = (b.itemData.quality || 0) - (a.itemData.quality || 0);
      } else if (sort === 'source') {
        cmp = a.sourceSave.localeCompare(b.sourceSave);
      } else if (sort === 'dateAdded') {
        cmp = new Date(a.stashedAt) - new Date(b.stashedAt);
      }
      return direction === 'asc' ? cmp : -cmp;
    });
  }, [allItems, filters, sort, direction]);

  const vaultFacets = useMemo(() => {
    return getItemFilterFacets(allItems.map(e => e.itemData));
  }, [allItems]);

  const handleQuery = useCallback(({ sort: nextSort, direction: nextDir, ...nextFilters }) => {
    setFilters(prev => ({ ...prev, ...nextFilters }));
    if (nextSort) setSort(nextSort);
    if (nextDir) setDirection(nextDir);
  }, []);

  return (
    <InfiniteStashPanel
      title={`Preview: ${sharedStash?.originalFileName || 'Uploaded Stash'}`}
      hideActions={true}
      customActions={
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <select 
            className="header-control" 
            value={targetRealm} 
            onChange={(e) => setTargetRealm(e.target.value)}
          >
            <option value="expansion">Expansion Vault</option>
            <option value="rotw">ROTW Vault</option>
          </select>
          <button
            className="btn-d2r btn-primary"
            onClick={async () => {
              if (!window.confirm(`Import all ${allItems.length} items into the ${targetRealm} infinite stash?`)) return;
              const entries = allItems.map(entry => ({
                realm: targetRealm,
                stashedAt: entry.stashedAt,
                sourceSave: entry.sourceSave,
                itemData: entry.itemData
              }));
              try {
                const res = await InfiniteStashAdapter.import(entries, targetRealm);
                if (refreshVault) refreshVault();
                alert(`Successfully imported ${res.addedCount} items into ${targetRealm}!`);
              } catch (err) {
                alert(`Import failed: ${err.message}`);
              }
            }}
          >
            📥 Import All to {targetRealm === 'expansion' ? 'Expansion' : 'ROTW'}
          </button>
        </div>
      }
      vaultItems={filteredItems}
      vaultTotal={filteredItems.length}
      vaultNextCursor={null}
      vaultLoading={false}
      vaultFilters={filters}
      vaultFacets={vaultFacets}
      onQuery={handleQuery}
      onImport={async (item) => {
        try {
          await InfiniteStashAdapter.import([{ 
            realm: targetRealm, 
            stashedAt: new Date().toISOString(), 
            sourceSave: sharedStash?.originalFileName || 'Uploaded File', 
            itemData: item 
          }], targetRealm);
          if (refreshVault) refreshVault();
          alert(`Item imported to ${targetRealm} successfully!`);
        } catch (err) {
          alert(`Import failed: ${err.message}`);
        }
      }}
    />
  );
}
