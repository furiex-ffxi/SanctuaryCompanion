export function resolveItemImageKey(code, itemImageKey, metadataImageKey) {
  const normalizedCode = (code || '').trim().toLowerCase();
  if (/^xa[1-5]$/.test(normalizedCode)) return metadataImageKey || 'none';
  return itemImageKey || metadataImageKey || 'none';
}