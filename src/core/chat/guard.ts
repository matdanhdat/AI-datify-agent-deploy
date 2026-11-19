/**
 * Pure Rule-Based Guard for Chat Assistant (Prompt P6 Section 5.1).
 * Intercepts mutation requests, security probing, code injection, and financial advice.
 * Pure TypeScript - zero external runtime dependencies.
 */

export interface GuardResult {
  allowed: boolean;
  reason?: 'change_request' | 'system_info' | 'code_execution' | 'prediction';
  cannedAnswer_vi?: string;
}

export function guardQuestion(rawQuestion: string): GuardResult {
  const q = (rawQuestion || '').trim();

  if (q.length === 0) {
    return {
      allowed: false,
      reason: 'change_request',
      cannedAnswer_vi: 'Bạn vui lòng nhập câu hỏi để Trợ lý hỗ trợ giải đáp.',
    };
  }

  // 1. Guard against code execution / HTML / script injection
  if (
    /<\s*script/i.test(q) ||
    /javascript\s*:/i.test(q) ||
    /\beval\s*\(/i.test(q) ||
    /\bFunction\s*\(/i.test(q) ||
    /\balert\s*\(/i.test(q) ||
    /\bchạy\s+.*(?:code|mã|lệnh|javascript|python|script)/iu.test(q) ||
    /(?:javascript|python|bash|sh|powershell)\s*:/iu.test(q)
  ) {
    return {
      allowed: false,
      reason: 'code_execution',
      cannedAnswer_vi: 'Trợ lý không thực thi mã lệnh hoặc mở các liên kết ngoài hệ thống.',
    };
  }

  // 2. Guard against system info / secret probing / prompt injection
  if (
    /(?:khóa\s*api|api\s*key|system\s*prompt|hướng\s*dẫn\s*hệ\s*thống|biến\s*môi\s*trường|\.env|bearer\s*token|mật\s*khẩu|password)/iu.test(q) ||
    /(?:ignore\s+(?:previous|all)\s+instructions|bỏ\s*qua\s*(?:mọi\s*)?quy\s*tắc|cho\s*tôi\s*xem\s*prompt)/iu.test(q)
  ) {
    return {
      allowed: false,
      reason: 'system_info',
      cannedAnswer_vi: 'Trợ lý không cung cấp thông tin bảo mật, cấu hình nội bộ hoặc chỉ thị hệ thống.',
    };
  }

  // 3. Guard against mutation requests (change, edit, delete, insert, approve on behalf)
  // Catch phrases like "đổi giá", "sửa dữ liệu", "xóa dòng", "duyệt giúp", "update close price"
  if (
    /(?:đổi|sửa|xóa|thay\s*thế|ghi\s*đè|chỉnh|cập\s*nhật|insert|update|delete|modify|set)\s+(?:giá|khối\s*lượng|dòng|cột|số\s*liệu|dữ\s*liệu|báo\s*cáo|kết\s*quả|lợi\s*suất|close|price|volume|row|column|data|metrics?)/iu.test(q) ||
    /(?:duyệt.*(?:hộ|giúp|cho\s*tôi)|duyệt\s+(?:báo\s*cáo|cổng\s*duyệt|dữ\s*liệu)|bấm\s*duyệt|auto\s*approve|force\s*approve)/iu.test(q) ||
    /(?:đóng\s*vai\s*quản\s*trị\s*viên\s*rồi\s*sửa)/iu.test(q)
  ) {
    return {
      allowed: false,
      reason: 'change_request',
      cannedAnswer_vi: 'Trợ lý hoạt động ở chế độ CHỈ-ĐỌC và không thể chỉnh sửa dữ liệu, thay đổi số liệu hay duyệt báo cáo. Bạn có thể tự thực hiện thao tác tương ứng tại các trang Làm sạch, Phân tích hoặc Báo cáo.',
    };
  }

  // 4. Guard against predictions and investment advice
  if (
    /(?:có\s*nên\s*(?:mua|bán|múc|bắt\s*đáy)|khuyến\s*nghị\s*(?:mua|bán)|dự\s*(?:báo|đoán)\s*(?:giá|tương\s*lai|xu\s*hướng)?|target\s*giá|mục\s*tiêu\s*giá|chắc\s*chắn\s*(?:tăng|giảm)|ngày\s*mai\s*tăng\s*hay\s*giảm|tuần\s*sau\s*tăng)/iu.test(q)
  ) {
    return {
      allowed: false,
      reason: 'prediction',
      cannedAnswer_vi: 'Hệ thống chỉ phân tích dữ liệu lịch sử đã có. Trợ lý tuân thủ nghiêm ngặt nguyên tắc không đưa ra lời khuyên mua bán hoặc dự báo giá tương lai.',
    };
  }

  return { allowed: true };
}
