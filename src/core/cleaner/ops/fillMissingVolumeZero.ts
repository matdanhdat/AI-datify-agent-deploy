/**
 * Clean operation: fill_missing_volume_zero
 * Fills missing (NaN / null) volume cells with 0.
 * Pure function: creates a new RawDataset without mutating input.
 */

import type { RawDataset } from '../../dataset';

export interface FillVolumeResult {
  dataset: RawDataset;
  filledIndices: number[];
}

export function fillMissingVolumeZero(raw: RawDataset): FillVolumeResult {
  const count = raw.volume.length;
  const filledIndices: number[] = [];

  for (let i = 0; i < count; i++) {
    const v = raw.volume[i];
    if (isNaN(v) || v === null || v === undefined) {
      filledIndices.push(i);
    }
  }

  if (filledIndices.length === 0) {
    return { dataset: raw, filledIndices: [] };
  }

  // Clone volume array and replace NaN with 0
  const newVolume = new Float64Array(raw.volume);
  for (const idx of filledIndices) {
    newVolume[idx] = 0;
  }

  const newDataset: RawDataset = {
    ...raw,
    volume: newVolume,
  };

  return { dataset: newDataset, filledIndices };
}

