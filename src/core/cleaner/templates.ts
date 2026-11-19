/**
 * Fallback explanation templates for data cleaning operations (Section 6.2).
 * Formatted in concise, natural Vietnamese (maximum 2 sentences per field).
 * Used when AI is not configured, encountering errors/timeouts, or when AI output fails verification.
 */

import type { CleanOpKey } from '../schemas';

export interface ExplanationItem {
  why_vi: string;
  risk_vi: string;
}

export const CLEANING_TEMPLATES: Record<CleanOpKey, (rows: number, symbols: string[]) => ExplanationItem> = {
  drop_exact_duplicates: (rows, _symbols) => ({
    why_vi: `Loại bỏ ${rows} dòng giao dịch trùng lặp hoàn toàn giúp số liệu khối lượng và giá không bị tính lặp lại hai lần. Thao tác này giúp bảo đảm tính chính xác cho các chỉ số định lượng.`,
    risk_vi: 'Hầu như không có rủi ro vì hệ thống vẫn giữ lại phiên bản xuất hiện đầu tiên của mỗi dòng trùng.',
  }),

  drop_rows_missing_ohlc: (rows, _symbols) => ({
    why_vi: `Loại bỏ ${rows} phiên bị thiếu một trong các mức giá mở, cao, thấp hoặc đóng để tránh vẽ nến cụt và làm sai lệch chỉ báo kỹ thuật. Dữ liệu nến đòi hỏi đủ 4 mức giá để phân tích.`,
    risk_vi: 'Có thể làm giảm số lượng phiên của chuỗi thời gian nếu tệp ban đầu bị thiếu nhiều dữ liệu giá.',
  }),

  fill_missing_volume_zero: (rows, _symbols) => ({
    why_vi: `Điền giá trị 0 cho ${rows} phiên thiếu khối lượng giúp bảo toàn chuỗi ngày giao dịch để vẽ biểu đồ nến liên tục. Cách này tránh phải xóa cả dòng khi giá vẫn có đủ.`,
    risk_vi: 'Khối lượng bằng 0 có thể làm giảm nhẹ chỉ số khối lượng trung bình và các chỉ báo tính theo dòng tiền như VWAP hoặc OBV.',
  }),

  flag_outliers: (rows, symbols) => ({
    why_vi: `Đánh dấu ${rows} phiên có mức biến động giá bất thường theo phương pháp MAD ở các mã (${symbols.join(', ')}) để hỗ trợ quan sát trực quan trên biểu đồ. Thao tác này giúp phát hiện nhanh các cú sốc giá.`,
    risk_vi: 'Hoàn toàn không có rủi ro vì chỉ gắn cờ đánh dấu phân loại mà không thay đổi hay xóa bất kỳ giá trị số liệu nào.',
  }),

  drop_flagged_outliers: (rows, _symbols) => ({
    why_vi: `Loại bỏ ${rows} phiên có mức biến động đột biến nhằm hạn chế nhiễu số liệu từ các sự kiện bất thường hoặc sai sót nhập liệu. Các thuật toán định lượng sau đó sẽ học trên chuỗi dữ liệu mượt hơn.`,
    risk_vi: 'Cần cân nhắc kỹ vì có thể xóa mất các phiên biến động thị trường thực tế hoặc làm số phiên của mã giảm dưới ngưỡng tối thiểu 30 phiên.',
  }),

  sort_by_symbol_date: (rows, _symbols) => ({
    why_vi: `Sắp xếp toàn bộ ${rows} dòng dữ liệu tăng dần theo Mã chứng khoán và Ngày giao dịch là bước chuẩn hóa kỹ thuật bắt buộc. Điều này giúp tính toán lợi suất chuỗi thời gian chính xác.`,
    risk_vi: 'Thao tác chỉ sắp xếp thứ tự các dòng trong bảng tính, hoàn toàn không làm thay đổi hay mất mát dữ liệu.',
  }),

  remove_blank_rows: (rows, _symbols) => ({
    why_vi: `Loại bỏ ${rows} dòng trống hoàn toàn giúp bảng dữ liệu kinh doanh gọn gàng, tránh sai lệch mẫu số khi đếm tổng số dòng.`,
    risk_vi: 'Hoàn toàn không có rủi ro vì các dòng này không chứa bất kỳ dữ liệu nào.',
  }),

  trim_whitespace: (rows, _symbols) => ({
    why_vi: `Chuẩn hóa khoảng trắng cho ${rows} ô dữ liệu (tỉa đầu cuối và thu gọn khoảng cách thừa) giúp việc phân nhóm theo danh mục được chính xác 100%.`,
    risk_vi: 'Không có rủi ro mất mát dữ liệu, chỉ đồng nhất định dạng văn bản.',
  }),

  fill_blank_dimension_label: (rows, _symbols) => ({
    why_vi: `Điền nhãn chuẩn "Không xác định" cho ${rows} ô phân loại bị để trống giúp bảo toàn dữ liệu đo lường doanh thu và chi phí mà không phải xóa bỏ dòng.`,
    risk_vi: 'Các bản ghi này sẽ được tập hợp vào nhóm "Không xác định" trong các báo cáo phân tích cơ cấu.',
  }),

  sort_natural: (rows, _symbols) => ({
    why_vi: `Sắp xếp ${rows} dòng dữ liệu theo thứ tự thời gian tăng dần và mã dòng tự nhiên giúp báo cáo trực quan, theo dõi dữ liệu kinh doanh mạch lạc.`,
    risk_vi: 'Thao tác chỉ sắp xếp thứ tự hiển thị, hoàn toàn không làm biến đổi số liệu các chỉ tiêu.',
  }),
};

