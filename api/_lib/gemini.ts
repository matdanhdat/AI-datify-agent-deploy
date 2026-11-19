import { getGeminiKeys, getGeminiModel, getGeminiModelFallback, getThinkingLevel } from './env';
import { LIMITS, getTaskTimeout } from './limits';
import type { TaskDefinition } from './tasks';

// In-memory key cooldown tracker (best-effort across function invocations)
const keyCooldowns = new Map<number, number>();

export interface GeminiCallResult {
  data: unknown;
  model: string;
  latency_ms: number;
  thinking_level: string;
  thoughts_tokens: number;
  output_tokens: number;
}

export class GeminiError extends Error {
  public readonly code: string;
  public readonly status: number;
  public readonly details: Record<string, unknown>;

  constructor(code: string, message: string, status = 502, details: Record<string, unknown> = {}) {
    super(message);
    this.name = 'GeminiError';
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

/**
 * Checks if an upstream response indicates the requested model does not exist or has been shut down.
 */
function isModelUnavailableError(status: number, errText: string): boolean {
  if (status === 404) return true;
  const lower = errText.toLowerCase();
  return (
    lower.includes('model not found') ||
    lower.includes('is not found') ||
    lower.includes('not supported') ||
    lower.includes('deprecated') ||
    lower.includes('no longer supported') ||
    lower.includes('unsupported model') ||
    lower.includes('models/')
  );
}

/**
 * Invokes Gemini REST API with dual-key fallback, dual-model fallback (primary -> fallback model),
 * JSON schema enforcement, thinking level latency optimization, and cooldown tracking.
 */
export async function callGeminiWithFallback(
  task: TaskDefinition<any, any>,
  input: any
): Promise<GeminiCallResult> {
  const keys = getGeminiKeys();
  if (keys.length === 0) {
    throw new GeminiError(
      'LLM_NOT_CONFIGURED',
      'Chưa có khóa API Gemini nào được cấu hình trên máy chủ.',
      503
    );
  }

  const primaryModel = getGeminiModel();
  const fallbackModel = getGeminiModelFallback();
  const startTime = Date.now();
  const prompt = `${task.systemPrompt}\n\n${task.buildPrompt(input)}`;
  const taskTimeout = getTaskTimeout(task.name);
  const configuredThinkingLevel = getThinkingLevel(task.name);

  // Candidate models to try in order
  const modelsToTry = [primaryModel];
  if (fallbackModel && fallbackModel !== primaryModel) {
    modelsToTry.push(fallbackModel);
  }

  const errors: Array<{ keyIndex: number; model: string; status?: number; message: string }> = [];

  for (let i = 0; i < keys.length; i++) {
    // Check key cooldown
    const cooldownUntil = keyCooldowns.get(i);
    if (cooldownUntil && Date.now() < cooldownUntil) {
      errors.push({
        keyIndex: i + 1,
        model: primaryModel,
        status: 429,
        message: 'Khóa đang trong thời gian tạm nghỉ do giới hạn tần suất (429).',
      });
      continue;
    }

    const key = keys[i];
    let modelUnavailableFailures = 0;

    modelLoop: for (const currentModel of modelsToTry) {
      let includeThinking = true;
      let attempt = 0;

      while (attempt < 2) {
        attempt++;
        const now = Date.now();
        const elapsed = now - startTime;
        const remainingTotalTime = taskTimeout.totalTimeoutMs - elapsed;
        if (remainingTotalTime <= 0) {
          throw new GeminiError(
            'LLM_TIMEOUT',
            `Quá thời gian phản hồi từ dịch vụ AI (${Math.round(taskTimeout.totalTimeoutMs / 1000)} giây).`,
            504
          );
        }

        const currentKeyTimeout = Math.min(taskTimeout.keyTimeoutMs, remainingTotalTime);
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), currentKeyTimeout);
        const keyStartTime = Date.now();

        const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
          currentModel
        )}:generateContent`;

        const generationConfig: Record<string, unknown> = {
          temperature: task.name === 'write_report' ? 0.3 : 0.2,
          maxOutputTokens: task.name === 'write_report' ? 4096 : 2048,
          responseMimeType: 'application/json',
        };

        if (includeThinking) {
          generationConfig.thinkingConfig = {
            thinkingLevel: configuredThinkingLevel,
          };
        }

        let response: Response;
        try {
          response = await fetch(endpoint, {
            method: 'POST',
            headers: {
              'x-goog-api-key': key,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              contents: [
                {
                  role: 'user',
                  parts: [{ text: prompt }],
                },
              ],
              generationConfig,
            }),
            signal: controller.signal,
          });
        } catch (fetchErr: unknown) {
          clearTimeout(timeoutId);
          if (fetchErr instanceof GeminiError) {
            throw fetchErr;
          }
          const isTimeout = fetchErr instanceof Error && fetchErr.name === 'AbortError';
          errors.push({
            keyIndex: i + 1,
            model: currentModel,
            status: isTimeout ? 504 : 502,
            message: isTimeout ? 'Timeout' : 'Network error',
          });
          break modelLoop; // Try next key
        }

        clearTimeout(timeoutId);
        const latency = Date.now() - keyStartTime;

        if (response.ok) {
          const json = await response.json();
          const candidateText =
            json.candidates?.[0]?.content?.parts?.[0]?.text || '';

          if (!candidateText) {
            throw new GeminiError(
              'LLM_BAD_OUTPUT',
              'Mô hình AI phản hồi rỗng hoặc thiếu nội dung phân tích.',
              502
            );
          }

          let parsedData: unknown;
          try {
            parsedData = JSON.parse(candidateText);
          } catch (_parseErr) {
            throw new GeminiError(
              'LLM_BAD_OUTPUT',
              'Phản hồi từ AI không phải là chuỗi JSON hợp lệ.',
              502
            );
          }

          // Validate against task output schema
          const validation = task.outputSchema.safeParse(parsedData);
          if (!validation.success) {
            throw new GeminiError(
              'LLM_BAD_OUTPUT',
              'Cấu trúc phản hồi từ AI không khớp hợp đồng dữ liệu yêu cầu.',
              502,
              { errors: validation.error.format() }
            );
          }

          const usage = json.usageMetadata || {};
          const thoughtsTokens = typeof usage.thoughtsTokenCount === 'number' ? usage.thoughtsTokenCount : 0;
          const outputTokens = typeof usage.candidatesTokenCount === 'number' ? usage.candidatesTokenCount : 0;
          const usedThinkingLevel = includeThinking ? configuredThinkingLevel : 'none';

          // Success logging (NEVER logs API keys, prompt text, or user data)
          console.info(
            `[AI Gateway] Task: ${task.name} | Key Slot: ${i + 1} | Model: ${currentModel} | Status: 200 | Latency: ${latency}ms | Thinking: ${usedThinkingLevel} (thoughts: ${thoughtsTokens} tokens) | Output: ${outputTokens} tokens`
          );

          return {
            data: validation.data,
            model: currentModel,
            latency_ms: Date.now() - startTime,
            thinking_level: usedThinkingLevel,
            thoughts_tokens: thoughtsTokens,
            output_tokens: outputTokens,
          };
        }

        // Handle non-200 responses
        const errText = await response.text().catch(() => '');

        // 1. Check if 400 is due to thinkingConfig / thinkingLevel not supported on this model
        const isThinkingError =
          response.status === 400 &&
          includeThinking &&
          attempt === 1 &&
          (errText.includes('thinkingConfig') ||
            errText.includes('thinking_config') ||
            errText.includes('thinkingLevel') ||
            errText.includes('thinking_level') ||
            (errText.includes('thinking') &&
              (errText.includes('not supported') ||
                errText.includes('Unknown name') ||
                errText.includes('Cannot find field') ||
                errText.includes('INVALID_ARGUMENT'))));

        if (isThinkingError) {
          console.warn(
            `[AI Gateway] Model ${currentModel} không hỗ trợ trường suy nghĩ (thinkingLevel). Thử lại đúng một lần không kèm trường suy nghĩ.`
          );
          includeThinking = false;
          continue; // Single retry without thinkingConfig
        }

        // 2. Check if the model is unavailable / deprecated / 404
        if (isModelUnavailableError(response.status, errText)) {
          modelUnavailableFailures++;
          errors.push({
            keyIndex: i + 1,
            model: currentModel,
            status: response.status,
            message: `Model ${currentModel} unavailable: ${errText.slice(0, 100)}`,
          });
          console.warn(
            `[AI Gateway] Model ${currentModel} unavailable (${response.status}). Trying next model if available.`
          );
          break; // Try next model on this same key
        }

        // 3. 429 Rate limit is a key/quota issue, NOT a model error
        if (response.status === 429) {
          keyCooldowns.set(i, Date.now() + LIMITS.KEY_COOLDOWN_MS);
          errors.push({ keyIndex: i + 1, model: currentModel, status: 429, message: 'Rate limit (429)' });
          console.warn(`[AI Gateway] Key ${i + 1} hit 429 rate limit. Cooling down 60s.`);
          break modelLoop; // Move to next key slot
        }

        // 4. Other 400 errors
        if (response.status === 400) {
          if (errText.includes('API_KEY_INVALID') || errText.includes('key not valid')) {
            errors.push({ keyIndex: i + 1, model: currentModel, status: 400, message: 'Invalid API Key' });
            break modelLoop; // Try next key
          }
          throw new GeminiError(
            'LLM_BAD_INPUT',
            'Yêu cầu gửi tới dịch vụ AI không hợp lệ.',
            400,
            { raw: errText.slice(0, 200) }
          );
        }

        if (response.status === 401 || response.status === 403) {
          errors.push({ keyIndex: i + 1, model: currentModel, status: response.status, message: 'Auth failure' });
          break modelLoop; // Try next key
        }

        // Upstream server errors (5xx)
        errors.push({
          keyIndex: i + 1,
          model: currentModel,
          status: response.status,
          message: `Upstream error ${response.status}`,
        });
        break modelLoop; // Try next key
      }
    }

    // If both primary and fallback models were unavailable on this key
    if (modelUnavailableFailures >= modelsToTry.length) {
      throw new GeminiError(
        'LLM_MODEL_UNAVAILABLE',
        'Model AI được cấu hình không còn hoạt động. Hãy cập nhật GEMINI_MODEL trong cài đặt.',
        503,
        { modelsTried: modelsToTry }
      );
    }
  }

  // If all configured keys failed
  const allRateLimited = errors.length > 0 && errors.every((e) => e.status === 429);
  const allTimeout = errors.length > 0 && errors.every((e) => e.status === 504);

  if (allRateLimited) {
    throw new GeminiError(
      'LLM_RATE_LIMITED',
      'Tất cả các khóa API đều đã vượt hạn mức tần suất (429). Vui lòng thử lại sau 1 phút.',
      429,
      { retry_after_sec: 60 }
    );
  }

  if (allTimeout) {
    throw new GeminiError(
      'LLM_TIMEOUT',
      'Quá thời gian phản hồi từ dịch vụ AI (hết hạn thời gian chờ).',
      504
    );
  }

  throw new GeminiError(
    'LLM_UPSTREAM_ERROR',
    'Không thể kết nối thành công tới dịch vụ AI của Google.',
    502,
    { attempts: errors }
  );
}
