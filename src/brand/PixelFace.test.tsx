import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { PixelFace } from './PixelFace';
import { FACE_ANALYST, PALETTE_ANALYST, FACE_BOT, PALETTE_BOT } from './sprites';

describe('PixelFace Brand Component (D1b, D1c)', () => {
  it('renders FACE_ANALYST with merged horizontal rects and crisp edges', () => {
    const { container } = render(
      <PixelFace rows={FACE_ANALYST} palette={PALETTE_ANALYST} px={6} />
    );

    const svg = container.querySelector('svg');
    expect(svg).toBeDefined();
    expect(svg?.getAttribute('width')).toBe('48');
    expect(svg?.getAttribute('height')).toBe('48');
    expect(svg?.getAttribute('shape-rendering')).toBe('crispEdges');

    // Row 0 has 'nnnnnnnn' (8 consecutive 'n'), which should merge into 1 rect instead of 8 rects
    const rects = container.querySelectorAll('rect');
    // Total 8x8 is 64 cells, with horizontal run merging it should be significantly fewer than 64 rects
    expect(rects.length).toBeLessThan(40);
    expect(rects.length).toBeGreaterThan(10);
  });

  it('renders FACE_BOT with antenna enabled', () => {
    const { container } = render(
      <PixelFace rows={FACE_BOT} palette={PALETTE_BOT} px={6} antenna={true} />
    );

    const svg = container.querySelector('svg');
    expect(svg).toBeDefined();
    expect(svg?.getAttribute('width')).toBe('48');
    // Height includes 8 rows + 2 antenna rows = 10 rows * 6px = 60px
    expect(svg?.getAttribute('height')).toBe('60');

    // Check antenna orange light rect color
    const orangeRect = container.querySelector(`rect[fill="${PALETTE_BOT.o}"]`);
    expect(orangeRect).toBeDefined();
    expect(orangeRect?.getAttribute('x')).toBe('18'); // 3 * 6px = 18
  });
});
