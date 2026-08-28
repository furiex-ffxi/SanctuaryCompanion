import React from 'react';
import ItemSprite, { getItemDisplayName } from './ItemSprite';
import { ItemTooltip } from './ItemTooltip';
import { TooltipTrigger } from './TooltipTrigger';
import { SLOT_META } from '../domain/entities/Item';

import { useUIStore } from '../stores/useUIStore';

export function EquipmentPanel({ charData, onDeposit, movingItemKeys = new Set() }) {
  const isSwapped = useUIStore((state) => state.isSwapped);
  const setIsSwapped = useUIStore((state) => state.setIsSwapped);

  const getItemInSlot = (slotId) =>
    charData?.items?.find((i) => i.location_id === 1 && i.equipped_id === slotId) ?? null;

  const weaponSlot = isSwapped ? 11 : 4;
  const shieldSlot = isSwapped ? 12 : 5;

  const renderSlot = (slotId) => {
    const meta = SLOT_META[slotId];
    const item = getItemInSlot(slotId);
    const itemKey = item ? String(item.id ?? item.item_seed ?? item.rawBytesHex ?? '') : '';
    const moving = item && [...movingItemKeys].some((key) => key.startsWith('deposit:') && key.endsWith(`:${itemKey}`));

    return (
      <TooltipTrigger key={slotId} className={`equip-slot ${meta.cls}`} item={item}>
        {!item && <span className="slot-label">{meta.label}</span>}
        {item && (
          <div className="slot-content">
            <ItemSprite item={item} />
            {onDeposit && (
              <button
                className="btn-deposit-stash equip-deposit"
                title={moving ? `Moving ${getItemDisplayName(item)}…` : 'Deposit item to Infinite Stash Vault'}
                disabled={moving}
                onClick={(e) => {
                  e.stopPropagation();
                  onDeposit(item);
                }}
              >
                📥
              </button>
            )}
          </div>
        )}
      </TooltipTrigger>
    );
  };

  return (
    <div className="panel">
      <div className="panel-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span>Equipment — {isSwapped ? 'Alt Slot Active' : 'Main Slot Active'}</span>
        <button
          className="btn-d2r"
          style={{ padding: '4px 12px', fontSize: '0.8rem' }}
          onClick={() => setIsSwapped((s) => !s)}
        >
          Swap Weapons
        </button>
      </div>

      <div className="equip-layout">
        {/* Left column */}
        <div className="equip-column left">
          {renderSlot(weaponSlot)}
          {renderSlot(10)}
        </div>
        {/* Center column */}
        <div className="equip-column center">
          {renderSlot(1)}
          {renderSlot(2)}
          {renderSlot(3)}
          <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
            {renderSlot(6)}
            {renderSlot(7)}
          </div>
          {renderSlot(8)}
        </div>
        {/* Right column */}
        <div className="equip-column right">
          {renderSlot(shieldSlot)}
          {renderSlot(9)}
        </div>
      </div>
    </div>
  );
}
