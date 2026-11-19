import { getGeminiModel, getGeminiModelFallback, getKeySlots } from './env';
import { callGeminiWithFallback, GeminiError } from './gemini';
import { LIMITS } from './limits';
import { getTask } from './tasks';

// In-memory rate limiting tracker (per IP)
interface IpRateRecord {
  minuteCount: number;
  minuteReset: number;
  hourCount: number;
  hourReset: number;
}
const ipRateMap = new Map<string, IpRateRecord>();

function getClientIp(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) {
    return forwarded.split(',')[0].trim();
  }
  return request.headers.get('x-real-ip') || '127.0.0.1';
}

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  let record = ipRateMap.get(ip);

  if (!record) {
    record = {
      minuteCount: 1,
      minuteReset: now + 60000,
      hourCount: 1,
      hourReset: now + 3600000,
    };
    ipRateMap.set(ip, record);
    return true;
  }

  // Reset minute window if expired
  if (now > record.minuteReset) {
    record.minuteCount = 0;
    record.minuteReset = now + 60000;
  }

  // Reset hour window if expired
  if (now > record.hourReset) {
    record.hourCount = 0;
    record.hourReset = now + 3600000;
  }

  record.minuteCount++;
  record.hourCount++;

  if (
    record.minuteCount > LIMITS.RATE_LIMIT_PER_MINUTE ||
    record.hourCount > LIMITS.RATE_LIMIT_PER_HOUR
  ) {
    return false;
  }

  return true;
}

function isSameOrigin(request: Request): boolean {
  // Allow requests without Origin (e.g. direct server-to-server or tests)
  const origin = request.headers.get('origin');
  const secFetchSite = request.headers.get('sec-fetch-site');

  if (secFetchSite === 'cross-site') {
    return false;
  }

  if (!origin) return true;

  try {
    const originUrl = new URL(origin);
    const reqUrl = new URL(request.url);
    const host = request.headers.get('host') || reqUrl.host || '';
    if (originUrl.host === host) return true;

    // Local loopback equivalence (localhost, 127.0.0.1, 0.0.0.0) on the same port
    const originHostName = originUrl.hostname;
    const originPort = originUrl.port || (originUrl.protocol === 'https:' ? '443' : '80');
    const [reqHostName, reqPort = originUrl.protocol === 'https:' ? '443' : '80'] = host.split(':');

    const isLocalhost = (h: string) => h === 'localhost' || h === '127.0.0.1' || h === '0.0.0.0';
    if (isLocalhost(originHostName) && isLocalhost(reqHostName) && originPort === reqPort) {
      return true;
    }

    return false;
  } catch (_e) {
    return false;
  }
}

function jsonResponse(data: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
      ...headers,
    },
  });
}

/**
 * Handles GET /api/health
 */
export async function handleHealth(request: Request): Promise<Response> {
  if (request.method !== 'GET') {
    return jsonResponse(
      {
        code: 'METHOD_NOT_ALLOWED',
        message_vi: 'Chỉ chấp nhận phương thức GET.',
        details: {},
      },
      405,
      { Allow: 'GET' }
    );
  }

  const keySlots = getKeySlots();
  const model = getGeminiModel();
  const modelFallback = getGeminiModelFallback();

  return jsonResponse({
    status: 'ok',
    app_name: 'Datify AI Agent',
    version: '0.2.0',
    ai_mode: keySlots > 0 ? 'ai' : 'fallback',
    llm_provider: 'gemini',
    llm_model: model,
    llm_model_fallback: modelFallback,
    llm_key_slots: keySlots,
  });
}

/**
 * Handles POST /api/ai
 */
