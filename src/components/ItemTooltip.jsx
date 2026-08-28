import React from 'react';
import { getItemDisplayName, getItemSocketCount } from './ItemSprite';
import { getItemTypeDisplayName, getItemDetails, formatStat, groupItemStats } from '../domain/entities/ItemDisplay.js';
import { getItemColorClass, getItemDimensions, getItemLevel, getItemLevelRequirement } from '../domain/entities/Item';
import { compareItemDerivedStat, compareItemStat, getDerivedComparisonAttributes, getRollRange } from '../domain/entities/ItemRollComparison.js';

export const ItemTooltip = ({ item, comparisonItems = [] }) => {
  if (!item) return null;
  const name = getItemDisplayName(item);
  const typeName = getItemTypeDisplayName(item);
  const colorClass = getItemColorClass(item);
  const [w, h] = getItemDimensions(item.type);
  const socketCount = getItemSocketCount(item);
  const levelRequirement = getItemLevelRequirement(item);
  const itemLevel = getItemLevel(item);
  const itemDetails = getItemDetails(item).filter((detail) => !detail.startsWith('Item Level:'));

  const attributeSources = [
    item.displayed_combined_magic_attributes,
    item.displayed_magic_attributes,
    item.combined_magic_attributes,
    item.magic_attributes,
  ];
  const rawAttrs = attributeSources.find((attributes) => Array.isArray(attributes)) || [];

  const rawVisible = rawAttrs.filter(a => a.visible !== false);
  const attrs = comparisonItems.length > 0 || rawVisible.some(getRollRange)
    ? rawVisible
    : groupItemStats(rawVisible);
  const derivedAttrs = getDerivedComparisonAttributes(item);

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
        {itemDetails.map((detail) => (
          <div key={detail} className="tooltip-stat-item">{detail}</div>
        ))}
        {socketCount > 0 && (
          <div className="tooltip-stat-item white">
            [{socketCount} sockets]
          </div>
        )}
        {derivedAttrs.map((a) => {
          const comparison = compareItemDerivedStat(a, item, comparisonItems);
          return (
            <div key={a.id} className="tooltip-stat-item">
              <span>{a.description}</span>
              {comparison && (
                <small className={comparison.isBest ? 'tooltip-roll-best' : 'tooltip-roll-comparison'}>
                  {comparison.isBest
                    ? `Best of ${comparison.compared} matches`
                    : `${comparison.difference} below best of ${comparison.compared}`}
                </small>
              )}
            </div>
          );
        })}
        {attrs.map((a, i) => {
          const desc = formatStat(a);
          const range = getRollRange(a);
          const comparison = compareItemStat({ ...a, itemType: item.type }, comparisonItems);
          return (
            <div key={i} className="tooltip-stat-item">
              <span>{desc}</span>
              {range && (
                <small className="tooltip-roll-range">
                  Roll {range.min}–{range.max} · {range.percent}%
                </small>
              )}
              {comparison && (
                <small className={comparison.isBest ? 'tooltip-roll-best' : 'tooltip-roll-comparison'}>
                  {comparison.isBest
                    ? `Best of ${comparison.compared} matches`
                    : `${comparison.difference} below best of ${comparison.compared}`}
                </small>
              )}
            </div>
          );
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
