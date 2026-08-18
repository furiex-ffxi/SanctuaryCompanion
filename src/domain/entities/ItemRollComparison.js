const ATTRIBUTE_SOURCES = [
  'displayed_combined_magic_attributes',
  'displayed_magic_attributes',
  'combined_magic_attributes',
  'magic_attributes',
];

export function getVisibleItemAttributes(item = {}) {
  const attributes = ATTRIBUTE_SOURCES.map(key => item[key]).find(Array.isArray) || [];
  return attributes.filter(attribute => attribute?.visible !== false);
}

function statKey(attribute = {}) {
  const id = attribute.id ?? attribute.name;
  if (id == null) return null;
  return [String(id), attribute.layer ?? '', attribute.skill_tab_name ?? ''].join(':');
}

function scalarValue(attribute = {}) {
  if (!Array.isArray(attribute.values) || attribute.values.length !== 1) return null;
  const value = Number(attribute.values[0]);
  return Number.isFinite(value) ? value : null;
}

function numericRange(attribute = {}) {
  const candidates = [attribute.roll_range, attribute.rollRange, attribute.range, attribute.value_range,
    [attribute.roll_min, attribute.roll_max], [attribute.min_value, attribute.max_value], [attribute.min, attribute.max]];
  for (const candidate of candidates) {
    const pair = Array.isArray(candidate) ? candidate : candidate && [candidate.min, candidate.max];
    if (!pair || pair.length < 2) continue;
    const min = Number(pair[0]);
    const max = Number(pair[1]);
    if (Number.isFinite(min) && Number.isFinite(max) && min <= max) return { min, max };
  }
  return null;
}

function lowerIsBetter(attribute = {}) {
  const id = Number(attribute.id);
  const name = String(attribute.name || '').toLowerCase().replaceAll('_', '');
  return [91, 92, 333, 334, 335, 336].includes(id)
    || name === 'itemlevelreq'
    || name.includes('levelrequirement')
    || (name.includes('enemy') && name.includes('resist'));
}

export function getRollRange(attribute) {
  const value = scalarValue(attribute);
  const range = numericRange(attribute);
  if (value == null || !range) return null;
  const span = range.max - range.min;
  const progress = span === 0 ? 100 : (lowerIsBetter(attribute) ? range.max - value : value - range.min) / span * 100;
  return { ...range, value, percent: Math.max(0, Math.min(100, Math.round(progress))) };
}

export function compareItemStat(attribute, peerItems = []) {
  const key = statKey(attribute);
  const value = scalarValue(attribute);
  if (!key || value == null) return null;
  const values = peerItems.flatMap(item => getVisibleItemAttributes(item)
    .filter(peer => statKey(peer) === key).map(scalarValue).filter(peerValue => peerValue != null));
  if (values.length < 2) return null;
  const best = lowerIsBetter(attribute) ? Math.min(...values) : Math.max(...values);
  return { value, best, compared: values.length, isBest: value === best, difference: Math.abs(best - value) };
}

export function summarizeItemComparison(item, peerItems = []) {
  const comparisons = getVisibleItemAttributes(item).map(attribute => compareItemStat(attribute, peerItems)).filter(Boolean);
  return { comparableCount: comparisons.length, bestCount: comparisons.filter(comparison => comparison.isBest).length };
}
