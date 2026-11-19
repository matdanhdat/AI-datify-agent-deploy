/**
 * Local application configuration constants.
 * In the new browser-first architecture, these constants replace the backend .env file.
 */

export const APP_CONFIG_DEFAULTS = {
  appName: 'Datify AI Agent',
  minSessions: 30,
  strictMode: true,
  tradingDays: 252,
  // Browser safety limits: 5 MB file size and 50,000 rows
  maxFileMb: 5,
  maxRows: 50000,
  maxSymbols: 10,
  llmProvider: 'gemini' as const,
  /** Feature flag for M3 Business Analysis & AI Insights pipeline (can be disabled via VITE_DISABLE_M3_ANALYSIS=1 or ?legacyAnalyze=1) */
  enableM3Analysis: true,
};

export function isM3AnalysisEnabled(): boolean {
  try {
    if (typeof import.meta !== 'undefined' && (import.meta as any).env?.VITE_DISABLE_M3_ANALYSIS === '1') {
      return false;
    }
    if (typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('legacyAnalyze') === '1') {
      return false;
    }
  } catch {
    // Ignore env/window lookup errors
  }
  return APP_CONFIG_DEFAULTS.enableM3Analysis;
}

