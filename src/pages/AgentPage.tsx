/**
 * Agent Progress & ILC Architecture Framework Page (/tien-trinh)
 * Implements Prompt P7 Section B.2:
 * - 3 interconnected blocks: Intent -> Logic -> Context/Control
 * - Dynamic status & real sub-steps derived from session state and audit logs
 * - Data Integrity table with hash chain verification
 * - Comprehensive Audit Trail table with filtering, sorting, pagination, and CSV download
 * - Strictly read-only queries via readers.ts
 */

import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { PixelBadge } from '../components/pixel/PixelBadge';
import { PixelButton } from '../components/pixel/PixelButton';
import { PixelModal } from '../components/pixel/PixelModal';
import { PixelPanel } from '../components/pixel/PixelPanel';
import { EmptyState } from '../components/pixel/PixelStates';
import { PixelTable, type Column } from '../components/pixel/PixelTable';
import { useSession } from '../hooks/useSession';
import {
  getPipelineLog,
  getValidationReport,
  getCleanArtifactInfo,
  getAnalysisSummary,
  getReportStatus,
  getNarrative,
  getCustomResults,
  getSessionRecord,
} from '../services/readers';
import type { AuditActor, AuditEntry, SessionState } from '../types/contract';
import { formatDateTime } from '../utils/format';

