async function parseResponse(response) {
  const data = await response.json().catch(() => ({}))
  if (!response.ok) {
    const error = new Error(data.error || 'Vault request failed (' + response.status + ')')
    error.status = response.status
    throw error
  }
  return data
}

export const InfiniteStashAdapter = {
  async list(filters = {}, { cursor = null, limit = 100, sort = filters.sort, direction = filters.direction } = {}) {
    const params = new URLSearchParams({ limit: String(limit) })
    if (cursor) params.set('cursor', cursor)
    if (filters.q?.trim()) params.set('q', filters.q.trim())
    if (filters.slot && filters.slot !== 'All') params.set('slot', filters.slot)
    if (filters.category && filters.category !== 'All') params.set('category', filters.category)
    if (filters.setName && filters.setName !== 'All') params.set('set', filters.setName)
    if (filters.quality && filters.quality !== 'All') params.set('quality', filters.quality)
    if (filters.minLevel != null) params.set('minLevel', filters.minLevel)
    if (filters.maxLevel != null) params.set('maxLevel', filters.maxLevel)
    if (filters.status && filters.status !== 'active') params.set('status', filters.status)
    params.set('sort', sort || 'dateAdded')
    params.set('direction', direction || 'desc')
    return parseResponse(await fetch(`/__vault/items?${params}`))
  },
  async count() { return parseResponse(await fetch('/__vault/count')) },
  async facets() { return parseResponse(await fetch('/__vault/facets')) },
  async add(entry) {
    return parseResponse(await fetch('/__vault/items', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(entry) }))
  },
  async update(entry) {
    return parseResponse(await fetch('/__vault/items', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(entry) }))
  },
  async markPendingWithdraw(vaultId, reason = 'withdraw') {
    return parseResponse(await fetch(`/__vault/items/${encodeURIComponent(vaultId)}/intent?reason=${encodeURIComponent(reason)}`, { method: 'POST' }))
  },
  async recover(vaultId) {
    return parseResponse(await fetch(`/__vault/items/${encodeURIComponent(vaultId)}/recover`, { method: 'POST' }))
  },
  async remove(vaultId, reason = 'delete') {
    return parseResponse(await fetch(`/__vault/items/${encodeURIComponent(vaultId)}?reason=${encodeURIComponent(reason)}`, { method: 'DELETE' }))
  },
  async import(entries) {
    return parseResponse(await fetch('/__vault/import', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(entries) }))
  },
  async export() {
    const response = await fetch('/__vault/export')
    if (!response.ok) return parseResponse(response)
    const blob = await response.blob()
    const disposition = response.headers.get('Content-Disposition') || ''
    const filename = disposition.match(/filename="([^"]+)"/)?.[1] || 'sanctuary_infinite_stash.json'
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = filename
    document.body.appendChild(anchor)
    anchor.click()
    anchor.remove()
    URL.revokeObjectURL(url)
  },
}
