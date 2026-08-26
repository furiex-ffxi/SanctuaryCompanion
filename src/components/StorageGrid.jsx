import React from 'react';
import ItemSprite, { getItemDisplayName } from './ItemSprite';
import { ItemTooltip } from './ItemTooltip';
import { TooltipTrigger } from './TooltipTrigger';
import { getItemDimensions, getItemColorClass } from '../domain/entities/Item';

export function StorageGrid({ meta, items, highlightIdentity }) {
  const { cols, rows } = meta;
  
  const gridMap = Array.from({ length: rows }, () => Array(cols).fill(null));
  const occupied = Array.from({ length: rows }, () => Array(cols).fill(false));

  items.forEach(item => {
    const x = item.position_x ?? 0;
    const y = item.position_y ?? 0;
    const [w, h] = getItemDimensions(item.type);
    
    if (y < rows && x < cols) {
      gridMap[y][x] = item;
      for (let r = y; r < Math.min(rows, y + h); r++) {
        for (let c = x; c < Math.min(cols, x + w); c++) {
          occupied[r][c] = true;
        }
      }
    }
  });

  const cells = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const item = gridMap[r][c];
      if (item) {
        const [w, h] = getItemDimensions(item.type);
        const colorClass = getItemColorClass(item);
        cells.push(
          <TooltipTrigger
            key={`item-${r}-${c}`}
            className={`inv-item-card ${colorClass} ${highlightIdentity?.itemSeed != null && String(highlightIdentity.itemSeed) === String(item.id) ? 'item-search-highlight' : ''}`}
            style={{
              gridColumn: `${c + 1} / span ${w}`,
              gridRow: `${r + 1} / span ${h}`,
            }}
            item={item}
          >
            <div className="inv-item-inner">
              <ItemSprite item={item} />
              {meta?.onDeposit && (() => {
                const itemKey = String(item.id ?? item.item_seed ?? item.rawBytesHex ?? '');
                const moving = [...(meta.movingItemKeys || [])].some((key) => key.startsWith('deposit:') && key.endsWith(`:${itemKey}`));
                return (
                <button
                  className="btn-deposit-stash"
                  title={moving ? `Moving ${getItemDisplayName(item)}…` : 'Deposit item to Infinite Stash Vault'}
                  disabled={moving}
                  onClick={(e) => {
                    e.stopPropagation();
                    meta.onDeposit({ ...item, position_x: item.position_x ?? c, position_y: item.position_y ?? r, pageIndex: meta.activePageIdx });
                  }}
                >
                  {moving ? 'Moving…' : '📥 Vault'}
                </button>
                );
              })()}
            </div>
          </TooltipTrigger>
        );
      } else if (!occupied[r][c]) {
        cells.push(
          <div
            key={`empty-${r}-${c}`}
            className="grid-cell"
            style={{
              gridColumn: `${c + 1}`,
              gridRow: `${r + 1}`,
            }}
          />
        );
      }
    }
  }

  return (
    <div className="storage-container">
      <div
        className="inventory-grid"
        style={{
          gridTemplateColumns: `repeat(${cols}, 52px)`,
          gridTemplateRows: `repeat(${rows}, 52px)`,
        }}
      >
        {cells}
      </div>
      <div className="storage-footer">
        {items.length} item{items.length !== 1 ? 's' : ''} · {cols}×{rows} grid
      </div>
    </div>
  );
}
