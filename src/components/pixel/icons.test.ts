import { describe, expect, it } from 'vitest';
import { ICON_MATRICES, type IconName } from './icons';

describe('Pixel Icons Kit', () => {
  const REQUIRED_26_ICONS: IconName[] = [
    'home',
    'upload',
    'pulse',
    'checklist',
    'chart',
    'clean',
    'shield-check',
    'report',
    'clock',
    'gear',
    'lock',
    'check',
    'cross',
    'warning',
    'info',
    'chat',
    'trash',
    'plus',
    'arrow-right',
    'file',
    'folder',
    'robot-head',
    'magnifier',
    'download',
    'refresh',
    'eye',
  ];

  it('defines all 26 required pixel icons exactly', () => {
    expect(REQUIRED_26_ICONS.length).toBe(26);
    for (const icon of REQUIRED_26_ICONS) {
      expect(ICON_MATRICES[icon]).toBeDefined();
    }
  });

  it('verifies that each icon is a valid 16x16 pixel matrix', () => {
    for (const [name, matrix] of Object.entries(ICON_MATRICES)) {
      expect(matrix.length, `Icon ${name} should have 16 rows`).toBe(16);
      for (let r = 0; r < matrix.length; r++) {
        expect(matrix[r].length, `Icon ${name} row ${r} should have 16 chars`).toBe(16);
      }
    }
  });
});

