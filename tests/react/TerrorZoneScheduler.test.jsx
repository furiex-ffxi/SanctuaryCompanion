import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from './test-utils';
import { cleanup } from '@testing-library/react';
import { TerrorZoneScheduler } from '../../src/components/TerrorZoneScheduler';
import React from 'react';

const mockSchedule = [
  { datetime: new Date(Date.now() - 3600000).toISOString(), zone: { enUS: 'Past Zone' } },
  { datetime: new Date(Date.now() + 3600000).toISOString(), zone: { enUS: 'Future Zone' } },
  { datetime: new Date(Date.now() + 7200000).toISOString(), zone: { enUS: 'Future Zone 2' } }
];

describe('TerrorZoneScheduler', () => {
  const addToastMock = vi.fn();

  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    global.fetch = vi.fn((url) => {
      if (url.includes('tz-2023-localized.json')) {
        return Promise.resolve({
          json: () => Promise.resolve(mockSchedule)
        });
      }
      return Promise.resolve({
        json: () => Promise.resolve({ success: true })
      });
    });
  });

  it('renders and fetches schedule', async () => {
    render(<TerrorZoneScheduler onClose={() => {}} addToast={addToastMock} />);
    
    await waitFor(() => {
      expect(screen.getByText('Past Zone')).toBeInTheDocument();
    });
    expect(screen.getByText('Future Zone')).toBeInTheDocument();
  });

  it('jumps to next zone safely', async () => {
    render(<TerrorZoneScheduler onClose={() => {}} addToast={addToastMock} />);
    
    await waitFor(() => {
      expect(screen.getByText('Future Zone')).toBeInTheDocument();
    });

    const select = screen.getByRole('combobox');
    fireEvent.change(select, { target: { value: 'Future Zone' } });

    const jumpBtn = screen.getByText('Jump to Zone');
    fireEvent.click(jumpBtn);

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith('/__d2r_set_time', expect.objectContaining({
        method: 'POST',
        body: expect.stringContaining(mockSchedule[1].datetime)
      }));
    });

    expect(localStorage.getItem('tz_max_time')).toBe(new Date(mockSchedule[1].datetime).getTime().toString());
  });

  it('prevents jumping backwards in time', async () => {
    // Set simulated future time 1.5 hours ahead
    const futureTime = Date.now() + 5400000;
    localStorage.setItem('tz_max_time', futureTime.toString());

    render(<TerrorZoneScheduler onClose={() => {}} addToast={addToastMock} />);
    
    await waitFor(() => {
      expect(screen.getByText('Future Zone')).toBeInTheDocument();
    });

    const select = screen.getByRole('combobox');
    fireEvent.change(select, { target: { value: 'Future Zone' } }); // This zone is only 1 hr ahead (before futureTime)

    const jumpBtn = screen.getByText('Jump to Zone');
    fireEvent.click(jumpBtn);

    await waitFor(() => {
      // It should NOT pick the one 1 hr ahead because max_time is 1.5 hrs ahead. 
      // It should error because there is no 'Future Zone' after 1.5 hrs ahead in mock data
      expect(addToastMock).toHaveBeenCalledWith('No future occurrences of this zone found after the latest simulated time.', 'error');
    });
  });

  it('restores time safely', async () => {
    localStorage.setItem('tz_max_time', '9999999999999');

    render(<TerrorZoneScheduler onClose={() => {}} addToast={addToastMock} />);
    
    const restoreHelpBtn = screen.getByText('How to restore time');
    fireEvent.click(restoreHelpBtn);

    const restoreBtn = screen.getByText('Restore Windows Clock to Present');
    fireEvent.click(restoreBtn);

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith('/__d2r_set_time', expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ restore: true })
      }));
    });

    expect(localStorage.getItem('tz_max_time')).toBeNull();
  });
});
