import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from '../../tests/react/test-utils.jsx';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { GlobalItemSearch } from '../../src/components/GlobalItemSearch.jsx';

function result(...displayNames) {
  return {
    groups: {
      characters: {
        results: displayNames.map(displayName => ({
          identity: { itemSeed: displayName },
          preview: {
            displayName,
            typeName: 'Test item',
            socketCount: 0,
            item: {
              type: 'rin',
              type_name: displayName,
              displayed_combined_magic_attributes: [{ id: 39, values: [displayName.length] }],
            },
          },
          match: { field: 'name', text: displayName },
          sourceKind: 'character',
          characterName: 'TestHero',
          filename: 'TestHero.d2s',
          location: 'inventory',
        })),
      },
    },
  };
}

function deferredResponse(body) {
  let resolve;
  const json = vi.fn(async () => body);
  const promise = new Promise(done => {
    resolve = () => done({ ok: true, json });
  });
  return { promise, resolve, json };
}

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('GlobalItemSearch', () => {
  test('clears prior results as soon as the query changes', async () => {
    vi.useFakeTimers();
    const skull = deferredResponse(result('Perfect Skull'));
    vi.stubGlobal('fetch', vi.fn().mockReturnValue(skull.promise));

    render(<GlobalItemSearch onSelect={vi.fn()} />);
    const input = screen.getByRole('combobox', { name: 'Search all items' });

    fireEvent.change(input, { target: { value: 'skull' } });
    await act(() => vi.advanceTimersByTimeAsync(250));
    await act(async () => skull.resolve());
    expect(screen.getByText('Perfect Skull')).toBeInTheDocument();

    fireEvent.change(input, { target: { value: 'skull der' } });
    expect(screen.queryByText('Perfect Skull')).not.toBeInTheDocument();
  });

  test('reissues a search when only query whitespace changes', async () => {
    vi.useFakeTimers();
    const first = deferredResponse(result('Perfect Skull'));
    const second = deferredResponse(result('Perfect Skull'));
    const fetchMock = vi.fn()
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);
    vi.stubGlobal('fetch', fetchMock);

    render(<GlobalItemSearch onSelect={vi.fn()} />);
    const input = screen.getByRole('combobox', { name: 'Search all items' });
    fireEvent.change(input, { target: { value: 'skull' } });
    await act(() => vi.advanceTimersByTimeAsync(250));
    await act(async () => first.resolve());

    fireEvent.change(input, { target: { value: 'skull ' } });
    expect(screen.queryByText('Perfect Skull')).not.toBeInTheDocument();
    await act(() => vi.advanceTimersByTimeAsync(250));
    await act(async () => second.resolve());

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(screen.getByText('Perfect Skull')).toBeInTheDocument();
  });

  test('ignores a stale response that finishes after the query changes', async () => {
    vi.useFakeTimers();
    const skull = deferredResponse(result('Perfect Skull'));
    const fullQuery = deferredResponse(result());
    const fetchMock = vi.fn()
      .mockReturnValueOnce(skull.promise)
      .mockReturnValueOnce(fullQuery.promise);
    vi.stubGlobal('fetch', fetchMock);

    render(<GlobalItemSearch onSelect={vi.fn()} />);
    const input = screen.getByRole('combobox', { name: 'Search all items' });

    fireEvent.change(input, { target: { value: 'skull' } });
    await act(() => vi.advanceTimersByTimeAsync(250));
    fireEvent.change(input, { target: { value: 'skull der' } });

    await act(async () => skull.resolve());
    expect(skull.json).not.toHaveBeenCalled();
    expect(screen.queryByText('Perfect Skull')).not.toBeInTheDocument();

    await act(() => vi.advanceTimersByTimeAsync(250));
    await act(async () => fullQuery.resolve());
    expect(fetchMock.mock.calls[1][0]).toContain('q=skull+der');
    expect(screen.getByText('No matching items')).toBeInTheDocument();
  });

  test('exposes combobox, listbox, active option, and live status semantics', async () => {
    vi.useFakeTimers();
    const response = deferredResponse(result('Perfect Skull', 'Flawless Skull'));
    const onSelect = vi.fn();
    vi.stubGlobal('fetch', vi.fn().mockReturnValue(response.promise));

    render(<GlobalItemSearch onSelect={onSelect} />);
    const input = screen.getByRole('combobox', { name: 'Search all items' });
    expect(input).toHaveAttribute('aria-expanded', 'false');

    fireEvent.change(input, { target: { value: 'skull' } });
    const listbox = screen.getByRole('listbox', { name: 'Item search results' });
    expect(input).toHaveAttribute('aria-expanded', 'true');
    expect(input).toHaveAttribute('aria-controls', listbox.id);

    await act(() => vi.advanceTimersByTimeAsync(250));
    expect(screen.getByRole('status')).toHaveTextContent('Searching');
    await act(async () => response.resolve());

    const options = screen.getAllByRole('option');
    expect(options).toHaveLength(2);
    expect(options[0]).toHaveAttribute('aria-selected', 'true');
    expect(input).toHaveAttribute('aria-activedescendant', options[0].id);

    fireEvent.keyDown(input, { key: 'ArrowDown' });
    expect(options[1]).toHaveAttribute('aria-selected', 'true');
    expect(input).toHaveAttribute('aria-activedescendant', options[1].id);

    fireEvent.click(options[1]);
    expect(onSelect).toHaveBeenCalledWith(
      expect.objectContaining({
        preview: expect.objectContaining({ displayName: 'Flawless Skull' }),
      }),
    );
    expect(input).toHaveValue('');
  });

  test('Escape closes and invalidates a search before results exist', async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    render(<GlobalItemSearch onSelect={vi.fn()} />);
    const input = screen.getByRole('combobox', { name: 'Search all items' });

    fireEvent.change(input, { target: { value: 'skull' } });
    expect(screen.getByRole('listbox')).toBeInTheDocument();
    fireEvent.keyDown(input, { key: 'Escape' });

    expect(input).toHaveValue('');
    expect(input).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    await act(() => vi.advanceTimersByTimeAsync(250));
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test('does not process an abort-insensitive response after unmount', async () => {
    vi.useFakeTimers();
    const response = deferredResponse(result('Perfect Skull'));
    const fetchMock = vi.fn().mockReturnValue(response.promise);
    vi.stubGlobal('fetch', fetchMock);

    const view = render(<GlobalItemSearch onSelect={vi.fn()} />);
    fireEvent.change(
      screen.getByRole('combobox', { name: 'Search all items' }),
      { target: { value: 'skull' } },
    );
    await act(() => vi.advanceTimersByTimeAsync(250));
    const signal = fetchMock.mock.calls[0][1].signal;

    view.unmount();
    expect(signal.aborted).toBe(true);
    await act(async () => response.resolve());
    expect(response.json).not.toHaveBeenCalled();
  });

  test('hides and rejects results from a previously selected shared stash', async () => {
    vi.useFakeTimers();
    const oldSource = deferredResponse(result('Old Stash Skull'));
    const newSource = deferredResponse(result('New Stash Skull'));
    const fetchMock = vi.fn()
      .mockReturnValueOnce(oldSource.promise)
      .mockReturnValueOnce(newSource.promise);
    vi.stubGlobal('fetch', fetchMock);

    const view = render(
      <GlobalItemSearch sharedFile="Old.d2i" onSelect={vi.fn()} />,
    );
    const input = screen.getByRole('combobox', { name: 'Search all items' });
    fireEvent.change(input, { target: { value: 'skull' } });
    await act(() => vi.advanceTimersByTimeAsync(250));

    view.rerender(
      <GlobalItemSearch sharedFile="New.d2i" onSelect={vi.fn()} />,
    );
    await act(async () => oldSource.resolve());
    expect(oldSource.json).not.toHaveBeenCalled();
    expect(screen.queryByText('Old Stash Skull')).not.toBeInTheDocument();

    await act(() => vi.advanceTimersByTimeAsync(250));
    await act(async () => newSource.resolve());
    expect(fetchMock.mock.calls[1][0]).toContain('sharedFile=New.d2i');
    expect(screen.getByText('New Stash Skull')).toBeInTheDocument();
  });

  test('shows comparison summaries and a detailed tooltip for search results', async () => {
    vi.useFakeTimers();
    const response = deferredResponse(result('Short Ring', 'Longest Ring'));
    vi.stubGlobal('fetch', vi.fn().mockReturnValue(response.promise));

    render(<GlobalItemSearch onSelect={vi.fn()} />);
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'ring' } });
    await act(() => vi.advanceTimersByTimeAsync(250));
    await act(async () => response.resolve());

    expect(screen.getAllByText('1/1 best')).toHaveLength(1);
    expect(screen.getAllByText('0/1 best')).toHaveLength(1);
    fireEvent.mouseEnter(screen.getAllByRole('option')[1], { clientX: 20, clientY: 20 });
    expect(screen.getByText('Best of 2 matches')).toBeInTheDocument();
  });
});

