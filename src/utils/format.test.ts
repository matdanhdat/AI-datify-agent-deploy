import { describe, expect, it } from 'vitest';
import { formatDate, formatDateTime, formatNumber, formatPercent } from './format';

describe('formatNumber', () => {
  it('formats thousands with dot and decimals with comma in Vietnamese standard', () => {
    // 1234.56 -> "1.234,56"
    expect(formatNumber(1234.56)).toBe('1.234,56');
    expect(formatNumber(1000000)).toBe('1.000.000');
    expect(formatNumber(0)).toBe('0');
  });

  it('handles null and undefined gracefully', () => {
    expect(formatNumber(null)).toBe('-');
    expect(formatNumber(undefined)).toBe('-');
    expect(formatNumber(NaN)).toBe('-');
  });
});

describe('formatPercent', () => {
  it('formats decimal ratio as percentage with comma decimal separator', () => {
    // 0.1234 -> "12,34%"
    expect(formatPercent(0.1234)).toBe('12,34%');
    expect(formatPercent(0.05)).toBe('5,00%');
    expect(formatPercent(-0.025)).toBe('-2,50%');
  });

  it('handles null and undefined gracefully', () => {
    expect(formatPercent(null)).toBe('-');
    expect(formatPercent(undefined)).toBe('-');
  });
});

describe('formatDate', () => {
  it('formats UTC ISO date into DD/MM/YYYY in Vietnam timezone', () => {
    expect(formatDate('2026-11-13T08:30:00Z')).toBe('13/11/2026');
  });

  it('handles null and undefined gracefully', () => {
    expect(formatDate(null)).toBe('-');
    expect(formatDate(undefined)).toBe('-');
  });
});

describe('formatDateTime', () => {
  it('formats UTC ISO datetime into DD/MM/YYYY HH:mm in Vietnam timezone (UTC+7)', () => {
    // 2026-11-13T17:30:00Z + 7 hours = 2026-11-14 00:30 Vietnam time
    expect(formatDateTime('2026-11-13T17:30:00Z')).toBe('14/11/2026 00:30');
    expect(formatDateTime('2026-11-13T08:30:00Z')).toBe('13/11/2026 15:30');
  });

  it('handles invalid dates gracefully', () => {
    expect(formatDateTime(null)).toBe('-');
    expect(formatDateTime('')).toBe('-');
    expect(formatDateTime('not-a-date')).toBe('-');
  });
});

