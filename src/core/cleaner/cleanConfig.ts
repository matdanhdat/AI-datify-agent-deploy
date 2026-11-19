/**
 * Configuration and default threshold constants for data cleaning and outlier detection.
 * Adheres strictly to CONTRACT.md and Prompt P3 Section 5.
 * Pure TypeScript - zero runtime external dependencies.
 */

export const CLEAN_CONFIG = {
  /**
   * Z-score threshold for outlier detection using Median Absolute Deviation (MAD).
   * z = |r - median(r)| / (1.4826 * MAD)
   */
  OUTLIER_Z: 6.0,

  /**
   * Minimum absolute log-return required to flag a row as an outlier (10%).
   * Dual-condition prevents false positives during periods of very low baseline volatility.
   */
  OUTLIER_MIN_ABS_RET: 0.10,

  /**
   * Minimum series length required for a symbol before applying MAD outlier detection.
   * Symbols with fewer than 10 sessions are skipped.
   */
  OUTLIER_MIN_SERIES_LEN: 10,

  /**
   * Minimum trading sessions per symbol required after cleaning to pass Gate 1 (Section 5.4).
   */
  MIN_SESSIONS_REQUIRED: 30,

  /**
   * Maximum original row numbers sampled for CleanProposal.sample_rows display.
   */
  MAX_SAMPLE_ROWS: 5,

  /**
   * Debounce delay (ms) for UI diff and constraint recalculations on toggle.
   */
  DIFF_DEBOUNCE_MS: 150,
} as const;

