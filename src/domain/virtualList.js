export function getVirtualRange(itemCount, scrollTop, viewportHeight, rowHeight = 86, overscan = 8) {
  const count = Math.max(0, Number(itemCount) || 0)
  if (!count) return { start: 0, end: 0 }
  const requestedStart = Math.max(0, Math.floor(Math.max(0, scrollTop) / rowHeight) - overscan)
  const start = Math.min(requestedStart, count - 1)
  const end = Math.min(count, Math.ceil((Math.max(0, scrollTop) + Math.max(0, viewportHeight)) / rowHeight) + overscan)
  return { start, end: Math.max(start, end) }
}