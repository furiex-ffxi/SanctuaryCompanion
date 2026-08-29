import React, { useState } from 'react'
import { getItemSlotCategory } from '../domain/entities/VaultCatalog.js'
import { getVaultCategory } from '../domain/entities/VaultProjection.js'

export const EMPTY_ITEM_FILTERS = Object.freeze({ q: '', category: 'All', slot: 'All', setName: 'All', quality: 'All', minLevel: '', maxLevel: '' })

export function getItemFilterFacets(items = []) {
  const values = { categories: new Set(), slots: new Set(), sets: new Set() }
  for (const item of items) {
    const slot = getItemSlotCategory(item)
    const category = getVaultCategory(item, slot)
    if (category) values.categories.add(category)
    if (slot) values.slots.add(slot)
    if (item.set_name) values.sets.add(item.set_name)
  }
  return Object.fromEntries(Object.entries(values).map(([key, set]) => [key, [...set].sort()]))
}

export function ItemFilterControls({ filters = EMPTY_ITEM_FILTERS, facets = {}, onChange, prefix = 'item-filter', showQuery = false, query = '', onQueryChange, compact = false }) {
  const update = (key, value) => onChange?.({ ...filters, [key]: value })
  const [open, setOpen] = useState(!compact)
  const active = ['category', 'slot', 'setName', 'quality', 'minLevel', 'maxLevel'].filter(key => filters[key] !== '' && filters[key] !== 'All' && filters[key] != null)
  return <div className={`item-filter-toolbar${compact ? ' compact' : ''}`}>
    {compact && <div className="local-filter-toolbar-row"><button type="button" className="btn-d2r btn-secondary filter-toggle" onClick={() => setOpen(value => !value)} aria-expanded={open}>Filters</button>{active.map(key => <button key={key} type="button" className="filter-chip" onClick={() => update(key, key.startsWith('min') || key.startsWith('max') ? '' : 'All')}>{key === 'minLevel' ? `Level ${filters[key]}+` : `${key}: ${filters[key]}`} ×</button>)}<span className="filter-spacer" /></div>}
    {open && <div className="item-filter-controls">
    {showQuery && <div className="filter-group"><label htmlFor={`${prefix}-query`}>Search:</label><div className="search-input-shell"><input id={`${prefix}-query`} className="d2r-input" type="search" value={query} onChange={e => onQueryChange?.(e.target.value)} />{query && <button type="button" className="search-clear-btn" aria-label={`Clear ${prefix} search`} onClick={() => onQueryChange?.('')}>×</button>}</div></div>}
    <div className="filter-group"><label htmlFor={`${prefix}-category`}>Category:</label><select id={`${prefix}-category`} className="d2r-select" value={filters.category} onChange={e => update('category', e.target.value)}><option>All</option>{(facets.categories || []).map(v => <option key={v}>{v}</option>)}</select></div>
    <div className="filter-group"><label htmlFor={`${prefix}-slot`}>Slot:</label><select id={`${prefix}-slot`} className="d2r-select" value={filters.slot} onChange={e => update('slot', e.target.value)}><option>All</option>{(facets.slots || []).map(v => <option key={v}>{v}</option>)}</select></div>
    <div className="filter-group"><label htmlFor={`${prefix}-set`}>Set Name:</label><select id={`${prefix}-set`} className="d2r-select" value={filters.setName} onChange={e => update('setName', e.target.value)}><option>All</option>{(facets.sets || []).map(v => <option key={v}>{v}</option>)}</select></div>
    <div className="filter-group"><label htmlFor={`${prefix}-quality`}>Rarity:</label><select id={`${prefix}-quality`} className="d2r-select" value={filters.quality} onChange={e => update('quality', e.target.value)}><option>All</option><option value="7">Unique</option><option value="5">Set</option><option value="6">Rare</option><option value="4">Magic</option><option value="2">Normal</option></select></div>
    <div className="filter-group"><label htmlFor={`${prefix}-min-level`}>Level:</label><span className="level-range"><input id={`${prefix}-min-level`} className="d2r-input" type="number" placeholder="Min" value={filters.minLevel} onChange={e => update('minLevel', e.target.value)} /><span>-</span><input id={`${prefix}-max-level`} className="d2r-input" type="number" placeholder="Max" value={filters.maxLevel} onChange={e => update('maxLevel', e.target.value)} /></span></div>
    </div>}
  </div>
}
