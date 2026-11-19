/**
 * Local Rule-Based Chat Assistant (Prompt P6 Section 4).
 * Delivers instant, deterministic, zero-dependency answers for common questions without calling LLM.
 * Pure TypeScript - zero external runtime dependencies.
 * All numeric values embedded in answers strictly come from metricSpec/context.
 */

import { METRIC_DEFINITIONS } from '../metrics/metricSpec';
import type { ChatContext } from './context';
import { REQUIRED_COLUMNS, DEFAULT_LIMITS } from '../validator/schemaSpec';

export interface LocalAnswerResult {
  intent:
    | 'explain_metric'
    | 'explain_color'
    | 'next_step'
    | 'why_rejected'
    | 'file_format'
    | 'where_is'
    | 'explain_cleaning_op'
    | 'glossary'
    | 'unknown';
  answer_vi: string;
  evidence: string[];
  source: 'local';
  targetPage?: string;
}

/**
 * Metric alias dictionary mapping popular keywords/synonyms to metric IDs.
 */
const METRIC_ALIASES: Record<string, string> = {
  sharpe: 'sharpe',
  'chỉ số sharpe': 'sharpe',
  mdd: 'max_dd',
  'sụt giảm tối đa': 'max_dd',
  'drawdown': 'max_dd',
  'sụt giảm': 'max_dd',
  'lợi suất': 'period_return',
  'lợi suất cả kỳ': 'period_return',
  'tỷ suất sinh lời': 'period_return',
  'biến động': 'ann_vol',
  'biến động năm hóa': 'ann_vol',
  'độ lệch chuẩn': 'ann_vol',
  'volatility': 'ann_vol',
  'tỷ lệ thắng': 'win_rate',
  'tỷ lệ phiên tăng': 'win_rate',
  'win rate': 'win_rate',
  'phiên tăng': 'win_rate',
  'giá đóng cửa': 'last_close',
  'giá gần nhất': 'last_close',
  'close': 'last_close',
  'ma20': 'ma20',
  'ma 20': 'ma20',
  'đường ma20': 'ma20',
  'trung bình 20 phiên': 'ma20',
  'ma50': 'ma50',
  'ma 50': 'ma50',
  'đường ma50': 'ma50',
  'vị thế ma20 / ma50': 'ma_state',
  'vị thế ma20': 'ma_state',
  'vị thế ma': 'ma_state',
  'ma_state': 'ma_state',
  'rsi': 'rsi14',
  'rsi14': 'rsi14',
  'rsi 14': 'rsi14',
  'tỷ trọng thanh khoản theo khối lượng': 'volume_share',
  'tỷ trọng thanh khoản': 'volume_share',
  'volume_share': 'volume_share',
  'khối lượng trung bình': 'avg_volume',
  'klgd trung bình': 'avg_volume',
  'khối lượng': 'avg_volume',
  'đột biến khối lượng': 'volume_spike_days',
  'volume spike': 'volume_spike_days',
  'đột biến kl': 'volume_spike_days',
  'biên độ': 'avg_range',
  'biên độ dao động': 'avg_range',
  'số phiên': 'sessions',
  'phiên giao dịch': 'sessions',
  'phiên tăng mạnh nhất': 'best_day',
  'best day': 'best_day',
  'phiên giảm mạnh nhất': 'worst_day',
  'worst day': 'worst_day',
  'khoảng thời gian': 'date_range',
  'ngày giao dịch': 'date_range',
  'chuẩn hóa hiệu suất về mốc 100': 'normalized_base',
  'chuẩn hóa về 100': 'normalized_base',
  'chuẩn hóa': 'normalized_base',
  'so sánh lợi suất các mã': 'symbol_returns',
  'so sánh lợi suất': 'symbol_returns',
  'lợi suất các mã': 'symbol_returns',
  'mã sinh lời cao nhất': 'top_performer',
  'sinh lời cao nhất': 'top_performer',
  'top performer': 'top_performer',
  'mã rủi ro cao nhất': 'highest_volatility',
  'rủi ro cao nhất': 'highest_volatility',
  'highest volatility': 'highest_volatility',
  'tương quan lợi nhuận / rủi ro danh mục': 'risk_return',
  'tương quan lợi nhuận / rủi ro': 'risk_return',
  'tương quan lợi nhuận rủi ro': 'risk_return',
  'lợi nhuận / rủi ro': 'risk_return',
  'risk_return': 'risk_return',
  'hệ số tương quan cặp mã': 'correlation',
  'hệ số tương quan': 'correlation',
  'ma trận tương quan': 'correlation',
  'tương quan các mã': 'correlation',
  'tương quan': 'correlation',
};

