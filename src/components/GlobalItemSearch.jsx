import React, { useEffect, useId, useRef, useState } from 'react';

export function GlobalItemSearch({
  sharedFile = 'ModernSharedStashSoftCoreV2.d2i',
  onSelect,
}) {
  const [q, setQ] = useState('');
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [active, setActive] = useState(0);
  const seq = useRef(0);
  const listboxId = useId();
  const trimmedQuery = q.trim();
  const open = trimmedQuery.length >= 2;
  const queryKey = `${sharedFile}\0${trimmedQuery}`;
  const currentData = data?.key === queryKey ? data.body : null;
  const rows = currentData
    ? Object.values(currentData.groups).flatMap(group => group.results)
    : [];
  const activeOptionId = rows.length
    ? `${listboxId}-option-${active}`
    : undefined;

  useEffect(() => {
    const id = ++seq.current;
    let disposed = false;
    setData(null);
    setError('');
    setBusy(false);

    if (!open) return;

    const controller = new AbortController();
    const timer = setTimeout(async () => {
      if (disposed || seq.current !== id) return;
      setBusy(true);
      try {
        const params = new URLSearchParams({
          q: trimmedQuery,
          sharedFile,
          limit: '10',
        });
        const response = await fetch(`/__item_search?${params}`, {
          signal: controller.signal,
        });
        if (disposed || seq.current !== id) return;
        const body = await response.json();
        if (!response.ok) throw Error(body.error);
        if (!disposed && seq.current === id) {
          setData({ key: queryKey, body });
          setActive(0);
        }
      } catch (requestError) {
        if (
          requestError.name !== 'AbortError'
          && !disposed
          && seq.current === id
        ) {
          setError(requestError.message);
        }
      } finally {
        if (!disposed && seq.current === id) setBusy(false);
      }
    }, 250);

    return () => {
      disposed = true;
      clearTimeout(timer);
      controller.abort();
    };
  }, [open, q, queryKey, sharedFile, trimmedQuery]);

  const close = () => {
    seq.current++;
    setQ('');
    setData(null);
    setError('');
    setBusy(false);
    setActive(0);
  };

  const change = event => {
    seq.current++;
    setQ(event.target.value);
    setData(null);
    setError('');
    setBusy(false);
    setActive(0);
  };

  const pick = result => {
    onSelect(result);
    close();
  };

  const key = event => {
    if (event.key === 'Escape') {
      event.preventDefault();
      close();
      return;
    }
    if (!rows.length) return;
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActive((active + 1) % rows.length);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActive((active - 1 + rows.length) % rows.length);
    } else if (event.key === 'Enter') {
      event.preventDefault();
      pick(rows[active]);
    }
  };

  return (
    <div className="global-item-search">
      <input
        className="header-control global-search-input"
        aria-label="Search all items"
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={open}
        aria-controls={open ? listboxId : undefined}
        aria-activedescendant={open ? activeOptionId : undefined}
        placeholder="Search all items…"
        value={q}
        onChange={change}
        onKeyDown={key}
      />
      {open && (
        <div className="global-search-menu">
          {busy && <div role="status">Searching…</div>}
          {error && (
            <div className="search-error" role="alert">
              {error}
            </div>
          )}
          {currentData && rows.length === 0 && (
            <div role="status">No matching items</div>
          )}
          <div
            id={listboxId}
            role="listbox"
            aria-label="Item search results"
          >
            {rows.map((result, index) => (
              <div
                id={`${listboxId}-option-${index}`}
                key={JSON.stringify(result.identity)}
                className={`global-search-option ${index === active ? 'active' : ''}`}
                role="option"
                aria-selected={index === active}
                onMouseEnter={() => setActive(index)}
                onMouseDown={event => event.preventDefault()}
                onClick={() => pick(result)}
                title={`${result.preview.typeName || ''} — ${result.location}`}
              >
                <span>
                  {result.preview.displayName}
                  {result.preview.socketCount > 0
                    ? ` (${result.preview.socketCount} sockets)`
                    : ''}
                </span>
                <small className="search-match-reason">
                  {result.match.field}: {result.match.text}
                </small>
                <small>
                  {result.sourceKind === 'character'
                    ? 'Character'
                    : result.sourceKind === 'sharedStash'
                      ? 'Shared Stash'
                      : 'Infinite Stash'}
                  {' · '}
                  {result.characterName || result.filename}
                  {' · '}
                  {result.location}
                  {result.pageIndex != null ? ` · Tab ${result.pageIndex + 1}` : ''}
                </small>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
