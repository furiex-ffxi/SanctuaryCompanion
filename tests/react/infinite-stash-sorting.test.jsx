import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from '@testing-library/react';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { InfiniteStashPanel } from '../../src/components/InfiniteStashPanel.jsx';
import { InfiniteStashAdapter } from '../../src/adapters/InfiniteStashAdapter.js';

function props(overrides = {}) {
  return {
    vaultItems: [],
    vaultTotal: 0,
    vaultNextCursor: null,
    vaultFacets: { categories: ['Rings & Amulets'], slots: ['Ring'], sets: [] },
    vaultLoading: false,
    vaultError: null,
    onQuery: vi.fn(async () => {}),
    onLoadMore: vi.fn(),
    onRemove: vi.fn(),
    onRefresh: vi.fn(),
    onBackupTrigger: vi.fn(),
    isGameRunning: false,
    onWithdraw: vi.fn(),
    onWithdrawShared: vi.fn(),
    ...overrides,
  };
}

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('Infinite Stash sorting', () => {
  test('preserves HTTP status for rejected pagination cursors', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: false,
      status: 400,
      json: async () => ({ error: 'Invalid pagination cursor' }),
    })));

    await expect(InfiniteStashAdapter.list()).rejects.toMatchObject({
      message: 'Invalid pagination cursor',
      status: 400,
    });
  });

  test('queries with selected sorting, reverses direction, and resets list scrolling', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('requestAnimationFrame', (callback) => {
      callback();
      return 1;
    });
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
    const onQuery = vi.fn(async () => {});
    render(<InfiniteStashPanel {...props({
      onQuery,
      vaultTotal: 1,
      vaultItems: [{
        vaultId: 'one',
        stashedAt: '2026-01-01T00:00:00.000Z',
        sourceSave: 'Hero.d2s',
        itemData: { type: 'rin', type_name: 'Ring', quality: 2 },
      }],
    })} />);

    await act(() => vi.advanceTimersByTimeAsync(250));
    expect(onQuery).toHaveBeenLastCalledWith(expect.objectContaining({
      sort: 'dateAdded',
      direction: 'desc',
    }));

    const list = document.querySelector('.stash-list-body');
    list.scrollTop = 140;
    fireEvent.change(screen.getByLabelText('Sort by:'), { target: { value: 'name' } });
    await act(() => vi.advanceTimersByTimeAsync(250));
    expect(list.scrollTop).toBe(0);
    expect(onQuery).toHaveBeenLastCalledWith(expect.objectContaining({
      sort: 'name',
      direction: 'desc',
    }));

    list.scrollTop = 95;
    fireEvent.click(screen.getByRole('button', { name: 'Sort direction: Z\u2013A' }));
    await act(() => vi.advanceTimersByTimeAsync(250));
    expect(list.scrollTop).toBe(0);
    expect(onQuery).toHaveBeenLastCalledWith(expect.objectContaining({
      sort: 'name',
      direction: 'asc',
    }));
    expect(screen.getByRole('button', { name: 'Sort direction: A\u2013Z' })).toBeInTheDocument();
  });

  test('retains sorting when all filters are reset', async () => {
    vi.useFakeTimers();
    const onQuery = vi.fn(async () => {});
    render(<InfiniteStashPanel {...props({ onQuery, vaultTotal: 3 })} />);
    await act(() => vi.advanceTimersByTimeAsync(250));

    fireEvent.change(screen.getByLabelText('Sort by:'), { target: { value: 'rarity' } });
    fireEvent.click(screen.getByRole('button', { name: 'Sort direction: Highest' }));
    fireEvent.change(screen.getByLabelText('Category:'), { target: { value: 'Rings & Amulets' } });
    await act(() => vi.advanceTimersByTimeAsync(250));

    fireEvent.click(screen.getByRole('button', { name: 'Reset All Filters' }));
    await act(() => vi.advanceTimersByTimeAsync(250));
    expect(onQuery).toHaveBeenLastCalledWith(expect.objectContaining({
      category: 'All',
      sort: 'rarity',
      direction: 'asc',
    }));
    expect(screen.getByRole('button', { name: 'Sort direction: Lowest' })).toBeInTheDocument();
  });

  test('renders canonical rehydrated stat wording through the Infinite Stash tooltip path', async () => {
    render(<InfiniteStashPanel {...props({
      vaultTotal: 1,
      vaultItems: [{
        vaultId: 'legacy-rehydrated',
        stashedAt: '2026-01-01T00:00:00.000Z',
        sourceSave: 'Legacy.d2s',
        itemData: {
          type: 'rin',
          type_name: 'Ring',
          quality: 6,
          stat_display_version: 1,
          displayed_combined_magic_attributes: [{
            id: 57,
            values: [25, 50, 5],
            description: 'Adds 25-50 poison damage over 5 seconds',
          }],
        },
      }],
    })} />);

    fireEvent.mouseEnter(document.querySelector('.stash-item-row'), { clientX: 20, clientY: 20 });
    expect(await screen.findByText('Adds 25-50 poison damage over 5 seconds')).toBeInTheDocument();
    expect(screen.queryByText(/poisonmindam|%[+]d/i)).not.toBeInTheDocument();
  });
});
