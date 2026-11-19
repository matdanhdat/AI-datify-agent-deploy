import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { handleAi, handleHealth } from './handler';

const ORIGINAL_ENV = process.env;

describe('AI Gateway & Serverless Handlers (/api/health and /api/ai)', () => {
  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV };
    process.env.GEMINI_API_KEY_1 = 'MOCK_KEY_1_ABC123';
    process.env.GEMINI_API_KEY_2 = 'MOCK_KEY_2_XYZ789';
    process.env.GEMINI_MODEL = 'gemini-3.5-flash-lite';
    process.env.GEMINI_MODEL_FALLBACK = 'gemini-3.8-flash';
    vi.restoreAllMocks();
  });

  afterEach(() => {
    process.env = ORIGINAL_ENV;
    vi.restoreAllMocks();
  });

  it('GET /api/health returns safe status with primary & fallback models without leaking keys', async () => {
    const req = new Request('http://localhost:5173/api/health', { method: 'GET' });
    const res = await handleHealth(req);

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.status).toBe('ok');
    expect(json.app_name).toBe('Datify AI Agent');
    expect(json.ai_mode).toBe('ai');
    expect(json.llm_key_slots).toBe(2);
    expect(json.llm_model).toBe('gemini-3.5-flash-lite');
    expect(json.llm_model_fallback).toBe('gemini-3.8-flash');

    // INVARIANT 6: API keys MUST NEVER appear in health response
    const rawText = JSON.stringify(json);
    expect(rawText).not.toContain('MOCK_KEY_1');
    expect(rawText).not.toContain('MOCK_KEY_2');
  });

  it('GET /api/health reflects fallback mode when zero keys configured', async () => {
    delete process.env.GEMINI_API_KEY_1;
    delete process.env.GEMINI_API_KEY_2;

    const req = new Request('http://localhost:5173/api/health', { method: 'GET' });
    const res = await handleHealth(req);

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ai_mode).toBe('fallback');
    expect(json.llm_key_slots).toBe(0);
  });

  it('POST /api/ai successfully executes ping task with mock upstream', async () => {
    const mockGeminiSuccess = {
      candidates: [
        {
          content: {
            parts: [
              {
                text: JSON.stringify({
                  pong: true,
                  message: 'Datify AI Agent chào bạn! Kết nối AI hoạt động tốt.',
                  timestamp: 12345678,
                }),
              },
            ],
          },
        },
      ],
    };

    vi.spyOn(globalThis, 'fetch').mockImplementation(async () => {
      return new Response(JSON.stringify(mockGeminiSuccess), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    });

    const req = new Request('http://localhost:5173/api/ai', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Host: 'localhost:5173',
      },
      body: JSON.stringify({
        task: 'ping',
        input: { timestamp: 12345678 },
      }),
    });

    const res = await handleAi(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.task).toBe('ping');
    expect(json.data.pong).toBe(true);
    expect(json.data.message).toContain('Datify AI Agent');
    expect(json.model).toBe('gemini-3.5-flash-lite');
    expect(json.latency_ms).toBeGreaterThanOrEqual(0);
  });

  it('falls back to secondary model when primary model returns 404 NOT_FOUND', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (url: any) => {
      const urlStr = String(url);
      if (urlStr.includes('gemini-3.5-flash-lite')) {
        return new Response(
          JSON.stringify({ error: { code: 404, message: 'models/gemini-3.5-flash-lite is not found or deprecated' } }),
          { status: 404, headers: { 'Content-Type': 'application/json' } }
        );
      }
      // Fallback model succeeds
      return new Response(
        JSON.stringify({
          candidates: [
            {
              content: {
                parts: [
                  {
                    text: JSON.stringify({
                      pong: true,
                      message: 'Phản hồi từ mô hình dự phòng gemini-3.8-flash.',
                      timestamp: 12345678,
                    }),
                  },
                ],
              },
            },
          ],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    });

    const req = new Request('http://localhost:5173/api/ai', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Host: 'localhost:5173' },
      body: JSON.stringify({ task: 'ping', input: { timestamp: 12345678 } }),
    });

    const res = await handleAi(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.model).toBe('gemini-3.8-flash');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('returns 503 LLM_MODEL_UNAVAILABLE when both primary and fallback models fail with 404', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () => {
      return new Response(
        JSON.stringify({ error: { code: 404, message: 'models/model is not found' } }),
        { status: 404, headers: { 'Content-Type': 'application/json' } }
      );
    });

    const req = new Request('http://localhost:5173/api/ai', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Host: 'localhost:5173' },
      body: JSON.stringify({ task: 'ping', input: {} }),
    });

    const res = await handleAi(req);
    expect(res.status).toBe(503);
    const json = await res.json();
    expect(json.code).toBe('LLM_MODEL_UNAVAILABLE');
    expect(json.message_vi).toContain('Model AI được cấu hình không còn hoạt động');
  });

  it('falls back to Key 2 when Key 1 encounters 429 rate limit (does not confuse 429 with model error)', async () => {
    let callCount = 0;
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (_url, init: any) => {
      callCount++;
      const apiKey = init.headers['x-goog-api-key'];

      if (apiKey === 'MOCK_KEY_1_ABC123') {
        return new Response('Resource has been exhausted (e.g. check quota)', {
          status: 429,
          headers: { 'Content-Type': 'text/plain' },
        });
      }

      return new Response(
        JSON.stringify({
          candidates: [
            {
              content: {
                parts: [
                  {
                    text: JSON.stringify({
                      pong: true,
                      message: 'Phục hồi thành công trên khóa 2!',
                      timestamp: 9999,
                    }),
                  },
                ],
              },
            },
          ],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    });

    const req = new Request('http://localhost:5173/api/ai', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Host: 'localhost:5173' },
      body: JSON.stringify({ task: 'ping', input: {} }),
    });

    const res = await handleAi(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.data.message).toContain('khóa 2');
    expect(callCount).toBe(2);
  });

  it('rejects with 503 LLM_NOT_CONFIGURED when no keys are present', async () => {
    delete process.env.GEMINI_API_KEY_1;
    delete process.env.GEMINI_API_KEY_2;

    const req = new Request('http://localhost:5173/api/ai', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Host: 'localhost:5173' },
      body: JSON.stringify({ task: 'ping', input: {} }),
    });

    const res = await handleAi(req);
    expect(res.status).toBe(503);
    const json = await res.json();
    expect(json.code).toBe('LLM_NOT_CONFIGURED');
  });

  it('rejects unknown task with 400 LLM_UNKNOWN_TASK', async () => {
    const req = new Request('http://localhost:5173/api/ai', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Host: 'localhost:5173' },
      body: JSON.stringify({ task: 'malicious_free_chat', input: {} }),
    });

    const res = await handleAi(req);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.code).toBe('LLM_UNKNOWN_TASK');
  });

  it('rejects payload larger than 64 KB with 413 LLM_PAYLOAD_TOO_LARGE', async () => {
    const hugeInput = 'x'.repeat(70 * 1024);
    const req = new Request('http://localhost:5173/api/ai', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': String(hugeInput.length),
        Host: 'localhost:5173',
      },
      body: JSON.stringify({ task: 'ping', input: { text: hugeInput } }),
    });

    const res = await handleAi(req);
    expect(res.status).toBe(413);
    const json = await res.json();
    expect(json.code).toBe('LLM_PAYLOAD_TOO_LARGE');
  });

  it('rejects cross-site request with 403', async () => {
    const req = new Request('http://localhost:5173/api/ai', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Sec-Fetch-Site': 'cross-site',
        Host: 'localhost:5173',
      },
      body: JSON.stringify({ task: 'ping', input: {} }),
    });

    const res = await handleAi(req);
    expect(res.status).toBe(403);
  });

  it('POST /api/ai with write_report validates schema and rejects invalid input with 400 LLM_BAD_INPUT', async () => {
    const req = new Request('http://localhost:5173/api/ai', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Host: 'localhost:5173',
      },
      body: JSON.stringify({
        task: 'write_report',
        input: {
          config: { symbols: [] }, // Invalid: min 1 symbol required
          metrics: [],
        },
      }),
    });

    const res = await handleAi(req);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.code).toBe('LLM_BAD_INPUT');
  });

  it('rejects GET method on /api/ai with 405 Method Not Allowed', async () => {
    const req = new Request('http://localhost:5173/api/ai', { method: 'GET' });
    const res = await handleAi(req);
    expect(res.status).toBe(405);
  });
});
