/**
 * Runtime CSS Token Resolver.
 * Reads CSS custom properties from document root with safe fallback in SSR/test environments.
 */

const FALLBACK_TOKENS: Record<string, string> = {
  '--bg': '#CFE6F7',
  '--panel': '#EAF0F6',
  '--ink': '#14214D',
  '--ink-soft': '#3C4A78',
  '--accent': '#F26B21',
  '--blue': '#3B7BD1',
  '--good': '#1E9E4A',
  '--bad': '#D93025',
  '--warn': '#F5A524',
  '--white': '#FFFFFF',
  '--chart-bg': '#FFFFFF',
  '--chart-grid': '#D9D9D9',
  '--chart-axis': '#BFBFBF',
  '--chart-text': '#595959',
  '--excel-blue': '#4472C4',
  '--excel-orange': '#ED7D31',
  '--excel-gray': '#A5A5A5',
  '--excel-gold': '#FFC000',
  '--good-bg': '#D9F3E3',
  '--warn-bg': '#FEF0D4',
  '--blue-bg': '#D8E7FA',
};

export function readToken(tokenName: string): string {
  if (typeof window !== 'undefined' && typeof document !== 'undefined') {
    const val = window.getComputedStyle(document.documentElement).getPropertyValue(tokenName).trim();
    if (val) return val;
  }
  return FALLBACK_TOKENS[tokenName] || '';
}

