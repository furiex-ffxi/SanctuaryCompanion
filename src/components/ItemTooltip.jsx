import React from 'react';
import { getBaseTypeName, getItemDisplayName, getItemSocketCount } from './ItemSprite';
import { getItemColorClass, getItemDimensions } from '../domain/entities/Item';

export const ItemTooltip = ({ item }) => {
  if (!item) return null;
  const name = getItemDisplayName(item);
  const baseTypeName = getBaseTypeName(item.type);
  const typeName = item.type_name
    && item.type_name.trim().toLowerCase() !== (item.type || '').trim().toLowerCase()
    ? item.type_name.trim()
    : baseTypeName;
  const colorClass = getItemColorClass(item);
  const [w, h] = getItemDimensions(item.type);
  const socketCount = getItemSocketCount(item);

  const rawAttrs = item.displayed_combined_magic_attributes
    || item.displayed_magic_attributes
    || item.combined_magic_attributes
    || item.magic_attributes
    || [];

  const attrs = rawAttrs.filter(a => a.visible !== false);

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
        {typeName || 'Item'} ({w}×{h})
      </div>
      <div className="tooltip-stats">
        {socketCount > 0 && (
          <div className="tooltip-stat-item white">
            [{socketCount} sockets]
          </div>
        )}
        {attrs.map((a, i) => {
          const desc = a.description || `${a.name.replace(/_/g,' ')}: ${a.values.join(', ')}`;
          return <div key={i} className="tooltip-stat-item">{desc}</div>;
        })}
        {setAttrs.length > 0 && (
          <div className="tooltip-set-bonuses">
            <div className="tooltip-section-header quality-set">Set Bonuses:</div>
            {setAttrs.map((sa, idx) => {
              const desc = sa.description || `${sa.name.replace(/_/g, ' ')}: ${sa.values.join(', ')}`;
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
