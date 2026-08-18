import React, { useId, useState } from 'react';
import { useGlobalItemSearchResults } from '../hooks/useGlobalItemSearchResults.js';

const sourceLabel = sourceKind => ({
  character: 'Character',
  sharedStash: 'Shared Stash',
}[sourceKind] || 'Infinite Stash');

function SearchOption({ id, result, selected, onHover, onSelect }) {
  const sockets = result.preview.socketCount > 0
    ? ' (' + result.preview.socketCount + ' sockets)'
    : '';
  const tab = result.pageIndex != null
    ? ' · Tab ' + (result.pageIndex + 1)
    : '';

  return (
    <div
      id={id}
      className={'global-search-option' + (selected ? ' active' : '')}
      role="option"
      aria-selected={selected}
      onMouseEnter={onHover}
      onMouseDown={event => event.preventDefault()}
      onClick={onSelect}
      title={(result.preview.typeName || '') + ' — ' + result.location}
    >
      <span>{result.preview.displayName}{sockets}</span>
      <small className="search-match-reason">
        {result.match.field}: {result.match.text}
      </small>
      <small>
        {sourceLabel(result.sourceKind)}
        {' · '}
        {result.characterName || result.filename}
        {' · '}
        {result.location}
        {tab}
      </small>
    </div>
  );
}

export function GlobalItemSearch({
  sharedFile = 'ModernSharedStashSoftCoreV2.d2i',
  onSelect,
}) {
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const listboxId = useId();
  const open = query.trim().length >= 2;
  const { data, busy, error } = useGlobalItemSearchResults(query, sharedFile);
  const rows = data
    ? Object.values(data.groups).flatMap(group => group.results)
    : [];

  const close = () => {
    setQuery('');
    setActiveIndex(0);
  };

  const select = result => {
    onSelect(result);
    close();
  };

  const handleChange = event => {
    setQuery(event.target.value);
    setActiveIndex(0);
  };

  const handleKeyDown = event => {
    if (event.key === 'Escape') {
      event.preventDefault();
      close();
      return;
    }
    if (!rows.length) return;

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActiveIndex((activeIndex + 1) % rows.length);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveIndex((activeIndex - 1 + rows.length) % rows.length);
    } else if (event.key === 'Enter') {
      event.preventDefault();
      select(rows[activeIndex]);
    }
  };

  const activeOptionId = open && rows.length
    ? listboxId + '-option-' + activeIndex
    : undefined;

  return (
    <div className="global-item-search">
      <input
        className="header-control global-search-input"
        aria-label="Search all items"
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={open}
        aria-controls={open ? listboxId : undefined}
        aria-activedescendant={activeOptionId}
        placeholder="Search all items…"
        value={query}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
      />
      {open && (
        <div className="global-search-menu">
          {busy && <div role="status">Searching…</div>}
          {error && (
            <div className="search-error" role="alert">
              {error}
            </div>
          )}
          {data && rows.length === 0 && (
            <div role="status">No matching items</div>
          )}
          <div
            id={listboxId}
            role="listbox"
            aria-label="Item search results"
          >
            {rows.map((result, index) => (
              <SearchOption
                key={JSON.stringify(result.identity)}
                id={listboxId + '-option-' + index}
                result={result}
                selected={index === activeIndex}
                onHover={() => setActiveIndex(index)}
                onSelect={() => select(result)}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