export function localAnswer(question: string, context: ChatContext): LocalAnswerResult {
  const q = (question || '').trim().toLowerCase();

  // 1. Next step intent: "tôi nên làm gì tiếp", "bắt đầu từ đâu", "bước tiếp theo"
  if (
    /(?:bắt\s*đầu\s*từ\s*đâu|làm\s*gì\s*tiếp|bước\s*tiếp\s*theo|tiếp\s*theo\s*làm\s*gì|làm\s*gì\s*bây\s*giờ)/iu.test(q)
  ) {
    const s = context.state;
    if (s === 'created') {
      return {
        intent: 'next_step',
        answer_vi:
          'Bạn đang ở bước khởi tạo. Bước tiếp theo là sang trang Nạp file (Upload) để tải lên tệp Excel hoặc CSV dữ liệu giá giao dịch.',
        evidence: [],
        source: 'local',
        targetPage: '/upload',
      };
    }
    if (s === 'uploaded' || s === 'cleaning_review') {
      return {
        intent: 'next_step',
        answer_vi:
          'Dữ liệu đã được nạp thành công. Bước tiếp theo là kiểm tra hồ sơ làm sạch, bật/tắt các thao tác xử lý và bấm "Phê duyệt làm sạch (Cổng duyệt 1)" tại trang Làm sạch để mở khóa bước Phân tích.',
        evidence: [],
        source: 'local',
        targetPage: '/clean',
      };
    }
    if (s === 'clean_approved') {
      return {
        intent: 'next_step',
        answer_vi:
          'Dữ liệu sạch đã được duyệt. Bước tiếp theo là sang trang Phân tích, chọn danh mục mã cổ phiếu, khoảng thời gian và bấm "Chạy phân tích định lượng".',
        evidence: [],
        source: 'local',
        targetPage: '/analyze',
      };
    }
    if (s === 'analyzed') {
      return {
        intent: 'next_step',
        answer_vi:
          'Phân tích định lượng đã hoàn tất. Bước tiếp theo là sang trang Báo cáo để xem các thẻ KPI, biểu đồ, nhận định thị trường và bấm "Phê duyệt báo cáo (Cổng duyệt 2)".',
        evidence: [],
        source: 'local',
        targetPage: '/report',
      };
    }
    if (s === 'report_approved') {
      return {
        intent: 'next_step',
        answer_vi:
          'Báo cáo đã được phê duyệt chính thức. Bạn có thể tải tệp PDF in ấn hoặc xuất tệp Excel 7 sheet kèm công thức sống tại trang Báo cáo.',
        evidence: [],
        source: 'local',
        targetPage: '/report',
      };
    }
  }

  // 2. Rejection reason intent: "vì sao file bị từ chối", "file lỗi"
  if (
    /(?:vì\s*sao.*(?:từ\s*chối|lỗi)|tại\s*sao.*(?:từ\s*chối|lỗi)|file.*bị\s*từ\s*chối|lỗi\s*nạp\s*file)/iu.test(
      q
    )
  ) {
    if (context.last_rejection && context.last_rejection.length > 0) {
      const issues = context.last_rejection
        .slice(0, 3)
        .map((e, idx) => `${idx + 1}. [${e.code}] ${e.message_vi}. Cách sửa: ${e.fix_vi}`)
        .join(' ');
      return {
        intent: 'why_rejected',
        answer_vi: `Tệp của bạn chưa đạt yêu cầu kiểm tra cấu trúc do các nguyên nhân sau: ${issues}`,
        evidence: [],
        source: 'local',
        targetPage: '/upload',
      };
    }
    return {
      intent: 'why_rejected',
      answer_vi:
        'Hiện tại hệ thống không ghi nhận lần từ chối tệp nào gần đây. Bạn có thể nạp tệp tại trang Nạp file.',
      evidence: [],
      source: 'local',
      targetPage: '/upload',
    };
  }

  // 3. File format intent: "file cần cột gì", "định dạng file", "cấu trúc file"
  if (
    /(?:file.*cột|định\s*dạng\s*file|cấu\s*trúc\s*file|quy\s*định\s*file|yêu\s*cầu\s*file)/iu.test(
      q
    )
  ) {
    const colList = REQUIRED_COLUMNS.map((c) => c.label_vi).join(', ');
    return {
      intent: 'file_format',
      answer_vi: `Tệp dữ liệu cần có định dạng Excel (.xlsx) hoặc CSV, tối đa ${DEFAULT_LIMITS.max_rows.toLocaleString('vi-VN')} dòng và ${DEFAULT_LIMITS.max_symbols} mã cổ phiếu. Tệp bắt buộc phải có 7 cột: ${colList}. Ngày giao dịch cần sắp xếp tăng dần.`,
      evidence: [],
      source: 'local',
      targetPage: '/upload',
    };
  }

  // 4. Color / KPI tone intent: "vì sao đỏ", "vì sao xanh", "màu đỏ", "màu xanh"
  if (/(?:vì\s*sao|tại\s*sao)\s*.*(?:đỏ|xanh|vàng)|(?:màu\s*(?:đỏ|xanh|vàng)|kpi\s*tone)/iu.test(q)) {
    return {
      intent: 'explain_color',
      answer_vi:
        'Hệ thống dùng quy tắc màu pixel để trực quan hóa: Màu xanh (tích cực) biểu thị chỉ số đạt chuẩn kỳ vọng (như Sharpe trên 1.0, lợi suất dương, tỷ lệ phiên tăng cao, sụt giảm tối đa dưới 10%). Màu đỏ (cảnh báo) biểu thị rủi ro cao (như Sharpe âm, sụt giảm sâu trên 25%, lợi suất âm). Màu vàng hoặc xám biểu thị mức trung hòa.',
      evidence: [],
      source: 'local',
      targetPage: '/report',
    };
  }

  // 5. Cleaning operation intent: "điền khối lượng 0", "loại bỏ ngoại lai", "điểm bất thường"
  if (/(?:điền\s*khối\s*lượng\s*0|bất\s*thường|ngoại\s*lai|làm\s*sạch\s*dữ\s*liệu)/iu.test(q)) {
    return {
      intent: 'explain_cleaning_op',
      answer_vi:
        'Thao tác "Điền khối lượng bằng 0" thay thế các ô khối lượng trống bằng 0 để giữ lại chuỗi giá đóng cửa liên tục. Thao tác "Phát hiện điểm bất thường" gắn cờ các phiên có giá hoặc khối lượng lệch quá 3 độ lệch chuẩn so với trung bình để người dùng xem xét tại Cổng duyệt 1.',
      evidence: [],
      source: 'local',
      targetPage: '/clean',
    };
  }

  // 6. Explain specific metric intent: matches all 17 metrics from METRIC_DEFINITIONS
  const sortedDefs = Object.values(METRIC_DEFINITIONS).sort(
    (a, b) => b.label_vi.length - a.label_vi.length
  );
  let matchedMetricId: string | null = null;
  for (const def of sortedDefs) {
    if (q.includes(def.label_vi.toLowerCase()) || q.includes(def.id.toLowerCase())) {
      matchedMetricId = def.id;
      break;
    }
  }

  if (!matchedMetricId) {
    const sortedAliases = Object.entries(METRIC_ALIASES).sort(
      (a, b) => b[0].length - a[0].length
    );
    for (const [alias, metricId] of sortedAliases) {
      if (q.includes(alias)) {
        matchedMetricId = metricId;
        break;
      }
    }
  }

  if (matchedMetricId) {
    const def = METRIC_DEFINITIONS[matchedMetricId];
    if (def) {
      // Check if metric exists in context for active symbol
      const activeSym = context.active_symbol;
      const metricItem = context.metrics.find((m) => m.id === matchedMetricId && (!activeSym || m.symbol === activeSym));

      let valText = '';
      const evidenceList: string[] = [`g:${matchedMetricId}`];

      if (metricItem && metricItem.value !== null && metricItem.value !== undefined) {
        valText = ` Giá trị hiện tại của mã ${metricItem.symbol} là ${metricItem.display}.`;
        evidenceList.push(`m:${matchedMetricId}:${metricItem.symbol}`);

        if (metricItem.calc && metricItem.calc.length > 0) {
          const calcParts = metricItem.calc
            .map((c) => `${c.label_vi}: ${typeof c.value === 'number' ? c.value.toLocaleString('vi-VN') : c.value}`)
            .join('; ');
          valText += ` (Đầu vào tính toán: ${calcParts}).`;
        }
      }

      return {
        intent: 'explain_metric',
        answer_vi: `${def.label_vi}: ${def.meaning_vi} Công thức tính: ${def.formula_vi}. Công thức Excel minh họa: ${def.excel_hint}.${valText}`,
        evidence: evidenceList,
        source: 'local',
        targetPage: '/report',
      };
    }
  }

  // 7. Where is intent: "nằm ở đâu", "tìm ở đâu"
  if (/(?:nằm\s*ở\s*đâu|tìm\s*(?:ở\s*đâu|thấy\s*ở\s*đâu))/iu.test(q)) {
    return {
      intent: 'where_is',
      answer_vi:
        'Các thẻ chỉ số KPI và biểu đồ kỹ thuật được trình bày đầy đủ tại trang Báo cáo. Bạn có thể chuyển đổi giữa tab Tổng quan danh mục và tab từng mã cổ phiếu để xem chi tiết.',
      evidence: [],
      source: 'local',
      targetPage: '/report',
    };
  }

  return {
    intent: 'unknown',
    answer_vi:
      'Tôi chưa trả lời được câu hỏi này từ bộ quy tắc cục bộ. Bạn có thể hỏi về các chỉ số tài chính (như Sharpe, MDD, RSI), quy trình các bước tiếp theo, hoặc quy định về tệp dữ liệu.',
    evidence: [],
    source: 'local',
  };
}
