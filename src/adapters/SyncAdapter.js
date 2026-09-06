export const SyncAdapter = {
  async status() {
    const res = await fetch('/__sync/status')
    if (!res.ok) throw new Error(`Failed to get sync status (${res.status})`)
    return res.json()
  },

  async syncNow() {
    const res = await fetch('/__sync/now', { method: 'POST' })
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      throw new Error(data.error || `Sync failed (${res.status})`)
    }
    return res.json()
  },

  async manifest() {
    const res = await fetch('/__sync/manifest')
    if (!res.ok) throw new Error(`Failed to get manifest (${res.status})`)
    return res.json()
  },
}
