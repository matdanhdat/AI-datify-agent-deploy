/**
 * Deterministic Canonical Hashing for Quantitative Analysis Results.
 * Sorts object keys alphabetically, serializes numbers to 12 significant digits,
 * and computes SHA-256 hex digest.
 */

import type { Metric } from '../schemas';
import { sha256Hex } from '../hash';

/**
 * Serializes any JavaScript object or array into a canonical JSON string:
 * - Keys sorted alphabetically at all nesting levels.
 * - Floats/numbers rounded to 12 significant digits to avoid floating precision discrepancies.
 * - Zero extra whitespace.
 */
export function canonicalJsonStringify(val: unknown): string {
  if (val === null || val === undefined) {
    return 'null';
  }
  if (typeof val === 'number') {
    if (isNaN(val) || !isFinite(val)) return 'null';
    // Format to 12 significant digits and parse back to strip trailing zeroes
    const formatted = parseFloat(val.toPrecision(12)).toString();
    return formatted;
  }
  if (typeof val === 'boolean' || typeof val === 'string') {
    return JSON.stringify(val);
  }
  if (Array.isArray(val)) {
    const items = val.map((item) => canonicalJsonStringify(item));
    return `[${items.join(',')}]`;
  }
  if (typeof val === 'object') {
    const obj = val as Record<string, unknown>;
    const sortedKeys = Object.keys(obj).sort();
    const pairs = sortedKeys.map((k) => `${JSON.stringify(k)}:${canonicalJsonStringify(obj[k])}`);
    return `{${pairs.join(',')}}`;
  }
  return JSON.stringify(val);
}

/**
 * Computes canonical SHA-256 analysis_hash from an array of metrics.
 */
export async function computeAnalysisHash(metrics: Metric[]): Promise<string> {
  // Sort metrics deterministically: symbol first (nulls first), then id
  const sorted = [...metrics].sort((a, b) => {
    const symA = a.symbol || '';
    const symB = b.symbol || '';
    if (symA !== symB) return symA.localeCompare(symB);
    return a.id.localeCompare(b.id);
  });

  const canonical = canonicalJsonStringify(sorted);
  return sha256Hex(canonical);
}

