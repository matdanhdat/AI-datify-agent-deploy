/**
 * Navigation and state machine helper functions.
 * Mapped purely for UI routing, badge display, and lock explanation messages.
 */
import type { BadgeVariant } from '../components/pixel/PixelBadge';
import type { SessionState, StepKey } from '../types/contract';

export const STATE_LABELS_VI: Record<SessionState, string> = {
  created: 'Phiên mới',
  uploaded: 'Đã nạp dữ liệu',
  cleaning_review: 'Chờ duyệt dữ liệu',
  clean_approved: 'Đã duyệt dữ liệu',
  analyzed: 'Chờ duyệt báo cáo',
  report_approved: 'Báo cáo đã duyệt',
};

export function getStateLabelVi(state: SessionState): string {
  return STATE_LABELS_VI[state] || state;
}

export function getStateBadgeVariant(state: SessionState): BadgeVariant {
  switch (state) {
    case 'created':
      return 'neutral';
    case 'uploaded':
      return 'info';
    case 'cleaning_review':
    case 'analyzed':
      return 'warn';
    case 'clean_approved':
    case 'report_approved':
      return 'success';
    default:
      return 'neutral';
  }
}

export function getStepPath(stepKey: StepKey): string {
  switch (stepKey) {
    case 'upload':
      return '/nap-du-lieu';
    case 'clean':
    case 'review':
      return '/lam-sach';
    case 'exchange':
      return '/trao-doi';
    case 'analyze':
      return '/phan-tich';
    case 'report':
      return '/bao-cao';
    default:
      return '/';
  }
}

export function getCurrentStepPath(state: SessionState, isBusiness = false, metricConfirmed = false): string {
  switch (state) {
    case 'created':
      return '/nap-du-lieu';
    case 'uploaded':
    case 'cleaning_review':
      return '/lam-sach';
    case 'clean_approved':
      return isBusiness && !metricConfirmed ? '/trao-doi' : '/phan-tich';
    case 'analyzed':
    case 'report_approved':
      return '/bao-cao';
    default:
      return '/';
  }
}

export const PAGE_TITLES: Record<string, string> = {
  home: 'Trang chủ',
  upload: 'Nạp dữ liệu',
  clean: 'Làm sạch & Phê duyệt',
  exchange: 'Trao đổi & Chọn chỉ số',
  analyze: 'Phân tích & Biểu đồ',
  report: 'Báo cáo & Nhận định',
  agent: 'Tiến trình Agent',
  history: 'Lịch sử phiên',
  config: 'Cấu hình hệ thống',
};

export interface LockExplanation {
  pageKey: string;
  pageTitle: string;
  currentState: SessionState;
  currentStateVi: string;
  message: string;
  actionLabel: string;
  actionPath: string;
}

export function getLockExplanation(
  pageKey: string,
  currentState: SessionState,
  isBusiness = false,
  metricConfirmed = false
): LockExplanation {
  const pageTitle = PAGE_TITLES[pageKey] || pageKey;
  const currentStateVi = getStateLabelVi(currentState);

  if (pageKey === 'clean') {
    return {
      pageKey,
      pageTitle,
      currentState,
      currentStateVi,
      message: 'Bạn cần nạp tệp dữ liệu giao dịch hợp lệ trước khi tiến hành bước làm sạch.',
      actionLabel: 'Đến bước nạp dữ liệu',
      actionPath: '/nap-du-lieu',
    };
  }

  if (pageKey === 'exchange') {
    return {
      pageKey,
      pageTitle,
      currentState,
      currentStateVi,
      message: 'Bạn cần duyệt dữ liệu sạch tại Cổng duyệt 1 trước khi tiến hành trao đổi và chọn chỉ số.',
      actionLabel: 'Đến bước duyệt dữ liệu',
      actionPath: '/lam-sach',
    };
  }

  if (pageKey === 'analyze') {
    if (currentState === 'created' || currentState === 'uploaded') {
      return {
        pageKey,
        pageTitle,
        currentState,
        currentStateVi,
        message: 'Bạn cần nạp dữ liệu và phê duyệt dữ liệu sạch trước khi phân tích.',
        actionLabel: 'Đến bước nạp dữ liệu',
        actionPath: '/nap-du-lieu',
      };
    }
    if (currentState === 'cleaning_review') {
      return {
        pageKey,
        pageTitle,
        currentState,
        currentStateVi,
        message: 'Bạn cần duyệt dữ liệu sạch tại Cổng duyệt 1 trước khi tiến hành phân tích.',
        actionLabel: 'Đến bước duyệt dữ liệu',
        actionPath: '/lam-sach',
      };
    }
    if (isBusiness && !metricConfirmed) {
      return {
        pageKey,
        pageTitle,
        currentState,
        currentStateVi,
        message: 'Bạn cần hoàn thành bước Trao đổi và chọn các chỉ số phân tích trước khi xem kết quả phân tích.',
        actionLabel: 'Đến bước trao đổi',
        actionPath: '/trao-doi',
      };
    }
    return {
      pageKey,
      pageTitle,
      currentState,
      currentStateVi,
      message: 'Bạn cần duyệt dữ liệu sạch tại Cổng duyệt 1 trước khi tiến hành phân tích.',
      actionLabel: 'Đến bước duyệt dữ liệu',
      actionPath: '/lam-sach',
    };
  }

  if (pageKey === 'report') {
    if (currentState === 'created' || currentState === 'uploaded') {
      return {
        pageKey,
        pageTitle,
        currentState,
        currentStateVi,
        message: 'Bạn cần hoàn thành các bước nạp, làm sạch và phân tích trước khi xem báo cáo.',
        actionLabel: 'Đến bước nạp dữ liệu',
        actionPath: '/nap-du-lieu',
      };
    }
    if (currentState === 'cleaning_review') {
      return {
        pageKey,
        pageTitle,
        currentState,
        currentStateVi,
        message: 'Dữ liệu chưa được phê duyệt làm sạch. Vui lòng duyệt dữ liệu tại Cổng 1 trước.',
        actionLabel: 'Đến bước làm sạch',
        actionPath: '/lam-sach',
      };
    }
    return {
      pageKey,
      pageTitle,
      currentState,
      currentStateVi,
      message: 'Bạn cần hoàn thành tính toán các chỉ số định lượng trước khi xem dự thảo báo cáo.',
      actionLabel: 'Đến bước phân tích',
      actionPath: '/phan-tich',
    };
  }

  return {
    pageKey,
    pageTitle,
    currentState,
    currentStateVi,
    message: 'Trang này hiện đang bị khóa bởi tiến trình của phiên làm việc.',
    actionLabel: 'Về trang chủ',
    actionPath: '/',
  };
}
