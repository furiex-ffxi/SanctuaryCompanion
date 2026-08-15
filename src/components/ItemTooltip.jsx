import React from 'react';
import { getBaseTypeName, getItemDisplayName, getItemSocketCount } from './ItemSprite';
import { getItemColorClass, getItemDimensions, getItemLevel, getItemLevelRequirement } from '../domain/entities/Item';

const skillTabNames = [
  ["Amazon", ["Bow and Crossbow", "Javelin and Spear", "Passive and Magic"]],
  ["Sorceress", ["Fire", "Lightning", "Cold"]],
  ["Necromancer", ["Curses", "Poison and Bone", "Summoning"]],
  ["Paladin", ["Combat", "Offensive Auras", "Defensive Auras"]],
  ["Barbarian", ["Combat Skills", "Warcries", "Masteries"]],
  ["Druid", ["Elemental", "Shape Shifting", "Summoning"]],
  ["Assassin", ["Martial Arts", "Shadow Disciplines", "Traps"]],
  ["", ["Demon", "Eldritch", "Chaos"]],
];

function formatAttributeDescription(attribute) {
  const numericId = Number(attribute?.id);
  const values = Array.isArray(attribute.values) ? attribute.values.map(Number) : [];
  const rawValue = values[0];
  if ([6, 7, 8, 9, 10, 11].includes(numericId) && Number.isFinite(rawValue) && Math.abs(rawValue) >= 256 && rawValue % 256 === 0) {
    const label = numericId === 6 || numericId === 7 ? 'Life' : numericId === 8 || numericId === 9 ? 'Mana' : 'Stamina';
    return (rawValue >= 0 ? '+' : '') + (rawValue / 256) + ' ' + label;
  }
  const normalizedName = String(attribute?.name || '').toLowerCase().replace(/_/g, '');
  if (normalizedName.endsWith('addskilltab')) {
    const values = Array.isArray(attribute.values) ? attribute.values.map(Number) : [];
    let packedLayer = Number.isFinite(Number(attribute.layer)) ? Number(attribute.layer) : null;
    let bonus = values.at(-1) || 0;

    // New worker format: layer is the packed class/tab value and values[0] is the bonus.
    // Legacy parser format: values were [tab, class, bonus].
    if (packedLayer === null && values.length >= 3 && values[0] >= 0 && values[0] < 8 && values[1] >= 0) {
      packedLayer = (values[1] << 3) | values[0];
    }
    // Some older vault entries embedded the packed value in their description.
    if (packedLayer === null) {
      const match = String(attribute.description || '').match(/(?:tab|to)\s+(\d+)/i);
      if (match) packedLayer = Number(match[1]);
    }
    if (packedLayer !== null) {
      const classIndex = packedLayer >> 3;
      const tabIndex = packedLayer & 7;
      const tab = skillTabNames[classIndex]?.[1]?.[tabIndex];
      if (tab) {
        const className = skillTabNames[classIndex][0];
        return '+' + bonus + ' to ' + (className ? className + ' ' : '') + tab + ' Skills';
      }
    }
  }
  return attribute?.description || (attribute?.label || attribute?.name?.replace(/_/g, ' ') || 'Stat') + ': ' + (attribute?.values || []).join(', ');
}
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
  const levelRequirement = getItemLevelRequirement(item);
  const itemLevel = getItemLevel(item);

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
        {typeName || 'Item'} ({w}Ã—{h})
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
          const desc = formatAttributeDescription(a);
          return <div key={i} className="tooltip-stat-item">{desc}</div>;
        })}
        {setAttrs.length > 0 && (
          <div className="tooltip-set-bonuses">
            <div className="tooltip-section-header quality-set">Set Bonuses:</div>
            {setAttrs.map((sa, idx) => {
              const desc = formatAttributeDescription(sa);
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