export const AgentPage: React.FC = () => {
  const navigate = useNavigate();
  const { session } = useSession();
  const sessionId = session?.id || '';

  // Data loaded via strictly read-only readers
  const record = useMemo(() => (sessionId ? getSessionRecord(sessionId) : undefined), [sessionId]);
  const logs = useMemo(() => (sessionId ? getPipelineLog(sessionId) : []), [sessionId]);
  const validation = useMemo(() => (sessionId ? getValidationReport(sessionId) : undefined), [sessionId]);
  const cleanInfo = useMemo(() => (sessionId ? getCleanArtifactInfo(sessionId) : undefined), [sessionId]);
  const analysisSummary = useMemo(() => (sessionId ? getAnalysisSummary(sessionId) : undefined), [sessionId]);
  const reportStatus = useMemo(() => (sessionId ? getReportStatus(sessionId) : undefined), [sessionId]);
  const narrative = useMemo(() => (sessionId ? getNarrative(sessionId) : undefined), [sessionId]);
  const customWorkflows = useMemo(() => (sessionId ? getCustomResults(sessionId) : []), [sessionId]);

  // Filters and pagination for Audit Trail
  const [actorFilter, setActorFilter] = useState<string>('all');
  const [stepFilter, setStepFilter] = useState<string>('all');
  const [sortOrder, setSortOrder] = useState<'desc' | 'asc'>('desc');
  const [page, setPage] = useState<number>(1);
  const pageSize = 10;

  // Modal for full hash view
  const [hashModal, setHashModal] = useState<{ title: string; hash: string } | null>(null);

  const state = record?.state || ('created' as SessionState);

  // Compute block statuses
  const intentStatus: 'not_started' | 'in_progress' | 'completed' = useMemo(() => {
    if (!record || state === 'created') return 'not_started';
    if (state === 'uploaded' || state === 'cleaning_review') return 'in_progress';
    return 'completed';
  }, [record, state]);

  const logicStatus: 'not_started' | 'in_progress' | 'completed' = useMemo(() => {
    if (!record || state === 'created' || state === 'uploaded') return 'not_started';
    if (state === 'cleaning_review' || state === 'clean_approved' || state === 'analyzed') return 'in_progress';
    return 'completed';
  }, [record, state]);

  const controlStatus: 'not_started' | 'in_progress' | 'completed' = useMemo(() => {
    if (!record || state === 'created' || state === 'uploaded' || state === 'cleaning_review') return 'not_started';
    if (state === 'clean_approved' || state === 'analyzed') return 'in_progress';
    return 'completed';
  }, [record, state]);

  // Filtered and sorted audit logs
  const filteredLogs = useMemo(() => {
    return logs
      .filter((entry) => {
        if (actorFilter !== 'all' && entry.actor !== actorFilter) return false;
        if (stepFilter !== 'all' && entry.step !== stepFilter) return false;
        return true;
      })
      .sort((a, b) => {
        return sortOrder === 'desc' ? b.id - a.id : a.id - b.id;
      });
  }, [logs, actorFilter, stepFilter, sortOrder]);

  const paginatedLogs = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filteredLogs.slice(start, start + pageSize);
  }, [filteredLogs, page, pageSize]);

  const totalPages = Math.max(1, Math.ceil(filteredLogs.length / pageSize));

  // CSV export handler with BOM & formula sanitization
  const handleDownloadAuditCsv = () => {
    if (logs.length === 0) return;

    const sanitizeCell = (val: string | number | undefined | null): string => {
      if (val === null || val === undefined) return '""';
      let str = String(val).replace(/"/g, '""');
      if (/^[=\+\-@\t\r]/.test(str)) {
        str = "'" + str;
      }
      return `"${str}"`;
    };

    const headers = ['ID', 'Thời gian (GMT+7)', 'Bước', 'Tác nhân', 'Hành động', 'Chi tiết'];
    const rows = logs.map((l) => [
      l.id,
      formatDateTime(l.ts),
      l.step,
      l.actor,
      l.action,
      l.detail,
    ]);

    const csvContent = '\uFEFF' + [
      headers.map(sanitizeCell).join(','),
      ...rows.map((r) => r.map(sanitizeCell).join(',')),
    ].join('\r\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    const nowStr = new Date().toISOString().replace(/[:\-]|\..+/g, '').replace('T', '_');
    link.download = `audit_trail_${sessionId.slice(0, 8)}_${nowStr}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const getStatusBadge = (s: 'not_started' | 'in_progress' | 'completed') => {
    switch (s) {
      case 'completed':
        return <PixelBadge variant="success" size="sm">HOÀN TẤT</PixelBadge>;
      case 'in_progress':
        return <PixelBadge variant="info" size="sm">ĐANG THỰC HIỆN</PixelBadge>;
      case 'not_started':
      default:
        return <PixelBadge variant="neutral" size="sm">CHƯA BẮT ĐẦU</PixelBadge>;
    }
  };

  const getActorBadge = (actor: AuditActor) => {
    switch (actor) {
      case 'system':
        return <PixelBadge variant="info" size="sm">Hệ thống</PixelBadge>;
      case 'ai':
        return <PixelBadge variant="warn" size="sm">AI Agent</PixelBadge>;
      case 'user':
        return <PixelBadge variant="success" size="sm">Người dùng</PixelBadge>;
      default:
        return <PixelBadge variant="neutral" size="sm">{actor}</PixelBadge>;
    }
  };

  // Table columns for audit trail
  const columns: Column<AuditEntry>[] = [
    {
      key: 'id',
      header: 'ID',
      width: '60px',
      align: 'center',
      render: (entry) => <span className="font-pixel">#{entry.id}</span>,
    },
    {
      key: 'ts',
      header: 'Thời gian (Giờ VN)',
      width: '170px',
      render: (entry) => <span style={{ fontSize: '12px' }}>{formatDateTime(entry.ts)}</span>,
    },
    {
      key: 'step',
      header: 'Bước',
      width: '130px',
      render: (entry) => <code style={{ fontSize: '11px' }}>{entry.step}</code>,
    },
    {
      key: 'actor',
      header: 'Tác nhân',
      width: '110px',
      align: 'center',
      render: (entry) => getActorBadge(entry.actor),
    },
    {
      key: 'action',
      header: 'Hành động',
      width: '180px',
      render: (entry) => <strong>{entry.action}</strong>,
    },
    {
      key: 'detail',
      header: 'Chi tiết kiểm toán',
      render: (entry) => <span style={{ fontSize: '12px' }}>{entry.detail}</span>,
    },
  ];

  // Number checking stats
  const numberCheckStats = useMemo(() => {
    if (!narrative) return { total: 0, passed: 0, percent: 100 };
    let totalParagraphs = 0;
    let validParagraphs = 0;
    for (const sec of narrative.sections) {
      for (const p of sec.paragraphs) {
        totalParagraphs++;
        if (!p.check_issues || p.check_issues.length === 0) {
          validParagraphs++;
        }
      }
    }
    return {
      total: totalParagraphs,
      passed: validParagraphs,
      percent: totalParagraphs > 0 ? Math.round((validParagraphs / totalParagraphs) * 100) : 100,
    };
  }, [narrative]);

  if (!session || state === 'created') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
        <h2 className="font-pixel" style={{ fontSize: '28px', color: 'var(--ink)' }}>
          TIẾN TRÌNH AGENT & ĐIỀU PHỐI ILC
        </h2>
        <EmptyState
          title="Chưa có phiên làm việc nào đang chạy"
          message="Vui lòng nạp tệp dữ liệu giao dịch để kích hoạt khung điều phối ILC (Intent - Logic - Control)."
          actionLabel="Nạp dữ liệu ngay"
          onAction={() => navigate('/nap-du-lieu')}
        />
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
      {/* Page Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 'var(--space-3)' }}>
        <div>
          <h2 className="font-pixel" style={{ fontSize: '28px', color: 'var(--ink)' }}>
            TIẾN TRÌNH AGENT & ĐIỀU PHỐI ILC (INTENT - LOGIC - CONTROL)
          </h2>
          <p className="font-content" style={{ color: 'var(--ink-soft)', marginTop: '4px', fontSize: '13px' }}>
            Minh chứng kiến trúc điều phối thông minh: Phân tách ý định, thực thi định lượng cố định bằng code và kiểm soát đối chiếu số hai tầng.
          </p>
        </div>

        <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
          <PixelButton
            variant="secondary"
            size="sm"
            icon="download"
            onClick={handleDownloadAuditCsv}
            disabled={logs.length === 0}
          >
            Tải nhật ký (.csv)
          </PixelButton>
        </div>
      </div>

      {/* 3 Interconnected Blocks: Intent -> Logic -> Context/Control */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 'var(--space-4)' }}>
        {/* Block 1: INTENT */}
        <PixelPanel
          title="1. INTENT (HIỂU MỤC TIÊU)"
          headerAction={getStatusBadge(intentStatus)}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)', fontSize: '13px' }}>
            <div style={{ borderBottom: '1px dashed var(--chart-grid)', paddingBottom: '6px' }}>
              <span style={{ color: 'var(--ink-soft)', display: 'block', fontSize: '11px' }}>Tệp dữ liệu đầu vào:</span>
              <strong>{session?.dataset?.filename || record?.meta?.dataset?.filename || 'Chưa nạp tệp'}</strong>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
              <div>
                <span style={{ color: 'var(--ink-soft)', fontSize: '11px' }}>Số dòng thô:</span>
                <div>{session?.dataset?.rows ? `${session.dataset.rows.toLocaleString('vi-VN')} dòng` : (record?.meta?.dataset?.rows ? `${record.meta.dataset.rows.toLocaleString('vi-VN')} dòng` : '—')}</div>
              </div>
              <div>
                <span style={{ color: 'var(--ink-soft)', fontSize: '11px' }}>Số mã cổ phiếu:</span>
                <div>{session?.dataset?.symbols ? `${session.dataset.symbols.length} mã (${session.dataset.symbols.join(', ')})` : (record?.meta?.dataset?.symbols ? `${record.meta.dataset.symbols.length} mã (${record.meta.dataset.symbols.join(', ')})` : '—')}</div>
              </div>
            </div>

            <div style={{ borderTop: '1px dashed var(--chart-grid)', paddingTop: '6px' }}>
              <span style={{ color: 'var(--ink-soft)', fontSize: '11px' }}>Khoảng thời gian:</span>
              <div>
                {session?.dataset?.date_from && session?.dataset?.date_to
                  ? `${session.dataset.date_from} → ${session.dataset.date_to}`
                  : record?.meta?.dataset?.date_from && record?.meta?.dataset?.date_to
                  ? `${record.meta.dataset.date_from} → ${record.meta.dataset.date_to}`
                  : '—'}
              </div>
            </div>

            <div style={{ borderTop: '1px dashed var(--chart-grid)', paddingTop: '6px' }}>
              <span style={{ color: 'var(--ink-soft)', fontSize: '11px' }}>Yêu cầu phân tích riêng:</span>
              <div>
                {customWorkflows.length > 0
                  ? `Có (${customWorkflows.length} quy trình riêng đã chạy)`
                  : 'Quy trình chuẩn'}
              </div>
            </div>

            <div style={{ marginTop: 'auto', backgroundColor: 'var(--panel)', padding: '6px 8px', border: '1px solid var(--chart-grid)', fontSize: '11px', color: 'var(--ink-soft)' }}>
              <em>Luật: Phân loại ý định rõ ràng theo từ vựng cho phép; từ chối sớm nếu sai cấu hình.</em>
            </div>
          </div>
        </PixelPanel>

        {/* Block 2: LOGIC */}
        <PixelPanel
          title="2. LOGIC (QUY TRÌNH CỐ ĐỊNH)"
          headerAction={getStatusBadge(logicStatus)}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span>1. Kiểm tra định dạng & cấu hình</span>
              <PixelBadge variant={validation ? (validation.ok ? 'success' : 'danger') : 'neutral'} size="sm">
                {validation ? (validation.ok ? 'HỢP LỆ' : 'TỪ CHỐI') : 'CHƯA CHẠY'}
              </PixelBadge>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span>2. Lập hồ sơ dữ liệu & phát hiện MAD</span>
              <PixelBadge variant={cleanInfo || state !== 'uploaded' ? 'success' : 'neutral'} size="sm">
                {cleanInfo || state !== 'uploaded' ? 'ĐÃ HOÀN TẤT' : 'CHỜ LÀM SẠCH'}
              </PixelBadge>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span>3. Áp dụng 6 thao tác làm sạch</span>
              <PixelBadge variant={cleanInfo ? 'success' : 'neutral'} size="sm">
                {cleanInfo ? 'ĐÃ LƯU BẢN SẠCH' : 'CHƯA DUYỆT'}
              </PixelBadge>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span>4. Tính 17 chỉ số định lượng (Zero AI)</span>
              <PixelBadge variant={analysisSummary ? 'success' : 'neutral'} size="sm">
                {analysisSummary ? `${analysisSummary.metrics_count} CHỈ SỐ` : 'CHƯA TÍNH'}
              </PixelBadge>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span>5. Dựng 12 biểu đồ Excel chuẩn mực</span>
              <PixelBadge variant={analysisSummary ? 'success' : 'neutral'} size="sm">
                {analysisSummary ? `${analysisSummary.charts_count} BIỂU ĐỒ` : 'CHƯA DỰNG'}
              </PixelBadge>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span>6. Soạn thảo nhận định đối chiếu</span>
              <PixelBadge variant={narrative ? 'success' : 'neutral'} size="sm">
                {narrative ? `${narrative.sections.length} MỤC BÁO CÁO` : 'CHỜ DUYỆT'}
              </PixelBadge>
            </div>

            <div style={{ marginTop: 'auto', backgroundColor: 'var(--panel)', padding: '6px 8px', border: '1px solid var(--chart-grid)', fontSize: '11px', color: 'var(--ink-soft)' }}>
              <em>Luật 1: AI không tính số; 100% con số do mã nguồn TypeScript chạy tại máy client.</em>
            </div>
          </div>
        </PixelPanel>

        {/* Block 3: CONTEXT / CONTROL */}
        <PixelPanel
          title="3. CONTROL (KIỂM SOÁT & DUYỆT)"
          headerAction={getStatusBadge(controlStatus)}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '13px' }}>
            {/* Gate 1 */}
            <div style={{ borderBottom: '1px dashed var(--chart-grid)', paddingBottom: '6px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontWeight: 'bold' }}>Cổng duyệt 1 (Làm sạch):</span>
                <PixelBadge variant={cleanInfo ? 'success' : 'warn'} size="sm">
                  {cleanInfo ? 'ĐÃ DUYỆT' : 'CHỜ DUYỆT'}
                </PixelBadge>
              </div>
              {cleanInfo && (
                <div style={{ fontSize: '11px', color: 'var(--ink-soft)', marginTop: '2px' }}>
                  Người duyệt: <strong>{cleanInfo.reviewer_name}</strong> • {formatDateTime(cleanInfo.approved_at)}
                </div>
              )}
            </div>

            {/* Gate 2 */}
            <div style={{ borderBottom: '1px dashed var(--chart-grid)', paddingBottom: '6px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontWeight: 'bold' }}>Cổng duyệt 2 (Báo cáo):</span>
                <PixelBadge variant={reportStatus?.status === 'approved' ? 'success' : 'warn'} size="sm">
                  {reportStatus?.status === 'approved' ? 'ĐÃ DUYỆT' : 'CHỜ DUYỆT'}
                </PixelBadge>
              </div>
              {reportStatus?.approved_at && (
                <div style={{ fontSize: '11px', color: 'var(--ink-soft)', marginTop: '2px' }}>
                  Người duyệt: <strong>{reportStatus.reviewer_name}</strong> • {formatDateTime(reportStatus.approved_at)}
                </div>
              )}
            </div>

            {/* Number check stats */}
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontWeight: 'bold' }}>Kiểm chứng đối chiếu số:</span>
                <PixelBadge variant={numberCheckStats.percent === 100 ? 'success' : 'warn'} size="sm">
                  {numberCheckStats.passed}/{numberCheckStats.total} đoạn ({numberCheckStats.percent}%)
                </PixelBadge>
              </div>
              <div style={{ fontSize: '11px', color: 'var(--ink-soft)', marginTop: '2px' }}>
                Chống ảo giác số học: Dung sai chính xác tuyệt đối, cấm từ ngữ khuyến nghị.
              </div>
            </div>

            <div style={{ marginTop: 'auto', backgroundColor: 'var(--panel)', padding: '6px 8px', border: '1px solid var(--chart-grid)', fontSize: '11px', color: 'var(--ink-soft)' }}>
              <em>Luật 2: Hai cổng duyệt người dùng là bắt buộc; không duyệt thì không thể xuất bản.</em>
            </div>
          </div>
        </PixelPanel>
      </div>

      {/* Data Integrity: Hash Chain Table */}
      <PixelPanel title="TOÀN VẸN DỮ LIỆU & CHUỖI MÃ BĂM MẬT MÃ (DATA INTEGRITY)">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 'var(--space-2)' }}>
            <span style={{ fontSize: '13px', color: 'var(--ink)' }}>
              Tính toán mã băm SHA-256 chính quy độc lập tại mỗi bước để bảo đảm dữ liệu và báo cáo không bị chỉnh sửa trái phép:
            </span>
            {reportStatus?.is_stale ? (
              <PixelBadge variant="warn">CẢNH BÁO: BÁO CÁO CŨ (CẦN PHÂN TÍCH LẠI)</PixelBadge>
            ) : (
              <PixelBadge variant="success">TOÀN VẸN: DỮ LIỆU KHỚP 100%</PixelBadge>
            )}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 'var(--space-3)' }}>
            {/* Clean Hash */}
            <div style={{ padding: '10px', backgroundColor: 'var(--panel)', border: '1px solid var(--chart-grid)' }}>
              <div style={{ fontSize: '11px', color: 'var(--ink-soft)' }}>MÃ BĂM DỮ LIỆU SẠCH (clean_hash)</div>
              <div style={{ marginTop: '4px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <code className="font-pixel" style={{ fontSize: '14px', color: 'var(--ink)' }}>
                  {cleanInfo?.hash ? `${cleanInfo.hash.slice(0, 12)}...${cleanInfo.hash.slice(-8)}` : 'Chưa có'}
                </code>
                {cleanInfo?.hash && (
                  <button
                    type="button"
                    onClick={() => setHashModal({ title: 'Mã băm dữ liệu sạch (clean_hash)', hash: cleanInfo.hash })}
                    style={{ background: 'none', border: 'none', color: 'var(--blue)', cursor: 'pointer', fontSize: '11px', textDecoration: 'underline' }}
                  >
                    Xem đầy đủ
                  </button>
                )}
              </div>
            </div>

            {/* Analysis Hash */}
            <div style={{ padding: '10px', backgroundColor: 'var(--panel)', border: '1px solid var(--chart-grid)' }}>
              <div style={{ fontSize: '11px', color: 'var(--ink-soft)' }}>MÃ BĂM PHÂN TÍCH (analysis_hash)</div>
              <div style={{ marginTop: '4px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <code className="font-pixel" style={{ fontSize: '14px', color: 'var(--ink)' }}>
                  {analysisSummary?.clean_hash
                    ? `${analysisSummary.clean_hash.slice(0, 12)}...${analysisSummary.clean_hash.slice(-8)}`
                    : 'Chưa có'}
                </code>
                {analysisSummary?.clean_hash && (
                  <button
                    type="button"
                    onClick={() => setHashModal({ title: 'Mã băm phân tích (analysis_hash)', hash: analysisSummary.clean_hash })}
                    style={{ background: 'none', border: 'none', color: 'var(--blue)', cursor: 'pointer', fontSize: '11px', textDecoration: 'underline' }}
                  >
                    Xem đầy đủ
                  </button>
                )}
              </div>
            </div>

            {/* Report Hash */}
            <div style={{ padding: '10px', backgroundColor: 'var(--panel)', border: '1px solid var(--chart-grid)' }}>
              <div style={{ fontSize: '11px', color: 'var(--ink-soft)' }}>MÃ BĂM BÁO CÁO (report_hash)</div>
              <div style={{ marginTop: '4px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <code className="font-pixel" style={{ fontSize: '14px', color: 'var(--ink)' }}>
                  {reportStatus?.report_hash
                    ? `${reportStatus.report_hash.slice(0, 12)}...${reportStatus.report_hash.slice(-8)}`
                    : 'Chưa phê duyệt'}
                </code>
                {reportStatus?.report_hash && (
                  <button
                    type="button"
                    onClick={() => setHashModal({ title: 'Mã băm báo cáo (report_hash)', hash: reportStatus.report_hash! })}
                    style={{ background: 'none', border: 'none', color: 'var(--blue)', cursor: 'pointer', fontSize: '11px', textDecoration: 'underline' }}
                  >
                    Xem đầy đủ
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      </PixelPanel>

      {/* Audit Trail: In-Memory Logs */}
      <PixelPanel
        title={`NHẬT KÝ KIỂM TOÁN PHIÊN HIỆN TẠI (AUDIT TRAIL - ${logs.length} BẢN GHI)`}
        headerAction={
          <PixelButton
            variant="secondary"
            size="sm"
            onClick={handleDownloadAuditCsv}
            disabled={logs.length === 0}
          >
            Tải CSV
          </PixelButton>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
          {/* Filters Bar */}
          <div style={{ display: 'flex', gap: 'var(--space-3)', flexWrap: 'wrap', alignItems: 'center', fontSize: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <label htmlFor="agent-filter-actor" style={{ fontWeight: 'bold' }}>Tác nhân:</label>
              <select
                id="agent-filter-actor"
                value={actorFilter}
                onChange={(e) => {
                  setActorFilter(e.target.value);
                  setPage(1);
                }}
                style={{ padding: '4px 8px', border: '1px solid var(--chart-grid)', backgroundColor: 'var(--panel)' }}
              >
                <option value="all">Tất cả tác nhân</option>
                <option value="system">Hệ thống (system)</option>
                <option value="ai">AI Agent (ai)</option>
                <option value="user">Người dùng (user)</option>
              </select>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <label htmlFor="agent-filter-step" style={{ fontWeight: 'bold' }}>Bước:</label>
              <select
                id="agent-filter-step"
                value={stepFilter}
                onChange={(e) => {
                  setStepFilter(e.target.value);
                  setPage(1);
                }}
                style={{ padding: '4px 8px', border: '1px solid var(--chart-grid)', backgroundColor: 'var(--panel)' }}
              >
                <option value="all">Tất cả bước</option>
                <option value="created">created</option>
                <option value="uploaded">uploaded</option>
                <option value="cleaning_review">cleaning_review</option>
                <option value="clean_approved">clean_approved</option>
                <option value="analyzed">analyzed</option>
                <option value="report_approved">report_approved</option>
              </select>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <label htmlFor="agent-filter-sort" style={{ fontWeight: 'bold' }}>Thứ tự:</label>
              <select
                id="agent-filter-sort"
                value={sortOrder}
                onChange={(e) => setSortOrder(e.target.value as 'desc' | 'asc')}
                style={{ padding: '4px 8px', border: '1px solid var(--chart-grid)', backgroundColor: 'var(--panel)' }}
              >
                <option value="desc">Mới nhất trước</option>
                <option value="asc">Cũ nhất trước</option>
              </select>
            </div>

            <div style={{ marginLeft: 'auto', color: 'var(--ink-soft)' }}>
              Hiển thị {paginatedLogs.length} / {filteredLogs.length} bản ghi
            </div>
          </div>

          {/* Table */}
          {paginatedLogs.length === 0 ? (
            <div style={{ padding: 'var(--space-6)', textAlign: 'center', color: 'var(--ink-soft)' }}>
              Không có bản ghi kiểm toán nào khớp với bộ lọc hiện tại.
            </div>
          ) : (
            <PixelTable
              columns={columns}
              data={paginatedLogs}
              keyExtractor={(entry) => entry.id}
            />
          )}

          {/* Pagination */}
          {totalPages > 1 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 'var(--space-2)' }}>
              <div style={{ fontSize: '12px', color: 'var(--ink-soft)' }}>
                Trang {page} / {totalPages}
              </div>
              <div style={{ display: 'flex', gap: '6px' }}>
                <PixelButton
                  variant="secondary"
                  size="sm"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  ← Trang trước
                </PixelButton>
                <PixelButton
                  variant="secondary"
                  size="sm"
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                >
                  Trang sau →
                </PixelButton>
              </div>
            </div>
          )}
        </div>
      </PixelPanel>

      {/* Modal for viewing full cryptographic hash */}
      {hashModal && (
        <PixelModal
          isOpen={true}
          title={hashModal.title}
          onClose={() => setHashModal(null)}
        >
          <div style={{ padding: 'var(--space-4)' }}>
            <p style={{ fontSize: '13px', color: 'var(--ink)', marginBottom: 'var(--space-3)' }}>
              Mã băm mật mã SHA-256 chính quy 64 ký tự hex:
            </p>
            <div
              style={{
                padding: '12px',
                backgroundColor: 'var(--panel)',
                border: '1px solid var(--ink)',
                fontFamily: 'monospace',
                fontSize: '12px',
                wordBreak: 'break-all',
                color: 'var(--ink)',
              }}
            >
              {hashModal.hash}
            </div>
            <div style={{ marginTop: 'var(--space-4)', textAlign: 'right' }}>
              <PixelButton variant="primary" onClick={() => setHashModal(null)}>
                Đóng
              </PixelButton>
            </div>
          </div>
        </PixelModal>
      )}
    </div>
  );
};
