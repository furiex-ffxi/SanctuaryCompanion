import { render, screen } from '@testing-library/react';
import { describe, expect, test } from 'vitest';
import { ItemTooltip } from '../../src/components/ItemTooltip.jsx';

describe('ItemTooltip', () => {
  test('shows an armor item defense value', () => {
    render(<ItemTooltip item={{
      type: 'uar',
      type_name: 'Sacred Armor',
      defense: 467,
      item_level: 85,
      equippable: true,
    }} />);

    expect(screen.getByText('Defense: 467')).toBeInTheDocument();
  });

  test('respects an intentionally empty displayed stat list', () => {
    render(<ItemTooltip item={{
      type: 'vgl',
      type_name: 'Heavy Gloves',
      displayed_combined_magic_attributes: [],
      magic_attributes: [{ id: 39, values: [29], description: 'raw stat must stay hidden' }],
    }} />);

    expect(screen.queryByText('raw stat must stay hidden')).not.toBeInTheDocument();
  });

  test('falls back through missing and non-array sources without duplicating stats', () => {
    render(<ItemTooltip item={{
      type: 'vgl',
      type_name: 'Heavy Gloves',
      displayed_combined_magic_attributes: null,
      displayed_magic_attributes: 'invalid',
      combined_magic_attributes: undefined,
      magic_attributes: [{ id: 39, values: [29], description: 'Fire Resist +29%' }],
    }} />);

    expect(screen.getAllByText('Fire Resist +29%')).toHaveLength(1);
  });
});
