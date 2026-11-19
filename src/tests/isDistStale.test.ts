// @vitest-environment node
import { describe, it, expect } from 'vitest';
// @ts-expect-error start_local.mjs is an ES script without declaration file
import { isDistStale } from '../../scripts/start_local.mjs';

describe('T1: isDistStale - dist auto-rebuild check', () => {
  it('returns true when dist is missing (dist thiếu)', () => {
    // distExists = false, srcExists = true
    const stale = isDistStale(1000, 0, false, true);
    expect(stale).toBe(true);
  });

  it('returns true when dist is older than src (dist cũ)', () => {
    // distExists = true, srcExists = true, src newer than dist
    const stale = isDistStale(2000, 1000, true, true);
    expect(stale).toBe(true);
  });

  it('returns false when dist is up to date (dist mới)', () => {
    // distExists = true, srcExists = true, dist newer than src
    const stale = isDistStale(1000, 2000, true, true);
    expect(stale).toBe(false);
  });

  it('returns false when src is missing (src thiếu - e.g. production release package)', () => {
    // srcExists = false
    const stale = isDistStale(0, 1000, true, false);
    expect(stale).toBe(false);
  });

  it('returns false when mtimes are equal', () => {
    const stale = isDistStale(1000, 1000, true, true);
    expect(stale).toBe(false);
  });
});