export async function handleAi(request: Request): Promise<Response> {
  if (request.method !== 'POST') {
    return jsonResponse(
      {
        code: 'METHOD_NOT_ALLOWED',
        message_vi: 'Chỉ chấp nhận phương thức POST với Content-Type: application/json.',
        details: {},
      },
      405,
      { Allow: 'POST' }
    );
  }

  // Same-origin check
  if (!isSameOrigin(request)) {
    return jsonResponse(
      {
        code: 'FORBIDDEN',
        message_vi: 'Cổng AI chỉ chấp nhận yêu cầu từ cùng nguồn gốc trang web.',
        details: {},
      },
      403
    );
  }

  // Rate limit check
  const ip = getClientIp(request);
  if (!checkRateLimit(ip)) {
    return jsonResponse(
      {
        code: 'LLM_RATE_LIMITED',
        message_vi: 'Bạn đã gửi quá nhiều yêu cầu trong thời gian ngắn. Vui lòng thử lại sau 1 phút.',
        details: { limit_per_minute: LIMITS.RATE_LIMIT_PER_MINUTE },
      },
      429,
      { 'Retry-After': '60' }
    );
  }

  // Payload size check
  const contentLengthHeader = request.headers.get('content-length');
  if (contentLengthHeader) {
    const len = parseInt(contentLengthHeader, 10);
    if (!isNaN(len) && len > LIMITS.MAX_PAYLOAD_BYTES) {
      return jsonResponse(
        {
          code: 'LLM_PAYLOAD_TOO_LARGE',
          message_vi: `Kích thước dữ liệu vượt quá giới hạn cho phép (${Math.round(
            LIMITS.MAX_PAYLOAD_BYTES / 1024
          )} KB).`,
          details: { max_bytes: LIMITS.MAX_PAYLOAD_BYTES },
        },
        413
      );
    }
  }

  let body: any;
  try {
    body = await request.json();
  } catch (_e) {
    return jsonResponse(
      {
        code: 'BAD_REQUEST',
        message_vi: 'Nội dung yêu cầu không phải định dạng JSON hợp lệ.',
        details: {},
      },
      400
    );
  }

  const { task, input } = body || {};

  if (!task || typeof task !== 'string') {
    return jsonResponse(
      {
        code: 'LLM_UNKNOWN_TASK',
        message_vi: 'Tác vụ AI không được cung cấp hoặc không hợp lệ.',
        details: {},
      },
      400
    );
  }

  const taskDef = getTask(task);
  if (!taskDef) {
    return jsonResponse(
      {
        code: 'LLM_UNKNOWN_TASK',
        message_vi: `Tác vụ AI '${task}' không được hỗ trợ trong hệ thống.`,
        details: { task },
      },
      400
    );
  }

  // Validate task input schema
  const parsedInput = taskDef.inputSchema.safeParse(input || {});
  if (!parsedInput.success) {
    const errorDetails = parsedInput.error.errors.map((e) => ({
      path: e.path.join('.'),
      message: e.message,
    }));
    const invalidFields = errorDetails.map((e) => `${e.path || 'input'} (${e.message})`);
    const fieldPaths = errorDetails.map((e) => e.path || 'input');

    console.warn(
      `[AI Gateway] Task: ${task} | Status: 400 | Error: LLM_BAD_INPUT | Fields: [${fieldPaths.join(', ')}]`
    );

    return jsonResponse(
      {
        code: 'LLM_BAD_INPUT',
        message_vi: 'Tham số đầu vào của tác vụ AI không đúng cấu trúc yêu cầu.',
        details: {
          errors: parsedInput.error.format(),
          invalid_fields: invalidFields,
          field_paths: fieldPaths,
        },
      },
      400
    );
  }

  // Check key slots
  if (getKeySlots() === 0) {
    console.warn(`[AI Gateway] Task: ${task} | Status: 503 | Error: LLM_NOT_CONFIGURED`);
    return jsonResponse(
      {
        code: 'LLM_NOT_CONFIGURED',
        message_vi: 'Chưa có khóa API Gemini nào được cấu hình trên máy chủ.',
        details: {},
      },
      503
    );
  }

  try {
    const result = await callGeminiWithFallback(taskDef, parsedInput.data);
    console.log(
      `[AI Gateway] Task: ${taskDef.name} | Status: 200 | Latency: ${result.latency_ms}ms | Model: ${result.model} | Thinking: ${result.thinking_level}`
    );
    return jsonResponse({
      ok: true,
      task: taskDef.name,
      data: result.data,
      model: result.model,
      latency_ms: result.latency_ms,
      thinking_level: result.thinking_level,
      thoughts_tokens: result.thoughts_tokens,
      output_tokens: result.output_tokens,
    });
  } catch (err: unknown) {
    if (err instanceof GeminiError) {
      console.warn(
        `[AI Gateway] Task: ${taskDef.name} | Status: ${err.status} | Error: ${err.code}`
      );
      return jsonResponse(
        {
          code: err.code,
          message_vi: err.message,
          details: err.details,
        },
        err.status
      );
    }

    console.error(`[AI Gateway] Task: ${taskDef.name} | Status: 502 | Error: LLM_UPSTREAM_ERROR`);
    return jsonResponse(
      {
        code: 'LLM_UPSTREAM_ERROR',
        message_vi: 'Lỗi không xác định khi liên lạc với cổng AI.',
        details: {},
      },
      502
    );
  }
}

