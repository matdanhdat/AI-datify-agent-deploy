/**
 * Server-side environment variables reader for AI Gateway.
 * Strictly runs in Node/Vercel serverless context. NEVER imported into browser client.
 */

export function getGeminiKeys(): string[] {
  const keys: string[] = [];
  const k1 = process.env.GEMINI_API_KEY_1?.trim();
  const k2 = process.env.GEMINI_API_KEY_2?.trim();

  if (k1) keys.push(k1);
  if (k2 && k2 !== k1) keys.push(k2);

  return keys;
}

/**
 * Primary model: gemini-3.5-flash-lite
 * Selected based on Google AI Studio documentation (November 2026).
 * Ultra-fast, cost-effective workhorse model designed for high-throughput agents.
 */
export function getGeminiModel(): string {
  return process.env.GEMINI_MODEL?.trim() || 'gemini-3.5-flash-lite';
}

/**
 * Fallback model: gemini-3.8-flash
 * Selected based on Google AI Studio documentation (November 2026).
 * Active Flash workhorse model with enhanced reasoning.
 */
export function getGeminiModelFallback(): string | null {
  const fallback = process.env.GEMINI_MODEL_FALLBACK?.trim();
  if (fallback) return fallback;

  const primary = getGeminiModel();
  if (primary !== 'gemini-3.8-flash') {
    return 'gemini-3.8-flash';
  }
  return 'gemini-3.5-flash-lite';
}

export function getKeySlots(): number {
  return getGeminiKeys().length;
}

export type ThinkingLevel = 'minimal' | 'low' | 'medium' | 'high';
export const VALID_THINKING_LEVELS: readonly ThinkingLevel[] = ['minimal', 'low', 'medium', 'high'] as const;

/**
 * Returns the configured thinking level for Gemini models (Gemini 3 series).
 * Defaults to 'minimal' for fast tasks (ping, explain_cleaning, chat_explain, plan_custom).
 * Defaults to 'low' for write_report.
 * If an invalid value is configured in environment variables, logs a warning and falls back to default.
 */
export function getThinkingLevel(taskName?: string): ThinkingLevel {
  const isReport = taskName === 'write_report';
  const rawEnv = isReport
    ? process.env.GEMINI_THINKING_LEVEL_REPORT?.trim() || process.env.GEMINI_THINKING_LEVEL?.trim()
    : process.env.GEMINI_THINKING_LEVEL?.trim();

  const defaultLevel: ThinkingLevel = isReport ? 'low' : 'minimal';

  if (!rawEnv) {
    return defaultLevel;
  }

  const normalized = rawEnv.toLowerCase() as ThinkingLevel;
  if (VALID_THINKING_LEVELS.includes(normalized)) {
    return normalized;
  }

  console.warn(
    `[AI Gateway] Cảnh báo: Giá trị mức suy nghĩ '${rawEnv}' không hợp lệ (chỉ chấp nhận: minimal, low, medium, high). Tự động dùng mức mặc định '${defaultLevel}'.`
  );
  return defaultLevel;
}
