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
});