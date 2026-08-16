import { calculateTooltipPosition } from './tooltipPosition.js';
import { test, describe } from 'node:test';
import assert from 'node:assert';

describe('calculateTooltipPosition', () => {
  test('default placement below and right', () => {
    const result = calculateTooltipPosition({
      clientX: 100,
      clientY: 100,
      tooltipRect: { width: 200, height: 100 },
      viewportWidth: 1000,
      viewportHeight: 1000,
      margin: 10,
      cursorGap: 15
    });
    assert.strictEqual(result.left, 115);
    assert.strictEqual(result.top, 115);
    assert.strictEqual(result.maxHeight, 980);
  });

  test('horizontal flip left on right overflow', () => {
    const result = calculateTooltipPosition({
      clientX: 900,
      clientY: 100,
      tooltipRect: { width: 200, height: 100 },
      viewportWidth: 1000,
      viewportHeight: 1000,
      margin: 10,
      cursorGap: 15
    });
    // 900 - 15 - 200 = 685
    assert.strictEqual(result.left, 685);
    assert.strictEqual(result.top, 115);
  });

  test('vertical flip above on bottom overflow', () => {
    const result = calculateTooltipPosition({
      clientX: 100,
      clientY: 900,
      tooltipRect: { width: 200, height: 200 },
      viewportWidth: 1000,
      viewportHeight: 1000,
      margin: 10,
      cursorGap: 15
    });
    // 900 - 15 - 200 = 685
    assert.strictEqual(result.left, 115);
    assert.strictEqual(result.top, 685);
  });

  test('both flips (above and left) on bottom-right overflow', () => {
    const result = calculateTooltipPosition({
      clientX: 900,
      clientY: 900,
      tooltipRect: { width: 200, height: 200 },
      viewportWidth: 1000,
      viewportHeight: 1000,
      margin: 10,
      cursorGap: 15
    });
    assert.strictEqual(result.left, 685);
    assert.strictEqual(result.top, 685);
  });

  test('clamping oversized tooltip', () => {
    const result = calculateTooltipPosition({
      clientX: 100,
      clientY: 100,
      tooltipRect: { width: 1200, height: 1200 },
      viewportWidth: 1000,
      viewportHeight: 1000,
      margin: 10,
      cursorGap: 15
    });
    assert.strictEqual(result.left, 10);
    assert.strictEqual(result.top, 10);
    assert.strictEqual(result.maxHeight, 980);
  });
});
