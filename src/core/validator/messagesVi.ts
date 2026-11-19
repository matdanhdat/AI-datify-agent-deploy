/**
 * Vietnamese error and warning message templates for file verification and data validation.
 * Adheres strictly to Section 5: friendly tone, clear positions, and actionable fixes.
 * Pure TypeScript - zero external runtime dependencies.
 */

export interface MessageTemplate {
  message_vi: string;
  fix_vi: string;
}

export const VALIDATOR_MESSAGES: Record<string, MessageTemplate> = {
  // S1: File gate
  UPLOAD_NO_FILE: {
    message_vi: 'Không tìm thấy tệp tải lên.',
    fix_vi: 'Vui lòng chọn hoặc kéo thả một tệp Excel (.xlsx) hoặc CSV (.csv) vào khung tải lên.',
  },
  UPLOAD_EXTENSION_UNSUPPORTED: {
    message_vi: 'Định dạng tệp {filename} không được hỗ trợ ({kind_desc}).',
    fix_vi: 'Hệ thống chỉ chấp nhận tệp bảng tính định dạng Excel (.xlsx) hoặc CSV (.csv). Vui lòng chuyển đổi dữ liệu sang định dạng chuẩn.',
  },
  UPLOAD_XLS_LEGACY: {
    message_vi: 'Tệp {filename} thuộc định dạng Excel cũ (.xls).',
    fix_vi: 'Hãy mở tệp trong Microsoft Excel hoặc Google Sheets, chọn "Lưu thành" (Save As) và chọn định dạng "Sổ làm việc Excel (*.xlsx)", sau đó tải lại.',
  },
  UPLOAD_TOO_LARGE: {
    message_vi: 'Dung lượng tệp ({size_mb} MB) vượt quá giới hạn cho phép ({max_mb} MB).',
    fix_vi: 'Hãy giảm bớt số dòng, xóa các hình ảnh hoặc định dạng thừa, hoặc chia nhỏ dữ liệu thành tệp dưới {max_mb} MB.',
  },
  UPLOAD_EMPTY: {
    message_vi: 'Tệp {filename} có dung lượng 0 byte (tệp rỗng).',
    fix_vi: 'Vui lòng kiểm tra lại tệp trên máy tính và đảm bảo tệp chứa dữ liệu trước khi tải lên.',
  },
  UPLOAD_CORRUPT: {
    message_vi: 'Tệp {filename} bị hỏng hoặc cấu trúc dữ liệu không hợp lệ ({detail}).',
    fix_vi: 'Hãy kiểm tra lại tệp xem có bị ngắt quãng khi lưu/tải về không, hoặc mở lại trong Excel và lưu thành tệp mới.',
  },
  UPLOAD_PASSWORD_PROTECTED: {
    message_vi: 'Tệp {filename} đã bị đặt mật khẩu bảo vệ hoặc được mã hóa.',
    fix_vi: 'Hãy mở tệp trong Excel, gỡ bỏ mật khẩu bảo vệ bảng tính, lưu lại và tải tệp đã mở khóa lên hệ thống.',
  },
  UPLOAD_CONTENT_MISMATCH: {
    message_vi: 'Tệp {filename} có đuôi .xlsx nhưng nội dung thực tế là {actual_kind}.',
    fix_vi: 'Việc đổi đuôi tệp thủ công không làm thay đổi định dạng bên trong. Vui lòng xuất dữ liệu đúng định dạng Excel (.xlsx) hoặc CSV (.csv).',
  },
  UPLOAD_ENCODING: {
    message_vi: 'Không thể giải mã nội dung văn bản của tệp CSV (thử UTF-8 và Windows-1258 đều thất bại).',
    fix_vi: 'Hãy lưu lại tệp CSV với bảng mã UTF-8 (có hoặc không có BOM) từ Excel hoặc trình soạn thảo văn bản.',
  },

  // S2: Container read
  UPLOAD_NO_HEADER: {
    message_vi: 'Không tìm thấy dòng tiêu đề chứa các cột dữ liệu cần thiết trong 10 dòng đầu tiên.',
    fix_vi: 'Hãy đảm bảo tệp có chứa dòng tiêu đề với các cột bắt buộc (Ngày, Mã, Mở, Cao, Thấp, Đóng, Khối lượng). Tải tệp mẫu để xem cấu trúc chuẩn.',
  },
  UPLOAD_NO_DATA: {
    message_vi: 'Tệp chỉ có dòng tiêu đề mà không có bất kỳ dòng dữ liệu giao dịch nào.',
    fix_vi: 'Hãy bổ sung dữ liệu giao dịch (tối thiểu {min_sessions} phiên cho mỗi mã) bên dưới dòng tiêu đề.',
  },

  // S3: Column schema
  SCHEMA_MISSING_COLUMN: {
    message_vi: 'Tệp thiếu {count} cột bắt buộc: {columns}.',
    fix_vi: 'Hãy thêm các cột còn thiếu và đặt tên đúng như trong bảng "Yêu cầu file" (hoặc tải tệp mẫu để xem cấu trúc chuẩn).',
  },
  SCHEMA_DUPLICATE_COLUMN: {
    message_vi: 'Phát hiện nhiều cột trong tệp cùng ánh xạ về trường "{key}": {columns}.',
    fix_vi: 'Mỗi thông tin giao dịch chỉ được có một cột duy nhất trong tệp. Hãy đổi tên hoặc xóa bớt cột trùng lặp.',
  },
  SCHEMA_UNKNOWN_COLUMN: {
    message_vi: 'Tệp chứa {count} cột không thuộc đặc tả và sẽ bị bỏ qua: {columns}.',
    fix_vi: 'Các cột này không ảnh hưởng đến tính toán. Bạn có thể giữ nguyên hoặc xóa đi để tệp gọn hơn.',
  },
  SCHEMA_SHEET_FALLBACK: {
    message_vi: 'Tệp Excel không có sheet tên "DuLieu"; hệ thống đã tự động chọn sheet đầu tiên "{sheet}".',
    fix_vi: 'Nếu bạn có nhiều sheet, hãy đổi tên sheet chứa dữ liệu chính thành "DuLieu" để hệ thống luôn chọn chính xác.',
  },
  SCHEMA_HEADER_ROW_MOVED: {
    message_vi: 'Dòng tiêu đề được tìm thấy ở dòng vật lý {row} thay vì dòng 1.',
    fix_vi: 'Hệ thống đã tự động nhận diện đúng. Nếu muốn chuẩn hóa, bạn có thể xóa các dòng chú thích phía trên để tiêu đề nằm ở dòng 1.',
  },

  // S4: Cell parsing
  DATA_BAD_NUMBER: {
    message_vi: 'Dòng {row}, cột "{column}": giá trị "{value}" không phải là số hợp lệ.',
    fix_vi: 'Hãy nhập số thuần (ví dụ: 25.4 hoặc 25400). Nếu ô có ký hiệu tiền tệ (đ, VND, $) hoặc phần trăm, hãy bỏ đi.',
  },
  DATA_BAD_DATE: {
    message_vi: 'Dòng {row}, cột "{column}": giá trị ngày "{value}" không hợp lệ hoặc không tồn tại.',
    fix_vi: 'Vui lòng nhập ngày có thực theo định dạng chuẩn dd/mm/yyyy (ví dụ: 14/11/2026) hoặc yyyy-mm-dd.',
  },
  DATA_DATE_AMBIGUOUS: {
    message_vi: 'Định dạng ngày trong tệp bị nhập nhằng giữa ngày/tháng và tháng/ngày (ví dụ dòng {row1}: "{val1}" mâu thuẫn với dòng {row2}: "{val2}").',
    fix_vi: 'Hãy thống nhất toàn bộ cột ngày theo một định dạng duy nhất: dd/mm/yyyy hoặc yyyy-mm-dd.',
  },
  DATA_MIXED_NUMBER_FORMAT: {
    message_vi: 'Tệp trộn lẫn hai kiểu định dạng số: dấu phẩy thập phân (ví dụ: "{example_comma}") và dấu chấm thập phân (ví dụ: "{example_dot}").',
    fix_vi: 'Hãy thống nhất định dạng số cho toàn bộ tệp, khuyên dùng dấu chấm cho phần thập phân (ví dụ: 25.40).',
  },
  DATA_EMPTY_KEY: {
    message_vi: 'Dòng {row}: ô khóa "{column}" bị để trống (không xác định được ngày hoặc mã chứng khoán).',
    fix_vi: 'Mọi dòng giao dịch đều phải có đầy đủ Ngày và Mã chứng khoán. Hãy điền giá trị hoặc xóa dòng trống này.',
  },
  DATA_TOO_MANY_MISSING: {
    message_vi: 'Cột "{column}" bị bỏ trống quá {percent}% số dòng ({missing}/{total} dòng).',
    fix_vi: 'Dữ liệu bị thiếu quá nhiều để có thể tính toán đáng tin cậy. Vui lòng kiểm tra lại nguồn dữ liệu của cột này.',
  },

  // S5: Row logic
  DATA_NONPOSITIVE_PRICE: {
    message_vi: 'Dòng {row}, mã {symbol}: giá {column} có giá trị {value} <= 0.',
    fix_vi: 'Giá cổ phiếu phải là số thực dương (> 0). Hãy kiểm tra và sửa lại giá trị của dòng này.',
  },
  DATA_NEGATIVE_VOLUME: {
    message_vi: 'Dòng {row}, mã {symbol}: khối lượng giao dịch {value} < 0.',
    fix_vi: 'Khối lượng giao dịch không thể là số âm. Hãy sửa lại số dương hoặc bằng 0 nếu phiên không có giao dịch.',
  },
  DATA_OHLC_INCONSISTENT: {
    message_vi: 'Dòng {row}, mã {symbol}: tương quan giá OHLC không hợp lệ (Mở: {open}, Cao: {high}, Thấp: {low}, Đóng: {close}).',
    fix_vi: 'Giá cao nhất (High) phải >= Mở và Đóng; Giá thấp nhất (Low) phải <= Mở và Đóng. Hãy kiểm tra lại các mức giá của dòng này.',
  },
  DATA_CONFLICT_DUPLICATE: {
    message_vi: 'Phát hiện hai dòng cùng ngày {date} và mã {symbol} nhưng giá trị khác nhau (dòng {row1} và dòng {row2}).',
    fix_vi: 'Một cổ phiếu chỉ có một phiên giao dịch trong một ngày. Hãy xóa bỏ dòng bị sai hoặc trùng lặp.',
  },
  DATA_BAD_SYMBOL: {
    message_vi: 'Dòng {row}: mã chứng khoán "{symbol}" không hợp lệ (chứa khoảng trắng hoặc ký tự đặc biệt không cho phép).',
    fix_vi: 'Mã chứng khoán chỉ được chứa chữ hoa, chữ số và các dấu . _ - với độ dài từ 1 đến 12 ký tự (ví dụ: TMA, FPT, VIC).',
  },

  // S6: Dataset-wide
  DATA_TOO_MANY_ROWS: {
    message_vi: 'Tổng số dòng dữ liệu ({rows} dòng) vượt quá giới hạn cho phép ({max_rows} dòng).',
    fix_vi: 'Vui lòng lọc bớt khoảng thời gian hoặc chia nhỏ tệp để số dòng không vượt quá {max_rows}.',
  },
  DATA_TOO_MANY_SYMBOLS: {
    message_vi: 'Số lượng mã chứng khoán trong tệp ({count} mã) vượt quá giới hạn tối đa ({max_symbols} mã).',
    fix_vi: 'Hệ thống hỗ trợ phân tích tối đa {max_symbols} mã cùng lúc. Hãy giảm bớt các mã không cần thiết.',
  },
  DATA_SYMBOL_TOO_FEW_SESSIONS: {
    message_vi: 'Mã {symbol} chỉ có {sessions} phiên giao dịch hợp lệ, cần tối thiểu {min_sessions} phiên.',
    fix_vi: 'Hãy bổ sung thêm dữ liệu lịch sử cho mã này (tối thiểu {min_sessions} phiên) hoặc bỏ mã này khỏi tệp.',
  },
  DATA_NO_USABLE_SYMBOL: {
    message_vi: 'Sau khi lọc các mã không đủ {min_sessions} phiên, không còn mã nào hợp lệ để phân tích.',
    fix_vi: 'Hãy nạp tệp chứa ít nhất một mã có đủ tối thiểu {min_sessions} phiên giao dịch.',
  },

  // Warnings
  DATA_MISSING_VALUES: {
    message_vi: 'Có {count} ô bị để trống ở các cột giá/khối lượng ({summary}).',
    fix_vi: 'Các ô trống sẽ được giữ nguyên (NaN) để bạn lựa chọn phương án xử lý (nội suy hoặc xóa dòng) tại bước Làm sạch.',
  },
  DATA_EXACT_DUPLICATE: {
    message_vi: 'Phát hiện {count} dòng trùng lặp hoàn toàn (mọi cột giống nhau).',
    fix_vi: 'Các dòng trùng này sẽ được gợi ý loại bỏ tự động tại bước Làm sạch tiếp theo.',
  },
  DATA_AMBIGUOUS_NUMBER: {
    message_vi: 'Có {count} giá trị số dạng {example} có thể gây hiểu nhầm (mặc định hiểu dấu chấm là thập phân: {example} = {interpreted}).',
    fix_vi: 'Nếu bạn muốn biểu diễn hàng nghìn, hãy bỏ dấu chấm phân cách nghìn (ví dụ: nhập 25400 thay vì 25.400).',
  },
  DATA_TIME_PART_DROPPED: {
    message_vi: 'Có {count} ô ngày chứa thông tin giờ giấc; phần giờ đã tự động được lược bỏ.',
    fix_vi: 'Hệ thống chỉ phân tích theo ngày giao dịch. Dữ liệu ngày vẫn được bảo toàn chính xác.',
  },
  DATA_FUTURE_DATE: {
    message_vi: 'Có {count} dòng có ngày giao dịch lớn hơn ngày hiện tại ({today_vi}, ví dụ: dòng {row} ngày {date}).',
    fix_vi: 'Vui lòng kiểm tra lại xem có bị nhầm lẫn năm hoặc ngày giao dịch tương lai không.',
  },
  DATA_LARGE_MOVE: {
    message_vi: 'Có {count} phiên biến động giá đóng cửa lớn hơn 20% so với phiên liền trước (ví dụ: mã {symbol} ngày {date} biến động {percent}%).',
    fix_vi: 'Đây có thể là phiên chia cổ tức, cổ phiếu mới niêm yết hoặc sai sót số liệu. Bạn có thể kiểm tra kỹ hơn ở bước xem biểu đồ.',
  },
  DATA_LONG_GAP: {
    message_vi: 'Có {count} khoảng cách dữ liệu dài hơn 10 ngày giữa hai phiên giao dịch liên tiếp (ví dụ: mã {symbol} từ {date1} đến {date2}).',
    fix_vi: 'Khoảng nghỉ có thể do ngày lễ tết dài ngày hoặc mã bị tạm ngừng giao dịch.',
  },
  DATA_SYMBOLS_DROPPED: {
    message_vi: 'Đã tự động loại bỏ {count} mã không đủ {min_sessions} phiên giao dịch (chế độ không nghiêm ngặt): {symbols}.',
    fix_vi: 'Dữ liệu của các mã còn lại vẫn được giữ nguyên và sẵn sàng để phân tích.',
  },

  // Rejected Title/Toast
  UPLOAD_REJECTED: {
    message_vi: 'Tệp tải lên bị từ chối do không đạt tiêu chuẩn dữ liệu ({errors} lỗi, {warnings} cảnh báo).',
    fix_vi: 'Vui lòng xem chi tiết từng lỗi bên dưới, sửa đổi tệp và tải lại.',
  },

  // M1 & D3 Business Dataset & Context Profile Messages
  SCHEMA_PROFILE_UNKNOWN: {
    message_vi: 'Không thể nhận diện hồ sơ dữ liệu phù hợp (không phải dữ liệu giao dịch 7 cột và không phải bảng kinh doanh hợp lệ).',
    fix_vi: 'Hệ thống hỗ trợ 2 loại: (1) Dữ liệu giao dịch (7 cột: Ngày, Mã, Mở, Cao, Thấp, Đóng, Khối lượng); (2) Bảng kinh doanh (tối thiểu 1 cột phân loại, 1 cột số liệu, từ 5 dòng, tối đa 30 cột). Vui lòng tải tệp mẫu để xem định dạng chuẩn.',
  },
  SCHEMA_NO_MEASURE_COLUMN: {
    message_vi: 'Bảng dữ liệu kinh doanh không có cột số liệu (measure) nào.',
    fix_vi: 'Hãy bổ sung ít nhất một cột chứa giá trị số (ví dụ: Doanh thu, Chi phí, Lợi nhuận, Số lượng đơn...).',
  },
  SCHEMA_NO_REVENUE_COLUMN: {
    message_vi:
      'Không tìm thấy cột Doanh thu trong file. Agent nhận các tên cột như: Doanh thu, Doanh số, Revenue, Sales, Thành tiền. Hãy đổi tên cột doanh thu rồi tải lại.',
    fix_vi:
      'Đổi tên cột chứa số liệu doanh thu trong file thành "Doanh thu" hoặc "Doanh số" rồi tải lại.',
  },
  SCHEMA_NO_DIMENSION_COLUMN: {
    message_vi: 'Bảng dữ liệu kinh doanh không có cột phân loại (dimension) nào.',
    fix_vi: 'Hãy bổ sung ít nhất một cột chứa thông tin phân loại (ví dụ: Kênh bán, Khu vực, Sản phẩm, Khách hàng...).',
  },
  DATA_TOO_FEW_ROWS: {
    message_vi: 'Tệp chỉ có {rows} dòng dữ liệu có nội dung, chưa đạt mức tối thiểu (tối thiểu 5 dòng).',
    fix_vi: 'Vui lòng bổ sung thêm dữ liệu để có ít nhất 5 dòng có nội dung trước khi nạp tệp.',
  },
  SCHEMA_TOO_MANY_COLUMNS: {
    message_vi: 'Tệp có {count} cột, vượt quá giới hạn tối đa cho phép (tối đa 30 cột).',
    fix_vi: 'Hãy giảm bớt các cột không cần thiết để số cột không vượt quá 30.',
  },
  DATA_WHITESPACE_PADDED: {
    message_vi: 'Có {count} ô dữ liệu bị thừa khoảng trắng ở đầu hoặc cuối (ví dụ: {example}).',
    fix_vi: 'Các khoảng trắng thừa này sẽ được tự động nhận diện và làm sạch tại bước Làm sạch tiếp theo.',
  },
  DATA_BLANK_DIMENSION: {
    message_vi: 'Có {count} ô phân loại bị để trống ở các cột: {columns}.',
    fix_vi: 'Các ô trống sẽ được gợi ý xử lý hoặc gán nhãn chưa xác định tại bước Làm sạch.',
  },
  DATA_DUPLICATE_ID: {
    message_vi: 'Phát hiện mã định danh dòng trùng lặp ({summary}).',
    fix_vi: 'Mỗi mã dòng thường chỉ nên xuất hiện một lần. Bạn có thể kiểm tra và xử lý tại bước Làm sạch.',
  },
  DATA_NEGATIVE_MEASURE: {
    message_vi: 'Có {count} giá trị âm trong cột số liệu (ví dụ: cột "{column}" có giá trị {value}).',
    fix_vi: 'Giá trị âm có thể là hàng hoàn trả hoặc giảm trừ doanh thu. Hệ thống ghi nhận và giữ nguyên cho bạn kiểm tra.',
  },
  CONTEXT_REQUIRED: {
    message_vi: 'Bạn cần nhập ít nhất một yêu cầu phân tích để Agent biết cần trả lời điều gì.',
    fix_vi: 'Vui lòng nhập câu hỏi phân tích vào ô "Yêu cầu phân tích" ở khung số 1 trước khi nạp tệp.',
  },
};

/**
 * Formats a message template by substituting `{placeholder}` with values from `params`.
 * Safely handles missing placeholders and never returns raw technical stack traces.
 */
export function formatValidatorMessage(
  code: string,
  params: Record<string, unknown> = {}
): MessageTemplate {
  const tpl = VALIDATOR_MESSAGES[code] || {
    message_vi: `Phát hiện vấn đề dữ liệu: mã [${code}].`,
    fix_vi: 'Vui lòng kiểm tra lại dữ liệu và tải tệp mẫu chuẩn để đối chiếu.',
  };

  const replaceParams = (text: string): string => {
    return text.replace(/\{(\w+)\}/g, (match, key) => {
      if (params[key] !== undefined && params[key] !== null) {
        return String(params[key]);
      }
      return match;
    });
  };

  return {
    message_vi: replaceParams(tpl.message_vi),
    fix_vi: replaceParams(tpl.fix_vi),
  };
}

