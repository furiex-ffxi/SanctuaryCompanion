export function planItemSearchNavigation(result) {
  return {
    mainTab: result.sourceKind === 'infiniteStash' ? 'stash' : result.sourceKind === 'sharedStash' ? 'shared_stash' : 'character',
    subTab: result.navigation?.subTab || 'inventory',
    filename: result.filename || null,
    pageIndex: result.pageIndex ?? null,
    vaultId: result.vaultId || null,
    useAlternateWeapons: result.location === 'equipment' && [11, 12].includes(Number(result.position?.equippedId)),
    highlight: result.identity,
  };
}
export function itemIdentityMatches(identity, item, vaultId = null) {
  if (!identity) return false;
  if (identity.vaultId) return identity.vaultId === vaultId;
  return identity.itemSeed != null && String(identity.itemSeed) === String(item?.id ?? item?.item_seed);
}
export function createLatestRequestGate() {
  let latest = 0;
  return { issue: () => ++latest, isLatest: token => token === latest };
}
export function containsCanonicalItem(value, identity) {
  if (!value || typeof value !== 'object') return false;
  if ((value.id ?? value.item_seed) != null && String(value.id ?? value.item_seed) === String(identity?.itemSeed)) return true;
  return Object.values(value).some(child => containsCanonicalItem(child, identity));
}