export function getFallbackExplanation(
  op: CleanOpKey,
  rowsAffected: number,
  affectedSymbols: string[],
  isBusiness = false,
  hasId = false
): ExplanationItem {
  if (isBusiness) {
    if (op === 'drop_exact_duplicates') {
      return {
        why_vi:
          rowsAffected === 0
            ? 'Không phát hiện dòng trùng lặp nào trong file này.'
            : `Phát hiện ${rowsAffected} dòng trùng lặp hoàn toàn. Giữ lại lần xuất hiện đầu tiên.`,
        risk_vi:
          rowsAffected === 0
            ? 'Không có bản ghi nào bị ảnh hưởng.'
            : 'Hầu như không có rủi ro vì hệ thống vẫn giữ lại phiên bản xuất hiện đầu tiên của mỗi dòng trùng.',
      };
    }
    if (op === 'remove_blank_rows') {
      return {
        why_vi:
          rowsAffected === 0
            ? 'Không phát hiện dòng trống hoàn toàn nào trong file này.'
            : `Phát hiện ${rowsAffected} dòng trống hoàn toàn. Loại bỏ để tránh sai lệch tổng số dòng.`,
        risk_vi:
          rowsAffected === 0
            ? 'Không có bản ghi nào bị ảnh hưởng.'
            : 'Hoàn toàn không có rủi ro vì các dòng này không chứa bất kỳ dữ liệu nào.',
      };
    }
    if (op === 'trim_whitespace') {
      return {
        why_vi:
          rowsAffected === 0
            ? 'Không phát hiện ô nào có khoảng trắng thừa trong file này.'
            : `Phát hiện ${rowsAffected} ô có khoảng trắng thừa ở đầu, cuối hoặc giữa các từ. Tỉa gọn và thu gọn khoảng trắng.`,
        risk_vi:
          rowsAffected === 0
            ? 'Không có bản ghi nào bị ảnh hưởng.'
            : 'Không có rủi ro mất mát dữ liệu, chỉ đồng nhất định dạng văn bản.',
      };
    }
    if (op === 'fill_blank_dimension_label') {
      return {
        why_vi:
          rowsAffected === 0
            ? 'Không phát hiện ô phân loại nào bị trống trong file này.'
            : `Phát hiện ${rowsAffected} ô phân loại bị trống. Điền nhãn "Không xác định".`,
        risk_vi:
          rowsAffected === 0
            ? 'Không có bản ghi nào bị ảnh hưởng.'
            : 'Các bản ghi này sẽ được tập hợp vào nhóm "Không xác định" trong các báo cáo phân tích cơ cấu.',
      };
    }
    if (op === 'sort_natural') {
      return {
        why_vi: `Sắp xếp ${rowsAffected} dòng theo thứ tự thời gian tăng dần${hasId ? ', sau đó theo Mã dòng.' : '.'}`,
        risk_vi:
          rowsAffected === 0
            ? 'Không có bản ghi nào bị ảnh hưởng.'
            : 'Thao tác chỉ sắp xếp thứ tự hiển thị, hoàn toàn không làm biến đổi số liệu các chỉ tiêu.',
      };
    }
  }

  const generator = CLEANING_TEMPLATES[op];
  if (generator) {
    return generator(rowsAffected, affectedSymbols);
  }
  return {
    why_vi: `Thực hiện thao tác ${op} cho ${rowsAffected} dòng dữ liệu nhằm chuẩn hóa tập số liệu trước khi phân tích.`,
    risk_vi: 'Hãy kiểm tra lại bảng dữ liệu trước và sau khi áp dụng để đảm bảo kết quả mong muốn.',
  };
}
