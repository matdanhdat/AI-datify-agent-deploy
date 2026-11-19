/**
 * Limits, abuse prevention, and timeout constants for AI Gateway.
 */

export interface TaskTimeoutConfig {
  keyTimeoutMs: number;
  totalTimeoutMs: number;
  clientTimeoutMs: number;
}

export const TASK_TIMEOUTS: Record<string, TaskTimeoutConfig> = {
  ping: {
    keyTimeoutMs: 15000,
    totalTimeoutMs: 25000,
    clientTimeoutMs: 28000,
  },
  chat_explain: {
    keyTimeoutMs: 15000,
    totalTimeoutMs: 25000,
    clientTimeoutMs: 28000,
  },
  explain_cleaning: {
    keyTimeoutMs: 15000,
    totalTimeoutMs: 25000,
    clientTimeoutMs: 28000,
  },
  plan_custom: {
    keyTimeoutMs: 15000,
    totalTimeoutMs: 25000,
    clientTimeoutMs: 28000,
  },
  write_report: {
    keyTimeoutMs: 35000,
    totalTimeoutMs: 55000,
    clientTimeoutMs: 58000,
  },
  business_insights: {
    keyTimeoutMs: 12000,
    totalTimeoutMs: 22000,
    clientTimeoutMs: 25000,
  },
};

export function getTaskTimeout(taskName?: string): TaskTimeoutConfig {
  if (taskName && TASK_TIMEOUTS[taskName]) {
    return TASK_TIMEOUTS[taskName];
  }
  return {
    keyTimeoutMs: 15000,
    totalTimeoutMs: 25000,
    clientTimeoutMs: 28000,
  };
}

export const LIMITS = {
  // Max request body size: 64 KB
  MAX_PAYLOAD_BYTES: 64 * 1024,

  // Sliding window rate limits per client IP (best-effort in memory)
  RATE_LIMIT_PER_MINUTE: 20,
  RATE_LIMIT_PER_HOUR: 300,

  // Default timeout limits (for fast fallback)
  KEY_TIMEOUT_MS: 15000,   // 15s per key default
  TOTAL_TIMEOUT_MS: 25000, // 25s total default

  // Cooldown duration when key encounters HTTP 429
  KEY_COOLDOWN_MS: 60000,  // 60s
};


