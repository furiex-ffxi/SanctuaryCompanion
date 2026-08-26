import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import { useGlobalItemSearchResults } from '../hooks/useGlobalItemSearchResults.js';
import { TooltipTrigger } from './TooltipTrigger.jsx';
import { summarizeItemComparison } from '../domain/entities/ItemRollComparison.js';
import { useUIStore } from '../stores/useUIStore.js';
import { ItemFilterControls, EMPTY_ITEM_FILTERS } from './ItemFilterControls.jsx';

const sourceLabels = { characters: 'Characters', character: 'Characters', sharedStash: 'Shared Stash', infiniteStash: 'Infinite Stash' };
const urlDefaults = { ...EMPTY_ITEM_FILTERS, scope: 'all' };

function readSearchUrl() {
  const params = new URLSearchParams(window.location.search);
  const restored = { ...urlDefaults, q: params.get('search') ?? params.get('q') ?? '' };
  for (const key of ['scope', 'category', 'slot', 'setName', 'quality', 'minLevel', 'maxLevel']) if (params.has(key)) restored[key] = params.get(key);
  return restored;
}

function writeSearchUrl(filters, { replace = true } = {}) {
  const params = new URLSearchParams(window.location.search);
  for (const key of ['search', 'q', 'scope', 'category', 'slot', 'setName', 'quality', 'minLevel', 'maxLevel']) params.delete(key);
  if (filters.q?.trim()) params.set('search', filters.q.trim());
  if (filters.scope && filters.scope !== 'all') params.set('scope', filters.scope);
  for (const key of ['category', 'slot', 'setName', 'quality', 'minLevel', 'maxLevel']) if (filters[key] !== '' && filters[key] != null && filters[key] !== 'All') params.set(key, filters[key]);
  const query = params.toString();
  const url = `${window.location.pathname}${query ? `?${query}` : ''}${window.location.hash}`;
  if (replace) window.history.replaceState(null, '', url); else window.history.pushState(null, '', url);
}

function SearchOption({ id, result, results, selected, onHover, onSelect }) {
  const sockets = result.preview.socketCount > 0 ? ` (${result.preview.socketCount} sockets)` : '';
  const tab = result.pageIndex != null ? ` · Tab ${result.pageIndex + 1}` : '';
  const item = result.preview.item;
  const comparisonItems = results.map(row => row.preview.item).filter(Boolean).filter(peer => peer.type === item.type);
  const comparison = summarizeItemComparison(item, comparisonItems);
  return <TooltipTrigger id={id} item={item} comparisonItems={comparisonItems} className={`global-search-option${selected ? ' active' : ''}`} role="option" aria-selected={selected} onMouseEnter={onHover} onMouseDown={event => event.preventDefault()} onClick={onSelect} title={`${result.preview.typeName || ''} — ${result.location}`}>
    <span className="global-search-option-heading"><span>{result.preview.displayName}{sockets}</span>{comparison.comparableCount > 0 && <small className="search-comparison-badge">{comparison.bestCount}/{comparison.comparableCount} best</small>}</span>
    <small className="search-match-reason">{result.match.field}: {result.match.text}</small>
    <small>{result.sourceKind === 'character' ? 'Character' : result.sourceKind === 'sharedStash' ? 'Shared Stash' : 'Infinite Stash'} · {result.characterName || result.filename} · {result.location}{tab}</small>
  </TooltipTrigger>;
}

