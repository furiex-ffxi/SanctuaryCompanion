export function calculateTooltipPosition({
  clientX,
  clientY,
  tooltipRect,
  viewportWidth,
  viewportHeight,
  margin = 10,
  cursorGap = 15
}) {
  const { width, height } = tooltipRect;
  
  // Prefer below/right
  let left = clientX + cursorGap;
  let top = clientY + cursorGap;
  
  // flip left on right overflow
  if (left + width + margin > viewportWidth) {
    left = clientX - cursorGap - width;
  }
  
  // flip above on bottom overflow
  if (top + height + margin > viewportHeight) {
    top = clientY - cursorGap - height;
  }
  
  // clamp both axes
  if (left + width + margin > viewportWidth) {
    left = viewportWidth - width - margin;
  }
  if (top + height + margin > viewportHeight) {
    top = viewportHeight - height - margin;
  }
  if (left < margin) left = margin;
  if (top < margin) top = margin;
  
  const maxHeight = viewportHeight - (margin * 2);

  return { left, top, maxHeight };
}
