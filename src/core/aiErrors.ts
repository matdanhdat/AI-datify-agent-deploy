/**
 * AI Error Formatting & User Guidance for Non-Programmers (Prompt P6.1 Section 3).
 * Formats every LLM_* error code into a clear, jargon-free message
 * with code in parentheses, root cause explanation, and actionable remediation hint.
 * For LLM_BAD_INPUT, displays erroneous field paths and short reasons (NEVER field values).
 */

import { AppError } from './errors';

export interface FormattedAiError {
  code: string;
  message_vi: string;
  hint_vi: string;
  invalid_fields: string[];
  field_paths: string[];
  user_display: string;
}

const AI_ERROR_HINTS: Record<string, { summary_vi: string; hint_vi: string }> = {
  LLM_NOT_CONFIGURED: {
    summary_vi: 'Chưa cấu hình khóa API Gemini nào trên máy chủ.',
    hint_vi: 'Cách khắc phục: Cấu hình khóa API trong tệp .env.local (chạy cục bộ) hoặc trong Settings > Environment Variables trên Vercel rồi triển khai lại.',
  },
  LLM_BAD_INPUT: {
    summary_vi: 'Tham số yêu cầu gửi tới dịch vụ AI không đúng cấu trúc quy định.',
    hint_vi: 'Cách khắc phục: Kiểm tra lại các trường thông tin đầu vào bị báo lỗi, hoặc làm mới trang web để tải lại cấu trúc dữ liệu mới nhất.',
  },
  LLM_BAD_OUTPUT: {
    summary_vi: 'Mô hình AI trả về kết quả không khớp cấu trúc dữ liệu yêu cầu hoặc sai lệch kiểm chứng số liệu.',
    hint_vi: 'Cách khắc phục: Bấm thử lại lần nữa. Hệ thống đã tự động chuyển sang chế độ mẫu câu an toàn để không làm gián đoạn công việc.',
  },
  LLM_RATE_LIMITED: {
    summary_vi: 'Đã vượt quá hạn mức gọi AI từ Google Gemini (tối đa 15 yêu cầu/phút của gói miễn phí).',
    hint_vi: 'Cách khắc phục: Vui lòng đợi khoảng 60 giây để hạn mức hồi phục, hoặc cấu hình thêm Khóa dự phòng thứ hai thuộc một Dự án Google Cloud riêng biệt.',
  },
  LLM_TIMEOUT: {
    summary_vi: 'Yêu cầu tới cổng AI đã quá thời gian chờ (50 giây).',
    hint_vi: 'Cách khắc phục: Kiểm tra lại đường truyền internet của bạn, hoặc máy chủ Google đang quá tải. Hãy thử lại sau ít phút.',
  },
  LLM_MODEL_UNAVAILABLE: {
    summary_vi: 'Mô hình AI hiện tại không khả dụng hoặc đã ngừng hoạt động từ Google.',
    hint_vi: 'Cách khắc phục: Kiểm tra lại cấu hình mô hình AI trong biến môi trường hoặc hệ thống sẽ tự động dùng mô hình dự phòng gemini-3.8-flash.',
  },
  LLM_PAYLOAD_TOO_LARGE: {
    summary_vi: 'Kích thước dữ liệu gửi lên cổng AI vượt quá giới hạn an toàn (64 KB).',
    hint_vi: 'Cách khắc phục: Giảm bớt số lượng mã cổ phiếu đang chọn phân tích hoặc rút ngắn khoảng thời gian khảo sát.',
  },
  LLM_UNKNOWN_TASK: {
    summary_vi: 'Tác vụ AI yêu cầu không tồn tại trong danh mục được hỗ trợ.',
    hint_vi: 'Cách khắc phục: Phiên bản ứng dụng có thể chưa đồng bộ. Hãy xóa bộ nhớ đệm trình duyệt hoặc khởi động lại ứng dụng.',
  },
  LLM_UPSTREAM_ERROR: {
    summary_vi: 'Máy chủ Google Gemini gặp sự cố gián đoạn phản hồi (5xx).',
    hint_vi: 'Cách khắc phục: Đây là sự cố tạm thời từ phía Google AI Studio. Vui lòng đợi từ 1 đến 2 phút rồi nhấn kiểm tra lại.',
  },
};

/**
 * Extracts human-readable field paths and reasons without printing sensitive values.
 */
function extractInvalidFields(details?: any): { invalid_fields: string[]; field_paths: string[] } {
  if (!details) return { invalid_fields: [], field_paths: [] };

  if (Array.isArray(details.invalid_fields) && details.invalid_fields.length > 0) {
    return {
      invalid_fields: details.invalid_fields,
      field_paths: Array.isArray(details.field_paths) ? details.field_paths : [],
    };
  }

  const invalid_fields: string[] = [];
  const field_paths: string[] = [];

  // Parse Zod format() object if present
  if (details.errors && typeof details.errors === 'object') {
    const walk = (obj: any, currentPath: string) => {
      if (!obj || typeof obj !== 'object') return;
      if (Array.isArray(obj._errors) && obj._errors.length > 0) {
        const p = currentPath || 'root';
        field_paths.push(p);
        invalid_fields.push(`${p} (${obj._errors.join(', ')})`);
      }
      for (const [key, val] of Object.entries(obj)) {
        if (key === '_errors') continue;
        walk(val, currentPath ? `${currentPath}.${key}` : key);
      }
    };
    walk(details.errors, '');
  }

  // Also check raw string details (e.g. from Google 400 response)
  if (invalid_fields.length === 0 && details.raw && typeof details.raw === 'string') {
    // Extract field name from message like: Unknown name "thinking_config" at 'generation_config'
    const unknownFieldMatch = details.raw.match(/Unknown name "([^"]+)"/);
    if (unknownFieldMatch) {
      const fieldName = unknownFieldMatch[1];
      field_paths.push(fieldName);
      invalid_fields.push(`${fieldName} (trường không được hỗ trợ)`);
    }
  }

  return { invalid_fields, field_paths };
}

/**
 * Formats any caught error into a structured user-facing guidance object.
 */
export function formatAiError(err: unknown): FormattedAiError {
  let code = 'LLM_UPSTREAM_ERROR';
  let message_vi = '';
  let details: any = {};

  if (err instanceof AppError) {
    code = err.code || 'LLM_UPSTREAM_ERROR';
    message_vi = err.message_vi || err.message;
    details = err.details || {};
  } else if (err instanceof Error) {
    message_vi = err.message;
    if ((err as any).code) code = (err as any).code;
  } else if (typeof err === 'string') {
    message_vi = err;
  }

  const hintObj = AI_ERROR_HINTS[code] || {
    summary_vi: message_vi || 'Đã xảy ra lỗi khi giao tiếp với dịch vụ AI.',
    hint_vi: 'Cách khắc phục: Vui lòng kiểm tra lại kết nối mạng và thử lại sau ít phút.',
  };

  const finalSummary = message_vi || hintObj.summary_vi;
  const { invalid_fields, field_paths } = extractInvalidFields(details);

  // Construct readable multi-line message for the user interface
  let user_display = `${finalSummary} (mã ${code})`;
  if (invalid_fields.length > 0) {
    user_display += `\nTrường lỗi: ${invalid_fields.join(', ')}`;
  }
  user_display += `\nGợi ý: ${hintObj.hint_vi}`;

  return {
    code,
    message_vi: finalSummary,
    hint_vi: hintObj.hint_vi,
    invalid_fields,
    field_paths,
    user_display,
  };
}
