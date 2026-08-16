import React from 'react';
import { getItemDisplayName, getItemSocketCount } from './ItemSprite';
import { getItemTypeDisplayName, formatStat, groupItemStats } from '../domain/entities/ItemDisplay.js';
import { getItemColorClass, getItemDimensions, getItemLevel, getItemLevelRequirement } from '../domain/entities/Item';

export const ItemTooltip = ({ item }) => {
  if (!item) return null;
  const name = getItemDisplayName(item);
  const typeName = getItemTypeDisplayName(item);
  const colorClass = getItemColorClass(item);
  const [w, h] = getItemDimensions(item.type);
  const socketCount = getItemSocketCount(item);
  const levelRequirement = getItemLevelRequirement(item);
  const itemLevel = getItemLevel(item);

  const rawAttrs = item.displayed_combined_magic_attributes
    || item.displayed_magic_attributes
    || item.combined_magic_attributes
    || item.magic_attributes
    || [];

  const rawVisible = rawAttrs.filter(a => a.visible !== false);
  const attrs = groupItemStats(rawVisible);

  // Extract set attributes if available on set items
  const setAttrs = (item.set_attributes || []).flat().filter(Boolean);

  return (
    <div className="tooltip-card">
      <div className={`tooltip-header ${colorClass}`}>{name}</div>
      {item.set_name && (
        <div className="tooltip-set-name quality-set">
          {item.set_name}
        </div>
      )}
      <div className="tooltip-type">
        {typeName || 'Item'} ({w} x {h})
      </div>
      <div className="tooltip-stats">
        <div className="tooltip-stat-item tooltip-level-requirement">
          {levelRequirement > 0 ? 'Required Level: ' + levelRequirement : 'Not equippable'}
        </div>
        {itemLevel != null && <div className="tooltip-stat-item">Item Level: {itemLevel}</div>}
        {socketCount > 0 && (
          <div className="tooltip-stat-item white">
            [{socketCount} sockets]
          </div>
        )}
        {attrs.map((a, i) => {
          const desc = formatStat(a);
          return <div key={i} className="tooltip-stat-item">{desc}</div>;
        })}
        {setAttrs.length > 0 && (
          <div className="tooltip-set-bonuses">
            <div className="tooltip-section-header quality-set">Set Bonuses:</div>
            {setAttrs.map((sa, idx) => {
              const desc = formatStat(sa);
              return (
                <div key={idx} className="tooltip-stat-item quality-set">
                  {desc}
                </div>
              );
            })}
          </div>
        )}
        {item.socketed_items?.length > 0 && (
          <div className="tooltip-sockets">
            Socketed: {item.socketed_items.map(s => s.type_name || s.type).join(', ')}
          </div>
        )}
      </div>
    </div>
  );
};
