/**
 * Standard Pipeline Matcher (Prompt P6 Section 8.5)
 * Pure deterministic rule checker.
 * If user request asks for metrics/charts already present in the standard pipeline,
 * guides the user to standard views rather than constructing a redundant custom plan.
 */

export interface StandardMatchResult {
  matched: boolean;
  message_vi?: string;
  metric_key?: string;
  target_view?: 'analyze' | 'report';
}

export function matchStandard(request: string): StandardMatchResult {
  const norm = (request || '').trim().toLowerCase();

  if (!norm) {
    return { matched: false };
  }

  // 1. RSI
  if (/\brsi\b|relative strength index|chỉ số rsi/i.test(norm)) {
    return {
      matched: true,
      message_vi: 'Chỉ số RSI 14 phiên đã được tính toán sẵn cho từng mã trong quy trình chuẩn. Bạn có thể xem chỉ số RSI tại biểu đồ chỉ báo kỹ thuật trên trang Phân tích hoặc trang Báo cáo.',
      metric_key: 'rsi_14',
      target_view: 'analyze',
    };
  }

  // 2. SMA / MA 20 / MA 50
  if (/\b(sma|ma)\s*(20|50)\b|đường trung bình động|đường sma|đường ma/i.test(norm)) {
    return {
      matched: true,
      message_vi: 'Đường trung bình động SMA 20 và SMA 50 phiên đã được vẽ sẵn trực tiếp trên biểu đồ giá và khối lượng của từng mã cổ phiếu trong quy trình chuẩn.',
      metric_key: 'sma_20',
      target_view: 'analyze',
    };
  }

  // 3. Max Drawdown
  if (/sụt giảm tối đa|max drawdown|\bmax_dd\b|mức giảm sâu nhất|mức giảm lớn nhất/i.test(norm)) {
    return {
      matched: true,
      message_vi: 'Mức sụt giảm tối đa (Max Drawdown) và thời gian phục hồi đã có sẵn trong bảng chỉ số rủi ro và biểu đồ sụt giảm tích lũy trên trang Phân tích / Báo cáo.',
      metric_key: 'max_drawdown',
      target_view: 'analyze',
    };
  }

  // 4. Sharpe Ratio
  if (/tỷ số sharpe|tỷ suất sharpe|\bsharpe\b|sharpe ratio/i.test(norm)) {
    return {
      matched: true,
      message_vi: 'Tỷ số Sharpe (tính theo lãi suất phi rủi ro 4,5%/năm) đã được tính sẵn cho toàn bộ các mã trong bảng tổng hợp chỉ số rủi ro.',
      metric_key: 'sharpe_ratio',
      target_view: 'analyze',
    };
  }

  // 5. Annualized Volatility
  if (/biến động năm hóa|biến động hàng năm|độ biến động năm|annualized volatility/i.test(norm)) {
    return {
      matched: true,
      message_vi: 'Độ biến động năm hóa (chuẩn hóa 252 phiên giao dịch) đã được tính toán và hiển thị tại thẻ KPI và bảng phân tích rủi ro trong quy trình chuẩn.',
      metric_key: 'annualized_volatility',
      target_view: 'analyze',
    };
  }

  // 6. Correlation Matrix
  if (/ma trận tương quan|tương quan cặp mã|hệ số tương quan giữa các mã/i.test(norm)) {
    return {
      matched: true,
      message_vi: 'Biểu đồ nhiệt tương quan cặp mã (Correlation Matrix Heatmap) đã được tính toán tự động khi danh mục có từ 2 mã cổ phiếu trở lên trên trang Phân tích.',
      metric_key: 'correlation_matrix',
      target_view: 'analyze',
    };
  }

  // 7. Best performer / ranking
  if (/mã nào (tăng|lợi suất|lời|lãi) (cao|nhiều|nhất)|top mã tăng trưởng/i.test(norm)) {
    return {
      matched: true,
      message_vi: 'Bảng xếp hạng lợi suất và thẻ KPI "Mã hiệu suất tốt nhất" (Top Performer) đã có sẵn trên trang Phân tích và trang Báo cáo.',
      metric_key: 'top_performer',
      target_view: 'analyze',
    };
  }

  return { matched: false };
}

