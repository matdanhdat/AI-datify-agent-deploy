import { useEffect, useState } from 'react';
import { AppError, ERROR_CODES } from '../core/errors';
import type { HealthResponse } from '../core/schemas';

export interface AiGatewayResponse<T = unknown> {
  ok: boolean;
  task: string;
  data: T;
  model: string;
  latency_ms: number;
  thinking_level?: string;
  thoughts_tokens?: number;
  output_tokens?: number;
}

export interface AiStatusInfo {
  ai_mode: 'ai' | 'fallback';
  slots: number;
  model: string;
  model_fallback: string | null;
  loading: boolean;
}

let cachedStatus: {
  ai_mode: 'ai' | 'fallback';
  slots: number;
  model: string;
  model_fallback: string | null;
} | null = null;
let lastCheckTime = 0;

/**
 * Fetches AI gateway health and status with a 5s timeout.
 * Reuses memory cache within 15 seconds to minimize calls.
 */
export async function getAiStatus(force = false): Promise<{
  ai_mode: 'ai' | 'fallback';
  slots: number;
  model: string;
  model_fallback: string | null;
}> {
  const now = Date.now();
  if (!force && cachedStatus && now - lastCheckTime < 15000) {
    return cachedStatus;
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    const res = await fetch('/api/health', {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (res.ok) {
      const data: HealthResponse = await res.json();
      cachedStatus = {
        ai_mode: data.ai_mode,
        slots: data.llm_key_slots,
        model: data.llm_model || 'gemini-3.5-flash-lite',
        model_fallback: data.llm_model_fallback || 'gemini-3.8-flash',
      };
      lastCheckTime = now;
      return cachedStatus;
    }
  } catch (_err) {
    // Graceful fallback when serverless gateway is unavailable
  }

  cachedStatus = {
    ai_mode: 'fallback',
    slots: 0,
    model: 'gemini-3.5-flash-lite',
    model_fallback: 'gemini-3.8-flash',
  };
  lastCheckTime = now;
  return cachedStatus;
}

/**
 * Helper to check if AI Gateway has active API keys configured.
 */
export async function isAiAvailable(): Promise<boolean> {
  const status = await getAiStatus();
  return status.ai_mode === 'ai';
}

/**
 * Hook to consume AI Gateway status in UI components.
 */
export function useAiStatus() {
  const [status, setStatus] = useState<AiStatusInfo>({
    ai_mode: cachedStatus?.ai_mode || 'fallback',
    slots: cachedStatus?.slots || 0,
    model: cachedStatus?.model || 'gemini-3.5-flash-lite',
    model_fallback: cachedStatus?.model_fallback || 'gemini-3.8-flash',
    loading: !cachedStatus,
  });

  useEffect(() => {
    let mounted = true;
    getAiStatus().then((s) => {
      if (mounted) {
        setStatus({
          ai_mode: s.ai_mode,
          slots: s.slots,
          model: s.model,
          model_fallback: s.model_fallback,
          loading: false,
        });
      }
    });
    return () => {
      mounted = false;
    };
  }, []);

  const refresh = async () => {
    setStatus((prev) => ({ ...prev, loading: true }));
    const s = await getAiStatus(true);
    setStatus({
      ai_mode: s.ai_mode,
      slots: s.slots,
      model: s.model,
      model_fallback: s.model_fallback,
      loading: false,
    });
    return s;
  };

  return { ...status, refresh };
}

/**
 * Invokes an AI task via the Vercel serverless /api/ai gateway.
 */
export async function callAi<T = unknown>(
  task: string,
  input: unknown,
  signal?: AbortSignal
): Promise<AiGatewayResponse<T>> {
  // Enforce <= 25s timeout cap per single AI call (Prompt M3-B5)
  const timeoutMs = task === 'business_insights' ? 25000 : 25000;
  const controller = new AbortController();
  let timedOut = false;

  const onExternalAbort = () => controller.abort();
  if (signal) {
    if (signal.aborted) {
      throw new AppError(ERROR_CODES.LLM_TIMEOUT, 'Yêu cầu tới cổng AI đã bị hủy.', { reason: 'aborted' }, 499);
    }
    signal.addEventListener('abort', onExternalAbort, { once: true });
  }

  const timeoutId = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);

  try {
    const res = await fetch('/api/ai', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({ task, input }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);
    if (signal) signal.removeEventListener('abort', onExternalAbort);

    const json = await res.json().catch(() => ({}));

    if (!res.ok) {
      throw new AppError(
        json.code || ERROR_CODES.LLM_UPSTREAM_ERROR,
        json.message_vi || 'Cổng AI gặp sự cố phản hồi.',
        json.details || {},
        res.status
      );
    }

    return json as AiGatewayResponse<T>;
  } catch (err: unknown) {
    clearTimeout(timeoutId);
    if (signal) signal.removeEventListener('abort', onExternalAbort);

    if (err instanceof AppError) {
      throw err;
    }

    if (err instanceof Error && err.name === 'AbortError') {
      if (!timedOut && signal?.aborted) {
        throw new AppError(
          ERROR_CODES.LLM_TIMEOUT,
          'Yêu cầu tới cổng AI đã bị hủy.',
          { reason: 'aborted' },
          499
        );
      }
      const waitSec = Math.round(timeoutMs / 1000);
      throw new AppError(
        ERROR_CODES.LLM_TIMEOUT,
        `Yêu cầu tới cổng AI đã quá thời gian chờ (${waitSec} giây).`,
        { reason: 'timeout' },
        504
      );
    }

    throw new AppError(
      ERROR_CODES.LLM_UPSTREAM_ERROR,
      'Không thể kết nối tới cổng AI của máy chủ.',
      {},
      502
    );
  }
}

export const callAI = callAi;

/**
 * Constructs the canonical request payload for the ping AI task.
 */
export function buildPingPayload(timestamp = Date.now()) {
  return {
    task: 'ping' as const,
    input: { timestamp },
  };
}

/**
 * Pings the AI gateway to verify connectivity and measure latency.
 */
export async function pingAi(timestamp = Date.now()): Promise<{
  pong: boolean;
  message: string;
  timestamp: number;
  latency_ms: number;
  model_used: string;
  thinking_level?: string;
  thoughts_tokens?: number;
  output_tokens?: number;
}> {
  const payload = buildPingPayload(timestamp);
  const result = await callAi<{ pong: boolean; message: string; timestamp: number }>(
    payload.task,
    payload.input
  );

  return {
    ...result.data,
    latency_ms: result.latency_ms,
    model_used: result.model,
    thinking_level: result.thinking_level,
    thoughts_tokens: result.thoughts_tokens,
    output_tokens: result.output_tokens,
  };
}

