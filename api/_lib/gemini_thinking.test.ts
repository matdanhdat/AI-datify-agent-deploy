import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { callGeminiWithFallback } from './gemini';
import { pingTask } from './tasks';
import { getThinkingLevel } from './env';
import { getTaskTimeout } from './limits';

describe('Gemini Thinking Config, Latency Optimization & Fault-Tolerance Tests', () => {
  const ORIGINAL_ENV = { ...process.env };
  const FAKE_KEY_1 = 'MOCK_GEMINI_TEST_KEY_ONE_123';
  const FAKE_KEY_2 = 'MOCK_GEMINI_TEST_KEY_TWO_456';

  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV };
    process.env.GEMINI_API_KEY_1 = FAKE_KEY_1;
    process.env.GEMINI_API_KEY_2 = FAKE_KEY_2;
    process.env.GEMINI_MODEL = 'gemini-3.5-flash-lite';
    process.env.GEMINI_MODEL_FALLBACK = 'gemini-3.8-flash';
    delete process.env.GEMINI_THINKING_LEVEL;
    delete process.env.GEMINI_THINKING_LEVEL_REPORT;
    vi.restoreAllMocks();
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
    vi.restoreAllMocks();
  });

  // =========================================================================
  // 1. Request Body Structure: thinkingConfig.thinkingLevel per official docs
  // =========================================================================
  it('sends canonical thinkingConfig.thinkingLevel in generationConfig per Google docs', async () => {
    let capturedBody: any = null;

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (_url, init: any) => {
      capturedBody = JSON.parse(init.body);
      return new Response(
        JSON.stringify({
          candidates: [
            {
              content: {
                parts: [{ text: JSON.stringify({ pong: true, message: 'Chào bạn', timestamp: 12345 }) }],
              },
            },
          ],
          usageMetadata: { promptTokenCount: 20, candidatesTokenCount: 15, thoughtsTokenCount: 0, totalTokenCount: 35 },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    });

    const res = await callGeminiWithFallback(pingTask, { timestamp: 12345 });

    expect(capturedBody).toBeDefined();
    expect(capturedBody.generationConfig).toBeDefined();
    // Must be camelCase thinkingConfig per Google REST API v1beta
    expect(capturedBody.generationConfig.thinkingConfig).toBeDefined();
    expect(capturedBody.generationConfig.thinkingConfig.thinkingLevel).toBe('minimal');
    // Must NEVER send legacy thinking_budget / thinkingBudget simultaneously
    expect(capturedBody.generationConfig.thinkingConfig.thinkingBudget).toBeUndefined();
    expect(capturedBody.generationConfig.thinking_config).toBeUndefined();
    expect(capturedBody.generationConfig.thinking_budget).toBeUndefined();

    // Verify response metadata
    expect(res.thinking_level).toBe('minimal');
    expect(res.thoughts_tokens).toBe(0);
    expect(res.output_tokens).toBe(15);
  });

  // =========================================================================
  // 2. Default Thinking Levels: 'minimal' for fast tasks, 'low' for write_report
  // =========================================================================
  it('applies default thinking level minimal for ping and low for write_report', () => {
    expect(getThinkingLevel('ping')).toBe('minimal');
    expect(getThinkingLevel('explain_cleaning')).toBe('minimal');
    expect(getThinkingLevel('chat_explain')).toBe('minimal');
    expect(getThinkingLevel('plan_custom')).toBe('minimal');
    expect(getThinkingLevel('write_report')).toBe('low');
  });

  it('respects GEMINI_THINKING_LEVEL and GEMINI_THINKING_LEVEL_REPORT env overrides', () => {
    process.env.GEMINI_THINKING_LEVEL = 'low';
    process.env.GEMINI_THINKING_LEVEL_REPORT = 'medium';

    expect(getThinkingLevel('ping')).toBe('low');
    expect(getThinkingLevel('chat_explain')).toBe('low');
    expect(getThinkingLevel('write_report')).toBe('medium');
  });

  it('falls back to default and warns when invalid thinking level is configured', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    process.env.GEMINI_THINKING_LEVEL = 'extreme_invalid_level';

    const level = getThinkingLevel('ping');
    expect(level).toBe('minimal');
    expect(warnSpy).toHaveBeenCalled();
    const warnMessage = warnSpy.mock.calls[0][0];
    expect(warnMessage).toContain('không hợp lệ');
    // Must never leak secret keys in warning
    expect(warnMessage).not.toContain(FAKE_KEY_1);
  });

  // =========================================================================
  // 3. Resilience: 400 with unsupported thinkingLevel retries ONCE without it
  // =========================================================================
  it('retries exactly once without thinkingConfig when Google returns 400 for unsupported thinking', async () => {
    let callCount = 0;
    const bodiesReceived: any[] = [];

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (_url, init: any) => {
      callCount++;
      const body = JSON.parse(init.body);
      bodiesReceived.push(body);

      // First call has thinkingConfig -> Google returns 400 stating not supported
      if (body.generationConfig?.thinkingConfig !== undefined) {
        return new Response(
          JSON.stringify({
            error: {
              code: 400,
              message: 'Invalid JSON payload received. Unknown name "thinkingConfig" at \'generation_config\': Cannot find field.',
              status: 'INVALID_ARGUMENT',
            },
          }),
          { status: 400, headers: { 'Content-Type': 'application/json' } }
        );
      }

      // Second call (retry without thinkingConfig) -> Google returns 200 OK
      return new Response(
        JSON.stringify({
          candidates: [
            {
              content: {
                parts: [{ text: JSON.stringify({ pong: true, message: 'Thành công sau khi bỏ thinkingConfig', timestamp: 999 }) }],
              },
            },
          ],
          usageMetadata: { promptTokenCount: 15, candidatesTokenCount: 12, thoughtsTokenCount: 0, totalTokenCount: 27 },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    });

    const result = await callGeminiWithFallback(pingTask, { timestamp: 999 });

    expect(callCount).toBe(2);
    // Attempt 1 had thinkingConfig
    expect(bodiesReceived[0].generationConfig.thinkingConfig).toBeDefined();
    // Attempt 2 had NO thinkingConfig
    expect(bodiesReceived[1].generationConfig.thinkingConfig).toBeUndefined();

    expect(result.thinking_level).toBe('none');
    expect(result.data).toEqual({ pong: true, message: 'Thành công sau khi bỏ thinkingConfig', timestamp: 999 });
  });

  it('does not retry infinitely if 400 persists without thinking field', async () => {
    let callCount = 0;

    vi.spyOn(globalThis, 'fetch').mockImplementation(async () => {
      callCount++;
      return new Response(
        JSON.stringify({
          error: {
            code: 400,
            message: 'Invalid request: bad prompt syntax',
            status: 'INVALID_ARGUMENT',
          },
        }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    });

    await expect(callGeminiWithFallback(pingTask, {})).rejects.toThrow('Yêu cầu gửi tới dịch vụ AI không hợp lệ.');
    // Should fail immediately without unnecessary retries
    expect(callCount).toBe(1);
  });

  // =========================================================================
  // 4. Per-task Timeouts
  // =========================================================================
  it('configures shorter timeouts for fast tasks and longer for write_report', () => {
    const pingTimeout = getTaskTimeout('ping');
    const chatTimeout = getTaskTimeout('chat_explain');
    const reportTimeout = getTaskTimeout('write_report');

    expect(pingTimeout.keyTimeoutMs).toBe(15000);
    expect(pingTimeout.totalTimeoutMs).toBe(25000);
    expect(pingTimeout.clientTimeoutMs).toBe(28000);

    expect(chatTimeout.keyTimeoutMs).toBe(15000);
    expect(chatTimeout.totalTimeoutMs).toBe(25000);

    expect(reportTimeout.keyTimeoutMs).toBe(35000);
    expect(reportTimeout.totalTimeoutMs).toBe(55000);
    expect(reportTimeout.clientTimeoutMs).toBe(58000);

    // Total timeout for write_report (55s) must be strictly less than Vercel maxDuration (60s)
    expect(reportTimeout.totalTimeoutMs).toBeLessThanOrEqual(60000);
  });

  // =========================================================================
  // 5. Server Logging Sanitization: Logs thinking level & tokens without keys/prompts
  // =========================================================================
  it('logs configured thinking level and thoughtsTokenCount without exposing keys or prompts', async () => {
    const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});

    vi.spyOn(globalThis, 'fetch').mockImplementation(async () => {
      return new Response(
        JSON.stringify({
          candidates: [
            {
              content: {
                parts: [{ text: JSON.stringify({ pong: true, message: 'OK', timestamp: 1 }) }],
              },
            },
          ],
          usageMetadata: { promptTokenCount: 50, candidatesTokenCount: 25, thoughtsTokenCount: 42, totalTokenCount: 117 },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    });

    await callGeminiWithFallback(pingTask, {});

    expect(infoSpy).toHaveBeenCalled();
    const logLine = infoSpy.mock.calls[0][0];
    expect(logLine).toContain('Thinking: minimal');
    expect(logLine).toContain('thoughts: 42 tokens');
    expect(logLine).toContain('Output: 25 tokens');
    // Ensure zero leakage of secret keys or sensitive prompt parts
    expect(logLine).not.toContain(FAKE_KEY_1);
    expect(logLine).not.toContain(FAKE_KEY_2);
  });
});
