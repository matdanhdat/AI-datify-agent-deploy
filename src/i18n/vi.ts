/**
 * Dictionary of Vietnamese strings for Datify AI Agent.
 * ALL user-facing text must be defined here.
 */
export const vi = {
  app: {
    title: 'Datify AI Agent',
    subtitle: 'Trading AI Agent',
  },
  brand: {
    name: 'Datify AI Agent',
    sub: 'Trading AI Agent',
    badge: 'DATIFY AI AGENT DASHBOARD',
  },
  nav: {
    home: 'Trang chủ',
    upload: 'Nạp dữ liệu',
    clean: 'Làm sạch',
    analyze: 'Phân tích',
    report: 'Báo cáo',
    agent: 'Tiến trình Agent',
    history: 'Lịch sử',
    config: 'Cấu hình',
  },
  steps: {
    upload: 'Dữ liệu',
    clean: 'Làm sạch',
    review: 'Duyệt dữ liệu',
    analyze: 'Phân tích',
    report: 'Báo cáo',
    status: {
      locked: 'Đang khóa',
      current: 'Đang thực hiện',
      done: 'Hoàn thành',
    },
  },
  session: {
    current: 'Phiên hiện tại',
    noSession: 'Chưa có phiên làm việc',
    createNew: 'Tạo phiên mới',
    state: 'Trạng thái',
    unlockedPages: 'Trang mở khóa',
  },
  common: {
    loading: 'Đang tải dữ liệu...',
    error: 'Đã xảy ra lỗi',
    retry: 'Thử lại',
    underConstruction: 'Tính năng đang được phát triển theo lộ trình.',
    save: 'Lưu',
    cancel: 'Hủy',
    confirm: 'Xác nhận',
    delete: 'Xóa',
    back: 'Quay lại',
    next: 'Tiếp tục',
    viewDetails: 'Xem chi tiết',
  },
  errors: {
    networkFailed: 'Không kết nối được máy chủ. Hãy kiểm tra ứng dụng đã chạy chưa.',
    notFound: 'Không tìm thấy tài nguyên yêu cầu.',
    stateInvalid: 'Thao tác không hợp lệ với trạng thái hiện tại của phiên.',
    internal: 'Đã xảy ra lỗi máy chủ nội bộ. Vui lòng thử lại sau.',
    validation: 'Dữ liệu không hợp lệ. Vui lòng kiểm tra lại.',
  },
  config: {
    title: 'Cấu hình hệ thống & Trạng thái kết nối',
    healthStatus: 'Trạng thái máy chủ (Health Check)',
    appConfig: 'Cấu hình hệ thống (App Config)',
    refresh: 'Làm mới kết nối',
    serverConnected: 'Máy chủ đang hoạt động bình thường',
    serverDisconnected: 'Mất kết nối tới máy chủ',
    aiMode: 'Chế độ AI',
    llmProvider: 'Nhà cung cấp LLM',
    llmModel: 'Mô hình LLM',
    keyConfigured: 'Khóa API đã thiết lập',
    yes: 'Có',
    no: 'Chưa cấu hình (đang dùng chế độ Dự phòng)',
    llmKeySlots: 'Số khóa Gemini đã cấu hình',
  },
  ai: {
    ready: 'AI: Gemini sẵn sàng',
    fallback: 'Chế độ dự phòng',
    pingButton: 'Kiểm tra kết nối AI',
    pingSuccess: 'Kết nối AI thành công',
    pingFailed: 'Kết nối AI thất bại',
    tooFast: 'Vui lòng chờ ít nhất 5 giây giữa các lần kiểm tra kết nối AI.',
  },
  storage: {
    tabMemoryNotice: 'Dữ liệu chỉ tồn tại trong tab này. Tải lại trang sẽ bị mất.',
    tabOnlySessions: 'Chỉ hiện các phiên của lần mở này.',
  },
  contextForm: {
    extraInfoLabel: 'Thông tin bổ sung về mô hình hoạt động:',
    optionalTag: '(không bắt buộc)',
    extraInfoPlaceholder:
      'Ví dụ: Cửa hàng thời trang có ba kênh bán (cửa hàng, website, sàn thương mại điện tử). Tôi là chủ cửa hàng, đang lo biên lợi nhuận giảm từ tháng 9 và muốn biết nên tập trung vào kênh nào.',
    extraInfoChecklistTitle: 'Gợi ý nội dung nên mô tả (không bắt buộc):',
    extraInfoChecklist: [
      'Doanh nghiệp làm gì, bán gì',
      'Các kênh bán hoặc nhóm khách hàng chính',
      'Vai trò của bạn',
      'Vấn đề bạn đang gặp',
      'Mục tiêu sắp tới',
    ],
    extraInfoEmptyWarning:
      'Bạn chưa mô tả bối cảnh. Agent chỉ có dữ liệu trong file để tham chiếu, nên nhận định có thể chung chung và kém sát với tình hình thực tế của bạn. Hãy mô tả ngắn về công ty, công việc và vấn đề đang gặp để kết quả hiệu quả hơn.',
    extraInfoSavedConfirm: 'Thông tin này được lưu cùng phiên làm việc.',
    extraInfoLimitError: 'Thông tin bổ sung tối đa 2.000 ký tự.',
    questionsLabel: 'Yêu cầu phân tích cần Agent trả lời:',
    requiredTag: '(Bắt buộc)',
    questionsSingleWarning: 'Bạn nên nêu 2 đến 3 câu hỏi cụ thể để báo cáo trả lời đầy đủ hơn.',
    suggestionsTitle: 'Gợi ý câu hỏi',
    suggestionsHint: 'Bấm để thêm vào danh sách; bấm lại để bỏ.',
    suggestionsLimitNotice: 'Tối đa 8 câu hỏi.',
    suggestionAddedTag: 'Đã thêm',
    useTop3Button: 'Dùng 3 câu phổ biến',
    useTop3ConfirmTitle: 'Thay thế danh sách câu hỏi hiện tại?',
    useTop3ConfirmMessage:
      'Ô yêu cầu phân tích đang có nội dung. Bạn có muốn thay thế bằng 3 câu hỏi phổ biến của nhóm đang chọn không?',
    useTop3ConfirmButton: 'Thay thế bằng 3 câu phổ biến',
    tabs: {
      business: 'Kinh doanh',
      trading: 'Giao dịch',
      general: 'Chung',
    },
  },
} as const;

export type ViDictionary = typeof vi;

