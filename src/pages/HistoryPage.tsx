import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ConfirmDialog } from '../components/pixel/PixelModal';
import { PixelBadge } from '../components/pixel/PixelBadge';
import { PixelButton } from '../components/pixel/PixelButton';
import { PixelIcon } from '../components/pixel/PixelIcon';
import { EmptyState } from '../components/pixel/PixelStates';
import { PixelTable, type Column } from '../components/pixel/PixelTable';
import { useToast } from '../components/pixel/PixelToast';
import { useSession } from '../hooks/useSession';
import { deleteSession, listSessions } from '../services/sessionService';
import { sessionStore } from '../services/sessionStore';
import type { Session } from '../types/contract';
import { formatDateTime } from '../utils/format';
import { getCurrentStepPath, getStateBadgeVariant, getStateLabelVi } from '../utils/navigation';
import { getCleanArtifactInfo, getReportStatus } from '../services/readers';

export const HistoryPage: React.FC = () => {
  const navigate = useNavigate();
  const { session: currentSession, createNewSession } = useSession();
  const { showToast } = useToast();

  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  // Directly read from in-memory session service
  const sessions = listSessions();

  const handleOpenSession = (s: Session) => {
    sessionStore.setActiveSessionId(s.id);
    showToast({
      type: 'info',
      title: 'Đã chuyển phiên',
      message: `Đang làm việc trên phiên ${s.id.slice(0, 8)}.`,
    });
    const targetPath = getCurrentStepPath(s.state);
    navigate(targetPath);
  };

  const confirmDelete = async () => {
    if (!deletingId) return;
    setDeleteLoading(true);
    try {
      deleteSession(deletingId);
      showToast({
        type: 'success',
        title: 'Đã xóa phiên',
        message: 'Phiên làm việc đã được xóa hoàn toàn.',
      });
      if (currentSession?.id === deletingId) {
        await createNewSession();
      }
      setDeletingId(null);
    } catch (err: any) {
      showToast({
        type: 'error',
        title: 'Lỗi',
        message: err.message || 'Không thể xóa phiên.',
      });
    } finally {
      setDeleteLoading(false);
    }
  };

  const columns: Column<Session>[] = [
    {
      key: 'name',
      header: 'Tên phiên / Tệp dữ liệu',
      render: (s) => (
        <div>
          <div style={{ fontWeight: 600, color: 'var(--ink)' }}>
            {s.name || s.dataset?.filename || 'Phiên chưa đặt tên'}
          </div>
          <div style={{ fontSize: '11px', color: 'var(--ink-soft)' }}>
            ID: {s.id.slice(0, 8)}
            {s.id === currentSession?.id && (
              <span style={{ marginLeft: '6px', color: 'var(--accent-d)', fontWeight: 'bold' }}>
                [ ĐANG DÙNG ]
              </span>
            )}
          </div>
        </div>
      ),
    },
    {
      key: 'state',
      header: 'Trạng thái',
      render: (s) => (
        <PixelBadge variant={getStateBadgeVariant(s.state)} size="sm">
          {getStateLabelVi(s.state)}
        </PixelBadge>
      ),
    },
    {
      key: 'rows',
      header: 'Số dòng',
      align: 'right',
      render: (s) => (
        <span>{s.dataset?.rows ? s.dataset.rows.toLocaleString('vi-VN') : '—'}</span>
      ),
    },
    {
      key: 'reviewer',
      header: 'Người duyệt',
      render: (s) => {
        const clean = getCleanArtifactInfo(s.id);
        const report = getReportStatus(s.id);
        const reviewer = report?.reviewer_name || clean?.reviewer_name || '—';
        return <span style={{ fontSize: '13px' }}>{reviewer}</span>;
      },
    },
    {
      key: 'created_at',
      header: 'Thời điểm tạo',
      render: (s) => (
        <span style={{ fontSize: '13px', color: 'var(--ink)' }}>
          {formatDateTime(s.created_at)}
        </span>
      ),
    },
    {
      key: 'actions',
      header: 'Thao tác',
      align: 'center',
      render: (s) => (
        <div style={{ display: 'flex', gap: '8px', justifyContent: 'center' }}>
          <PixelButton
            variant="secondary"
            size="sm"
            icon="arrow-right"
            onClick={() => handleOpenSession(s)}
          >
            Mở
          </PixelButton>
          <PixelButton
            variant="danger"
            size="sm"
            icon="trash"
            onClick={() => setDeletingId(s.id)}
          >
            Xóa
          </PixelButton>
        </div>
      ),
    },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
      {/* Tab In-Memory Banner (Section 6.5 & 6.7) */}
      <div
        style={{
          padding: '10px 16px',
          backgroundColor: 'var(--panel)',
          border: '2px solid var(--ink)',
          fontSize: '13px',
          color: 'var(--ink)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
          <PixelIcon name="info" size={14} />
          <span><strong>Lưu ý:</strong> Dữ liệu chỉ tồn tại trong tab này. Tải lại trang sẽ bị mất. Chỉ hiện các phiên của lần mở này.</span>
        </span>
        <PixelButton
          variant="primary"
          size="sm"
          icon="plus"
          onClick={() => createNewSession()}
        >
          Tạo phiên mới
        </PixelButton>
      </div>

      {sessions.length === 0 ? (
        <EmptyState
          message="Chưa có phiên làm việc nào được lưu trong bộ nhớ."
          actionLabel="Tạo phiên ngay"
          onAction={() => createNewSession()}
        />
      ) : (
        <PixelTable
          columns={columns}
          data={sessions}
          keyExtractor={(s) => s.id}
        />
      )}

      {/* Confirmation Dialog for Session Deletion */}
      <ConfirmDialog
        isOpen={!!deletingId}
        title="Xác nhận xóa phiên"
        message="Hành động này sẽ xóa sạch dữ liệu phiên làm việc và toàn bộ nhật ký trong bộ nhớ tab này. Bạn có chắc chắn muốn xóa?"
        confirmLabel="Xóa phiên"
        cancelLabel="Hủy"
        onConfirm={confirmDelete}
        onCancel={() => setDeletingId(null)}
        loading={deleteLoading}
        danger
      />
    </div>
  );
};
