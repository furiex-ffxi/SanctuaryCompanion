import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from './test-utils.jsx'
import { SyncPanel } from '../../src/components/SyncPanel.jsx'
import { SyncAdapter } from '../../src/adapters/SyncAdapter.js'
import { useUIStore } from '../../src/stores/useUIStore.js'

describe('SyncPanel Component', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    useUIStore.setState({ autoSyncOnExit: true })
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
      expect(screen.getByText(/Host unreachable/i)).toBeInTheDocument()
    })

    const syncButton = screen.getByRole('button', { name: /Sync Now/i })
    expect(syncButton).toBeDisabled()
  })

  it('disables Sync Now and Diff buttons when Diablo II Resurrected is running', async () => {
    vi.spyOn(SyncAdapter, 'status').mockResolvedValue({
      isClient: true,
      isHost: false,
      syncUrl: 'http://192.168.1.100:5173',
      machineId: 'laptop',
      host: { connected: true, hostMachineId: 'my-desktop', fileCount: 4 },
    })

    render(<SyncPanel isGameRunning={true} />)

    await waitFor(() => {
      expect(screen.getByText('Host: my-desktop')).toBeInTheDocument()
    })

    const syncButton = screen.getByRole('button', { name: /Sync Now/i })
    const diffButton = screen.getByRole('button', { name: /Diff/i })

    expect(syncButton).toBeDisabled()
    expect(diffButton).toBeDisabled()
    expect(syncButton).toHaveAttribute('title', 'Cannot sync while Diablo II: Resurrected is running')
    expect(diffButton).toHaveAttribute('title', 'Cannot diff while Diablo II: Resurrected is running')
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

  it('automatically syncs when D2R transitions from running to stopped', async () => {
    vi.spyOn(SyncAdapter, 'status').mockResolvedValue({
      isClient: true,
      isHost: false,
      syncUrl: 'http://192.168.1.100:5173',
      machineId: 'laptop',
      host: { connected: true, hostMachineId: 'my-desktop', fileCount: 4 },
    })

    const syncNowSpy = vi.spyOn(SyncAdapter, 'syncNow').mockResolvedValue({
      pulled: ['Necro.d2s'],
      pushed: [],
      conflicts: [],
      inSync: [],
      errors: [],
      timestamp: new Date().toISOString(),
    })

    const onSyncComplete = vi.fn()

    // Initially D2R is running
    const { rerender } = render(<SyncPanel isGameRunning={true} onSyncComplete={onSyncComplete} />)

    await waitFor(() => {
      expect(screen.getByText('Host: my-desktop')).toBeInTheDocument()
    })

    expect(syncNowSpy).not.toHaveBeenCalled()

    // D2R exits!
    rerender(<SyncPanel isGameRunning={false} onSyncComplete={onSyncComplete} />)

    await waitFor(() => {
      expect(syncNowSpy).toHaveBeenCalledTimes(1)
      expect(onSyncComplete).toHaveBeenCalledTimes(1)
    })
  })

  it('does not auto-sync on D2R exit when auto-sync is toggled off', async () => {
    vi.spyOn(SyncAdapter, 'status').mockResolvedValue({
      isClient: true,
      isHost: false,
      syncUrl: 'http://192.168.1.100:5173',
      machineId: 'laptop',
      host: { connected: true, hostMachineId: 'my-desktop', fileCount: 4 },
    })

    const syncNowSpy = vi.spyOn(SyncAdapter, 'syncNow').mockResolvedValue({
      pulled: ['Necro.d2s'],
      pushed: [],
      conflicts: [],
      inSync: [],
      errors: [],
      timestamp: new Date().toISOString(),
    })

    const { rerender } = render(<SyncPanel isGameRunning={true} />)

    await waitFor(() => {
      expect(screen.getByText('Host: my-desktop')).toBeInTheDocument()
    })

    // Uncheck auto-sync toggle
    const autoCheckbox = screen.getByRole('checkbox', { name: /Auto/i })
    expect(autoCheckbox).toBeChecked()
    fireEvent.click(autoCheckbox)
    expect(autoCheckbox).not.toBeChecked()

    // D2R exits
    rerender(<SyncPanel isGameRunning={false} />)

    // Should NOT have triggered sync
    expect(syncNowSpy).not.toHaveBeenCalled()
  })
})
