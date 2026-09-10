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

  test('displays Unidentified and base name for unid unique items without spoiling unique name or stats', () => {
    render(<ItemTooltip
      item={{
        type: 'uap',
        type_name: 'Shako',
        quality: 7,
        unique_name: 'Harlequin Crest',
        defense: 141,
        durability: 12,
        max_durability: 12,
        level_requirement: 62,
        item_level: 85,
        identified: 0,
        displayed_combined_magic_attributes: [
          { id: 127, values: [2], description: '+2 to All Skills' },
          { id: 80, values: [50], description: '50% Better Chance of Getting Magic Items' },
        ],
      }}
      comparisonItems={[
        { type: 'uap', displayed_combined_magic_attributes: [{ id: 80, values: [50] }] },
      ]}
    />);

    // Displays base item name in header and Unidentified label
    expect(screen.getByText('Shako')).toBeInTheDocument();
    expect(screen.getByText('Unidentified')).toBeInTheDocument();

    // Base properties are preserved
    expect(screen.getByText('Defense: 141')).toBeInTheDocument();
    expect(screen.getByText('Durability: 12 of 12')).toBeInTheDocument();
    expect(screen.getByText('Item Level: 85')).toBeInTheDocument();

    // Secret unique name and rolled stats are NOT spoiled
    expect(screen.queryByText('Harlequin Crest')).not.toBeInTheDocument();
    expect(screen.queryByText('+2 to All Skills')).not.toBeInTheDocument();
    expect(screen.queryByText('50% Better Chance of Getting Magic Items')).not.toBeInTheDocument();
    expect(screen.queryByText('Required Level: 62')).not.toBeInTheDocument();
    expect(screen.queryByText(/best of/i)).not.toBeInTheDocument();
  });

  test('displays Unidentified for unid set items and hides set name and set bonuses', () => {
    render(<ItemTooltip
      item={{
        type: 'uar',
        type_name: 'Lacquered Plate',
        quality: 5,
        unique_name: "Tal Rasha's Guardianship",
        set_name: "Tal Rasha's Wrappings",
        identified: false,
        level_requirement: 71,
        item_level: 88,
        displayed_combined_magic_attributes: [
          { id: 39, values: [40], description: 'Fire Resist +40%' },
        ],
        set_attributes: [
          [{ id: 105, values: [10], description: '+10% Faster Cast Rate' }],
        ],
      }}
    />);

    expect(screen.getByText('Lacquered Plate')).toBeInTheDocument();
    expect(screen.getByText('Unidentified')).toBeInTheDocument();
    expect(screen.queryByText("Tal Rasha's Guardianship")).not.toBeInTheDocument();
    expect(screen.queryByText("Tal Rasha's Wrappings")).not.toBeInTheDocument();
    expect(screen.queryByText('Fire Resist +40%')).not.toBeInTheDocument();
    expect(screen.queryByText('+10% Faster Cast Rate')).not.toBeInTheDocument();
    expect(screen.queryByText('Required Level: 71')).not.toBeInTheDocument();
  });

  test('displays Unidentified for unid rare items and hides rare prefix/suffix names and stats', () => {
    render(<ItemTooltip
      item={{
        type: 'rin',
        type_name: 'Ring',
        quality: 6,
        rare_name: 'Bitter',
        rare_name2: 'Emblem',
        identified: 0,
        level_requirement: 65,
        displayed_combined_magic_attributes: [
          { id: 19, values: [10], description: '+10% Faster Cast Rate' },
          { id: 7, values: [20], description: '+20 to Life' },
        ],
      }}
    />);

    expect(screen.getByText('Ring')).toBeInTheDocument();
    expect(screen.getByText('Unidentified')).toBeInTheDocument();
    expect(screen.queryByText('Bitter Emblem')).not.toBeInTheDocument();
    expect(screen.queryByText('+10% Faster Cast Rate')).not.toBeInTheDocument();
    expect(screen.queryByText('+20 to Life')).not.toBeInTheDocument();
    expect(screen.queryByText('Required Level: 65')).not.toBeInTheDocument();
  });

  test('preserves sockets on unidentified items while hiding rolled stats and total defense ED', () => {
    render(<ItemTooltip
      item={{
        type: 'uap',
        type_name: 'Shako',
        quality: 4,
        magic_prefix_name: 'Mechanic\'s',
        identified: 0,
        defense: 120,
        total_nr_of_sockets: 2,
        displayed_combined_magic_attributes: [
          { id: 16, values: [50], description: '+50% Enhanced Defense' },
        ],
      }}
      comparisonItems={[
        { type: 'uap', defense: 120, displayed_combined_magic_attributes: [{ id: 16, values: [50] }] },
      ]}
    />);

    expect(screen.getByText('Shako')).toBeInTheDocument();
    expect(screen.getByText('Unidentified')).toBeInTheDocument();
    expect(screen.getByText('[2 sockets]')).toBeInTheDocument();
    expect(screen.getByText('Defense: 120')).toBeInTheDocument();
    expect(screen.queryByText('Total Defense: 180')).not.toBeInTheDocument();
    expect(screen.queryByText('+50% Enhanced Defense')).not.toBeInTheDocument();
    expect(screen.queryByText(/Mechanic/i)).not.toBeInTheDocument();
  });
});