export function GlobalItemSearch({ sharedFile = 'ModernSharedStashSoftCoreV2.d2i', facets = {}, onSelect }) {
  const draft = useUIStore(state => state.itemSearchDraft);
  const setDraft = useUIStore(state => state.setItemSearchDraft);
  const paletteOpen = useUIStore(state => state.itemSearchOpen);
  const setPaletteOpen = useUIStore(state => state.setItemSearchOpen);
  const filtersOpen = useUIStore(state => state.itemSearchFiltersOpen);
  const setFiltersOpen = useUIStore(state => state.setItemSearchFiltersOpen);
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef(null);
  const rootRef = useRef(null);
  const listboxId = useId();
  const filters = { ...urlDefaults, ...draft, q: query, scope: draft.scope || 'all' };
  const { data, busy, error } = useGlobalItemSearchResults(query, sharedFile, { ...filters, q: undefined });
  const groups = useMemo(() => Object.entries(data?.groups || {}).filter(([, group]) => group), [data]);
  const rows = groups.flatMap(([, group]) => group.results || []);

  function closePalette() { setPaletteOpen(false); setFiltersOpen(false); setQuery(''); setDraft({ q: '' }); setActiveIndex(0); }
  function dismissPalette() { setPaletteOpen(false); setFiltersOpen(false); setActiveIndex(0); }
  useEffect(() => {
    const restored = readSearchUrl();
    const searchParams = new URLSearchParams(window.location.search);
    const hasCommittedSearchState = ['search', 'q', 'scope', 'category', 'slot', 'setName', 'quality', 'minLevel', 'maxLevel'].some(key => searchParams.has(key));
    if (hasCommittedSearchState) { setQuery(restored.q); setDraft(restored); }
    setPaletteOpen(false);
    const onKey = event => {
      if (event.key === '/' && !['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName)) { event.preventDefault(); setPaletteOpen(true); requestAnimationFrame(() => inputRef.current?.focus()); }
      if (event.key === 'Escape' && useUIStore.getState().itemSearchOpen) { event.preventDefault(); if (useUIStore.getState().itemSearchFiltersOpen) setFiltersOpen(false); else closePalette(); }
    };
    const onPopState = () => { const next = readSearchUrl(); const params = new URLSearchParams(window.location.search); const hasState = ['search', 'q', 'scope', 'category', 'slot', 'setName', 'quality', 'minLevel', 'maxLevel'].some(key => params.has(key)); setQuery(next.q); setDraft(next); setPaletteOpen(hasState); };
    window.addEventListener('keydown', onKey); window.addEventListener('popstate', onPopState);
    const onOutsidePointer = event => { if (useUIStore.getState().itemSearchOpen && !rootRef.current?.contains(event.target)) dismissPalette(); };
    document.addEventListener('pointerdown', onOutsidePointer);
    return () => {
      window.removeEventListener('keydown', onKey); window.removeEventListener('popstate', onPopState); document.removeEventListener('pointerdown', onOutsidePointer);
      // The app's result navigator owns a hash; an un-navigated standalone
      // palette should not leave transient test/session state behind.
      if (!window.location.hash) writeSearchUrl(urlDefaults);
    };
  }, []);
  useEffect(() => { if (paletteOpen) requestAnimationFrame(() => inputRef.current?.focus()); }, [paletteOpen]);

  function updateFilters(next, commit = true) { setDraft(next); setQuery(next.q ?? query); if (commit) writeSearchUrl({ ...filters, ...next }); setActiveIndex(0); }
  function clearAll() { const next = { ...urlDefaults }; setDraft(next); setQuery(''); writeSearchUrl(next); setActiveIndex(0); }
  function clearQuery() { const next = { ...filters, q: '' }; setDraft({ q: '' }); setQuery(''); writeSearchUrl(next); setActiveIndex(0); }
  function select(result) { writeSearchUrl(filters, { replace: false }); onSelect(result); closePalette(); }
  function handleKeyDown(event) {
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); if (filtersOpen) setFiltersOpen(false); else closePalette(); return; }
    if (!rows.length) return;
    if (event.key === 'ArrowDown') { event.preventDefault(); setActiveIndex(index => (index + 1) % rows.length); }
    else if (event.key === 'ArrowUp') { event.preventDefault(); setActiveIndex(index => (index - 1 + rows.length) % rows.length); }
    else if (event.key === 'Enter') { event.preventDefault(); select(rows[activeIndex]); }
  }
  const activeOptionId = paletteOpen && rows.length ? `${listboxId}-option-${activeIndex}` : undefined;
  const chips = ['category', 'slot', 'setName', 'quality', 'minLevel', 'maxLevel'].filter(key => filters[key] !== '' && filters[key] !== 'All' && filters[key] != null);

  return <div ref={rootRef} className="global-item-search">
    <div className="search-input-shell"><input ref={inputRef} className="header-control global-search-input" aria-label="Search all items" role="combobox" aria-autocomplete="list" aria-expanded={paletteOpen} aria-controls={paletteOpen ? listboxId : undefined} aria-activedescendant={activeOptionId} placeholder="Search items…" value={query} onFocus={() => setPaletteOpen(true)} onClick={() => setPaletteOpen(true)} onChange={event => { const q = event.target.value; setQuery(q); setDraft({ q }); setPaletteOpen(true); setActiveIndex(0); writeSearchUrl({ ...filters, q }); }} onKeyDown={handleKeyDown} />{query && <button type="button" className="search-clear-btn" aria-label="Clear global item search" onClick={clearQuery}>×</button>}</div>
    {paletteOpen && <div className="global-search-menu" role="dialog" aria-label="Search items palette">
      <div className="global-search-palette-header"><label htmlFor="global-search-scope">Search scope</label><select id="global-search-scope" value={filters.scope} onChange={event => updateFilters({ scope: event.target.value })}><option role="presentation" value="all">All sources</option><option role="presentation" value="character">Characters</option><option role="presentation" value="sharedStash">Shared Stash</option><option role="presentation" value="infiniteStash">Infinite Stash</option></select><button type="button" className="btn-d2r btn-secondary" onClick={() => setFiltersOpen(!filtersOpen)} aria-expanded={filtersOpen}>{filtersOpen ? 'Hide filters' : 'More filters'}</button><button type="button" className="btn-d2r btn-secondary" onClick={clearAll} disabled={!query && !chips.length}>Clear all</button></div>
      {chips.length > 0 && <div className="search-filter-chips" aria-label="Active search filters">{chips.map(key => <button key={key} type="button" className="filter-chip" onClick={() => updateFilters({ [key]: key.startsWith('min') || key.startsWith('max') ? '' : 'All' })}>{key === 'minLevel' ? `Level ${filters[key]}+` : `${key}: ${filters[key]}`} ×</button>)}</div>}
      {filtersOpen && <div className="global-search-filters"><ItemFilterControls prefix="global-search" facets={facets} filters={filters} onChange={updateFilters} /></div>}
      {data && <div className="search-result-counts" role="status">{groups.map(([key, group]) => `${sourceLabels[key] || key}: ${group.total || 0}`).join(' · ')}</div>}
      {busy && <div role="status">Searching…</div>}{error && <div className="search-error" role="alert">{error}</div>}{data?.errors?.length > 0 && <div className="search-error" role="status">Some sources could not be searched. Results from available sources are shown.</div>}{data && rows.length === 0 && <div role="status">No matching items</div>}
      <div id={listboxId} role="listbox" aria-label="Item search results">{groups.map(([key, group]) => <section className="global-search-group" key={key}><h3>{sourceLabels[key] || key} <span>{group.total || 0}</span></h3>{(group.results || []).map(result => <SearchOption key={JSON.stringify(result.identity)} id={`${listboxId}-option-${rows.indexOf(result)}`} result={result} results={rows} selected={rows[activeIndex] === result} onHover={() => setActiveIndex(rows.indexOf(result))} onSelect={() => select(result)} />)}</section>)}</div>
    </div>}
  </div>;
}
