import React, { StrictMode } from 'react';
import { act, cleanup, render, renderHook, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, test, vi } from 'vitest';
import App from '../../src/App.jsx';
import { InfiniteStashAdapter } from '../../src/adapters/InfiniteStashAdapter.js';
import { D2SParserAdapter } from '../../src/adapters/D2SParserAdapter.js';
import { useCharacterCompanion } from '../../src/hooks/useCharacterCompanion.js';

function deferred() {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
}

function mockMountedDependencies() {
  vi.spyOn(InfiniteStashAdapter, 'facets').mockResolvedValue({ slots: [], sets: [], categories: [] });
  vi.spyOn(InfiniteStashAdapter, 'list').mockResolvedValue({ items: [], total: 0, nextCursor: null });
  vi.spyOn(D2SParserAdapter, 'fetchList').mockResolvedValue([]);
  vi.spyOn(D2SParserAdapter, 'fetchSharedStash').mockResolvedValue({ pages: [] });
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false })));
}

afterEach(() => {
  cleanup();
  window.history.replaceState(null, '', '/');
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('Infinite Stash count refresh', () => {
  test('renders the global vault count after refreshing the inventory hash route', async () => {
    window.history.replaceState(null, '', '#inventory');
    vi.spyOn(InfiniteStashAdapter, 'count').mockResolvedValue({ total: 119 });
    mockMountedDependencies();

    render(<App />);

    expect(await screen.findByRole('button', { name: 'Infinite Stash (119)' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Inventory' })).toHaveClass('active');
    expect(InfiniteStashAdapter.list).not.toHaveBeenCalled();
  });

  test('keeps the global count separate from a filtered matching total', async () => {
    vi.spyOn(InfiniteStashAdapter, 'count').mockResolvedValue({ total: 119 });
    mockMountedDependencies();
    const { result } = renderHook(() => useCharacterCompanion());
    await waitFor(() => expect(result.current.vaultCount).toBe(119));

    await act(() => result.current.queryVault({ q: 'missing item' }));

    expect(result.current.vaultTotal).toBe(0);
    expect(result.current.vaultCount).toBe(119);
  });

  test('ignores the stale first count response during a StrictMode remount', async () => {
    const stale = deferred();
    vi.spyOn(InfiniteStashAdapter, 'count')
      .mockReturnValueOnce(stale.promise)
      .mockResolvedValueOnce({ total: 119 });
    mockMountedDependencies();

    const { result } = renderHook(() => useCharacterCompanion(), { wrapper: StrictMode });
    await waitFor(() => expect(result.current.vaultCount).toBe(119));

    await act(async () => stale.resolve({ total: 0 }));
    expect(result.current.vaultCount).toBe(119);
  });

  test('shows an unknown badge instead of zero when the count request fails', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(InfiniteStashAdapter, 'count').mockRejectedValue(new Error('count unavailable'));
    mockMountedDependencies();

    render(<App />);

    const badge = await screen.findByRole('button', { name: 'Infinite Stash (?)' });
    expect(badge).toHaveAttribute('title', expect.stringContaining('count unavailable'));
  });
});
