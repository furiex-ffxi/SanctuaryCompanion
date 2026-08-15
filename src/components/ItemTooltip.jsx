import React from 'react';
import { getBaseTypeName, getItemDisplayName } from './ItemSprite';
import { getItemColorClass, getItemDimensions } from '../domain/entities/Item';
import { formatStat, getFriendlyBaseName, getItemDetails } from '../domain/entities/ItemDisplay.js';

export const ItemTooltip = ({ item }) => {
  if (!item) return null;
  const name = getItemDisplayName(item);
  const baseTypeName = getFriendlyBaseName(item) || getBaseTypeName(item.type);
  const typeName = item.type_name
    && item.type_name.trim().toLowerCase() !== (item.type || '').trim().toLowerCase()
    ? item.type_name.trim()
    : baseTypeName;
  const colorClass = getItemColorClass(item);
  const [w, h] = getItemDimensions(item.type);

  const rawAttrs = item.displayed_combined_magic_attributes
    || item.displayed_magic_attributes
    || item.combined_magic_attributes
    || item.magic_attributes
    || [];

  const attrs = rawAttrs.filter(a => a.visible !== false);
  const details = getItemDetails(item);

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
        {typeName || 'Item'} ({w}&times;{h})
      </div>
      <div className="tooltip-stats">
        {details.map((detail) => <div key={detail} className="tooltip-stat-item white">{detail}</div>)}
        {item.socketed === 1 && (
          <div className="tooltip-stat-item white">
            [{item.total_nr_of_sockets || item.socketed_items?.length || 0} sockets]
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
            Socketed: {item.socketed_items.map(s => getFriendlyBaseName(s)).join(', ')}
          </div>
        )}
      </div>
    </div>
  );
};
