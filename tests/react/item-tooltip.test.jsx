import { render, screen } from '../../tests/react/test-utils.jsx';
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

  test('shows total defense and independent enhanced-defense comparison', () => {
    render(<ItemTooltip
      item={{
        type: 'uar', defense: 101,
        displayed_combined_magic_attributes: [{ id: 16, values: [33], description: '+33% Enhanced Defense' }],
      }}
      comparisonItems={[
        { type: 'uar', defense: 101, displayed_combined_magic_attributes: [{ id: 16, values: [33] }] },
        { type: 'uar', defense: 100, displayed_combined_magic_attributes: [{ id: 16, values: [40] }] },
      ]}
    />);

    expect(screen.getByText('Total Defense: 134')).toBeInTheDocument();
    expect(screen.getAllByText('6 below best of 2')).toHaveLength(1);
    expect(screen.getAllByText('7 below best of 2')).toHaveLength(1);
  });

  test('shows enhanced damage comparisons for parser minimum and maximum rolls', () => {
    render(<ItemTooltip
      item={{
        type: '9cr',
        displayed_combined_magic_attributes: [
          { id: 25, values: [150], description: '+150% Enhanced Damage' },
          { id: 17, values: [170], description: '+170% Enhanced Maximum Damage' },
          { id: 18, values: [140], description: '+140% Enhanced Minimum Damage' },
        ],
      }}
      comparisonItems={[
        { type: '9cr', displayed_combined_magic_attributes: [
          { id: 25, values: [150] }, { id: 17, values: [170] }, { id: 18, values: [140] },
        ] },
        { type: '9cr', displayed_combined_magic_attributes: [
          { id: 25, values: [125] }, { id: 17, values: [180] }, { id: 18, values: [135] },
        ] },
      ]}
    />);

    expect(screen.getAllByText('Best of 2 matches')).toHaveLength(2);
    expect(screen.getByText('10 below best of 2')).toBeInTheDocument();
  });

  test('does not fabricate total defense for non-armor items', () => {
    render(<ItemTooltip item={{ type: 'rin', defense: 999 }} comparisonItems={[{ type: 'rin', defense: 1 }]} />);
    expect(screen.queryByText('Total Defense: 999')).not.toBeInTheDocument();
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

  test('shows authoritative roll ranges when the parsed stat supplies them', () => {
    render(<ItemTooltip item={{
      type: 'vgl',
      displayed_combined_magic_attributes: [{
        id: 39,
        values: [28],
        description: 'Fire Resist +28%',
        roll_range: { min: 21, max: 30 },
      }],
    }} />);

    expect(screen.getByText('Roll 21–30 · 78%')).toBeInTheDocument();
  });
});

