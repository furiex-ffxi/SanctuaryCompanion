export const SyncAdapter = {
  async status() {
    const res = await fetch('/__sync/status')
    if (!res.ok) throw new Error(`Failed to get sync status (${res.status})`)
    return res.json()
  },

  async preview() {
    const res = await fetch('/__sync/preview')
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      throw new Error(data.error || `Failed to get sync preview (${res.status})`)
    }
    return res.json()
  },

  async syncNow(selectedFiles = null, resolutions = null) {
    const payload = {}
    if (selectedFiles) payload.selectedFiles = selectedFiles
    if (resolutions) payload.resolutions = resolutions
    const hasBody = Boolean(selectedFiles || resolutions)
    const options = {
      method: 'POST',
      headers: hasBody ? { 'Content-Type': 'application/json' } : {},
      body: hasBody ? JSON.stringify(payload) : undefined,
    }
    const res = await fetch('/__sync/now', options)
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
