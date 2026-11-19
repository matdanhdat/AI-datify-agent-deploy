/**
 * Static Application Guide for Datify AI Agent (Prompt P6 Section 3).
 * Strictly text-based Vietnamese documentation (~3-4 KB).
 * Single source of truth for local answer and AI context.
 */

import { DEFAULT_LIMITS, REQUIRED_COLUMNS } from '../validator/schemaSpec';

export const APP_GUIDE_TEXT = `# HƯỚNG DẪN SỬ DỤNG DATIFY AI AGENT

## 1. QUY TRÌNH 5 BƯỚC VÀ 2 CỔNG DUYỆT
- Bước 1 (Nạp file): Tải lên tệp Excel (.xlsx) hoặc CSV chứa dữ liệu giao dịch OHLCV. Hệ thống kiểm tra cấu trúc nghiêm ngặt trong trình duyệt.
- Bước 2 (Làm sạch): Lập hồ sơ dữ liệu, phát hiện dòng trùng lặp, thiếu giá, thiếu khối lượng, hoặc điểm bất thường.
  * CỔNG DUYỆT 1: Người dùng kiểm tra bảng đối chiếu trước/sau, cấu hình các thao tác làm sạch và xác nhận phê duyệt dữ liệu sạch.
- Bước 3 (Phân tích định lượng): Tính toán 17 chỉ số tài chính chuẩn và dựng biểu đồ kỹ thuật bằng code thuần trong Web Worker.
- Bước 4 (Nhận định thị trường): AI viết nhận định định tính dựa trên các con số đã tính. Mọi số liệu trong bài viết được đối chiếu nghiêm ngặt chống ảo giác số liệu.
  * CỔNG DUYỆT 2: Người dùng xem xét, chỉnh sửa câu chữ nếu cần và bấm phê duyệt bản báo cáo chính thức.
- Bước 5 (Xuất bản báo cáo): Xuất báo cáo hoàn chỉnh ra file PDF in ấn chuyên nghiệp hoặc file Excel 7 sheet kèm công thức sống kiểm chứng.

## 2. QUY ĐỊNH VỀ TỆP DỮ LIỆU ĐẦU VÀO
- Định dạng tệp được hỗ trợ: .xlsx, .xls, .csv. Dung lượng tối đa: ${DEFAULT_LIMITS.max_file_mb} MB.
- Giới hạn dòng: Tối đa ${DEFAULT_LIMITS.max_rows.toLocaleString('vi-VN')} dòng dữ liệu.
- Số lượng mã cổ phiếu: Tối đa ${DEFAULT_LIMITS.max_symbols} mã trong một tệp.
- Số phiên tối thiểu: Mỗi mã cần tối thiểu ${DEFAULT_LIMITS.min_sessions} phiên giao dịch để tính toán các chỉ số thống kê.
- Các cột bắt buộc:
${REQUIRED_COLUMNS.map((c) => `  * ${c.label_vi} (${c.key}): Tên cột chấp nhận [${c.acceptedNames.slice(0, 3).join(', ')}]. ${c.description_vi}.`).join('\n')}

## 3. CÁC MÃ LỖI THƯỜNG GẶP VÀ CÁCH XỬ LÝ
- FILE_TOO_LARGE: Tệp vượt quá ${DEFAULT_LIMITS.max_file_mb} MB. Cách sửa: Nén lại hoặc chia nhỏ dữ liệu.
- DATA_TOO_MANY_ROWS: Tệp vượt quá ${DEFAULT_LIMITS.max_rows.toLocaleString('vi-VN')} dòng. Cách sửa: Lọc bớt các năm quá cũ.
- MISSING_COLUMNS: Thiếu một hoặc nhiều cột bắt buộc (Ngày, Mã, Giá mở, Giá cao, Giá thấp, Giá đóng, Khối lượng).
- INVALID_DATES: Định dạng ngày không đúng hoặc ngày không theo thứ tự thời gian tăng dần.
- NEGATIVE_PRICES: Giá hoặc khối lượng có giá trị âm hoặc bằng 0 ở cột giá.
- SYMBOL_TOO_FEW_ROWS: Mã có dưới ${DEFAULT_LIMITS.min_sessions} phiên giao dịch.

## 4. BẢO MẬT VÀ QUYỀN RIÊNG TƯ
- Toàn bộ quá trình xử lý dữ liệu chạy ngay trong trình duyệt của bạn (In-Browser Worker).
- Không có cơ sở dữ liệu, không lưu trữ dữ liệu người dùng trên máy chủ.
- Cổng AI chỉ nhận số liệu tóm tắt đã tính toán, tuyệt đối không gửi các dòng dữ liệu thô ra ngoài.
`;

export function getAppGuide(): string {
  return APP_GUIDE_TEXT;
}

