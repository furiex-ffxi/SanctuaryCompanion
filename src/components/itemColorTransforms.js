const DIABLO_COLOR_FILTERS = {
  blac: 'brightness(0.38) saturate(1.4)', bwht: 'brightness(1.65) saturate(0.2)',
  cblu: 'sepia(1) saturate(5) hue-rotate(175deg)', cgrn: 'sepia(1) saturate(4) hue-rotate(55deg)',
  cred: 'sepia(1) saturate(6) hue-rotate(315deg)', dblu: 'sepia(1) saturate(4) hue-rotate(180deg) brightness(0.72)',
  dgld: 'sepia(1) saturate(5) hue-rotate(355deg) brightness(0.82)', dgrn: 'sepia(1) saturate(4) hue-rotate(70deg) brightness(0.72)',
  dgry: 'grayscale(0.8) brightness(0.7)', dpur: 'sepia(1) saturate(5) hue-rotate(245deg) brightness(0.78)',
  dred: 'sepia(1) saturate(5) hue-rotate(320deg) brightness(0.75)', dyel: 'sepia(1) saturate(5) hue-rotate(15deg) brightness(0.78)',
  lblu: 'sepia(1) saturate(5) hue-rotate(180deg) brightness(1.15)', lgld: 'sepia(1) saturate(5) hue-rotate(355deg) brightness(1.15)',
  lgrn: 'sepia(1) saturate(4) hue-rotate(70deg) brightness(1.15)', lgry: 'grayscale(0.65) brightness(1.25)',
  lpur: 'sepia(1) saturate(5) hue-rotate(245deg) brightness(1.15)', lred: 'sepia(1) saturate(6) hue-rotate(320deg) brightness(1.15)',
  lyel: 'sepia(1) saturate(5) hue-rotate(15deg) brightness(1.2)', oran: 'sepia(1) saturate(6) hue-rotate(355deg) brightness(1.2)',
  whit: 'brightness(1.5) saturate(0.15)',
};
export const getDiabloColorFilter = (color) =>
  DIABLO_COLOR_FILTERS[String(color || '').trim().toLowerCase()] || undefined;

