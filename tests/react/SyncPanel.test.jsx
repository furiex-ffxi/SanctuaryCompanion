import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from './test-utils.jsx'
import { SyncPanel } from '../../src/components/SyncPanel.jsx'
import { SyncAdapter } from '../../src/adapters/SyncAdapter.js'

describe('SyncPanel Component', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('renders nothing when not in client mode', async () => {
    vi.spyOn(SyncAdapter, 'status').mockResolvedValue({
      isClient: false,
      isHost: true,
      machineId: 'desktop-host',
    })

    const { container } = render(<SyncPanel />)

    // Wait for query to settle
    await waitFor(() => {
      expect(SyncAdapter.status).toHaveBeenCalled()
    })

    expect(container.firstChild).toBeNull()
  })

  it('renders host disconnected state with disabled Sync Now button', async () => {
    vi.spyOn(SyncAdapter, 'status').mockResolvedValue({
      isClient: true,
      isHost: false,
      syncUrl: 'http://192.168.1.100:5173',
      machineId: 'laptop',
      host: { connected: false, error: 'Failed to connect' },
    })

    render(<SyncPanel />)

    await waitFor(() => {
      expect(screen.getByText('Host unreachable')).toBeInTheDocument()
    })

    const syncButton = screen.getByRole('button', { name: /Sync Now/i })
    expect(syncButton).toBeDisabled()
  })

  it('renders host connected state and triggers sync when clicked', async () => {
    vi.spyOn(SyncAdapter, 'status').mockResolvedValue({
      isClient: true,
      isHost: false,
      syncUrl: 'http://192.168.1.100:5173',
      machineId: 'laptop',
      host: { connected: true, hostMachineId: 'my-desktop', fileCount: 4 },
    })

    vi.spyOn(SyncAdapter, 'syncNow').mockResolvedValue({
      pulled: ['Necro.d2s'],
      pushed: ['Paladin.d2s'],
      conflicts: [],
      inSync: ['Barb.d2s'],
      errors: [],
      timestamp: new Date().toISOString(),
    })

    render(<SyncPanel />)

    await waitFor(() => {
      expect(screen.getByText('Host: my-desktop')).toBeInTheDocument()
    })

    const syncButton = screen.getByRole('button', { name: /Sync Now/i })
    expect(syncButton).not.toBeDisabled()

    fireEvent.click(syncButton)

    await waitFor(() => {
      expect(SyncAdapter.syncNow).toHaveBeenCalledTimes(1)
      expect(screen.getByText('↓1')).toBeInTheDocument()
      expect(screen.getByText('↑1')).toBeInTheDocument()
    })
  })
})
