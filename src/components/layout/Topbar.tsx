import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { ConfirmDialog } from '../pixel/PixelModal';
import { PixelButton } from '../pixel/PixelButton';
import { PixelIcon } from '../pixel/PixelIcon';
import { useToast } from '../pixel/PixelToast';
import { AiStatusBadge } from '../pixel/AiStatusBadge';
import { deleteSession } from '../../services/sessionService';
import type { Session } from '../../types/contract';

interface TopbarProps {
  session: Session | null;
  loading: boolean;
  onSessionCreated?: (newSession: Session) => void;
  createNewSession: () => Promise<Session>;
}

const PAGE_TITLES: Record<string, string> = {
  '/': 'Trang chủ',
  '/nap-du-lieu': 'Nạp dữ liệu',
  '/lam-sach': 'Làm sạch & Phê duyệt dữ liệu',
  '/phan-tich': 'Phân tích định lượng & Biểu đồ',
  '/bao-cao': 'Báo cáo nhận định thị trường',
  '/tien-trinh': 'Tiến trình Agent & Nhật ký',
  '/lich-su': 'Lịch sử phiên phân tích',
  '/cau-hinh': 'Cấu hình hệ thống',
  '/thu-vien-giao-dien': 'Thư viện linh kiện Pixel Art',
};

export const Topbar: React.FC<TopbarProps> = ({
  session,
  loading,
  createNewSession,
}) => {
  const location = useLocation();
  const navigate = useNavigate();
  const { showToast } = useToast();

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmNewOpen, setConfirmNewOpen] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const search = new URLSearchParams(location.search);
      if (search.get('demoConfirm') === '1') {
        setConfirmOpen(true);
      }
    }
  }, [location.search]);

  const pageTitle = PAGE_TITLES[location.pathname] || 'Datify AI Agent';
  const filename = session?.dataset?.filename || 'Chưa có dữ liệu';

  const handleDeleteSession = async () => {
    if (!session) return;
    setDeleteLoading(true);
    try {
      deleteSession(session.id);
      showToast({
        type: 'success',
        title: 'Đã xóa phiên',
        message: 'Toàn bộ dữ liệu của phiên đã được xóa sạch thành công.',
      });
      setConfirmOpen(false);
      // Auto create new fresh session
      await createNewSession();
      navigate('/');
    } catch (err: any) {
      showToast({
        type: 'error',
        title: 'Lỗi khi xóa phiên',
        message: err.message || 'Không thể xóa phiên làm việc.',
      });
    } finally {
      setDeleteLoading(false);
    }
  };

  const hasUnsavedData = Boolean(session && (session.dataset || session.state !== 'created'));

  const handleCreateNewClick = () => {
    if (hasUnsavedData) {
      setConfirmNewOpen(true);
    } else {
      executeCreateNew();
    }
  };

  const executeCreateNew = async () => {
    try {
      await createNewSession();
      setConfirmNewOpen(false);
      showToast({
        type: 'info',
        title: 'Phiên mới',
        message: 'Đã khởi tạo một phiên làm việc mới thành công.',
      });
      navigate('/nap-du-lieu');
    } catch (err: any) {
      showToast({
        type: 'error',
        title: 'Lỗi',
        message: err.message || 'Không thể tạo phiên mới.',
      });
    }
  };

  return (
    <>
      <header
        style={{
          height: '72px',
          backgroundColor: 'var(--panel)',
          borderBottom: '3px solid var(--ink)',
          padding: '0 var(--space-6)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 'var(--space-4)',
          position: 'sticky',
          top: 0,
          zIndex: 'var(--z-header)',
        }}
      >
        {/* Left: Page Title & Current File */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-4)', overflow: 'hidden' }}>
          <div>
            <h1
              className="font-pixel"
              style={{
                fontSize: '26px',
                color: 'var(--ink)',
                margin: 0,
                lineHeight: 1.1,
                whiteSpace: 'nowrap',
              }}
            >
              {pageTitle}
            </h1>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                fontSize: '12px',
                color: 'var(--ink-soft)',
                marginTop: '2px',
              }}
            >
              <PixelIcon name="file" size={12} />
              <span>Tệp: <strong>{filename}</strong></span>
              {session?.id && (
                <span style={{ marginLeft: '6px', opacity: 0.7 }}>
                  (ID: {session.id.slice(0, 8)})
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Right: AI Badge -> + Phiên mới -> Xóa sạch */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
          <AiStatusBadge />

          <PixelButton
            variant="secondary"
            size="sm"
            icon="plus"
            onClick={handleCreateNewClick}
            disabled={loading}
            aria-label="Phiên mới"
          >
            Phiên mới
          </PixelButton>

          {session && (
            <PixelButton
              variant="danger"
              size="sm"
              icon="trash"
              onClick={() => setConfirmOpen(true)}
              disabled={loading}
              aria-label="Xóa sạch"
            >
              Xóa sạch
            </PixelButton>
          )}
        </div>
      </header>

      {/* Confirmation Dialog for New Session Creation */}
      <ConfirmDialog
        isOpen={confirmNewOpen}
        title="Tạo phiên làm việc mới?"
        message="Phiên làm việc hiện tại đang có dữ liệu chưa hoàn tất. Khi tạo phiên mới, dữ liệu hiện tại trong tab này sẽ mất vĩnh viễn (hệ thống không lưu trữ lâu dài trên máy chủ). Bạn có chắc chắn muốn bắt đầu phiên mới?"
        confirmLabel="Tạo phiên mới"
        cancelLabel="Hủy bỏ"
        onConfirm={executeCreateNew}
        onCancel={() => setConfirmNewOpen(false)}
      />

      {/* Confirmation Dialog for Session Deletion (Section 8.4) */}
      <ConfirmDialog
        isOpen={confirmOpen}
        title="Xóa sạch phiên làm việc?"
        message="Thao tác này sẽ xóa vĩnh viễn toàn bộ tệp nạp, phiên bản làm sạch, chỉ số tính toán và nhật ký kiểm toán của phiên hiện tại. Hành động này không thể hoàn tác!"
        confirmLabel="Xóa sạch phiên"
        cancelLabel="Hủy bỏ"
        onConfirm={handleDeleteSession}
        onCancel={() => setConfirmOpen(false)}
        loading={deleteLoading}
        danger
      />
    </>
  );
};
