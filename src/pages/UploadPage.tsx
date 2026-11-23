import React, { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArtifactStore } from '../core/artifacts';
import type { RawDataset } from '../core/dataset';
import type { ColumnRole, ColumnRoleMapping } from '../core/businessTable';
import type { ValidationIssue } from '../core/schemas';
import { validateBytes, type ValidationOutcome, type ValidationProgress } from '../core/validator';
import { normalizeContext } from '../core/context/normalize';
import {
  EXTRA_INFO_MAX_CHARS,
  EXTRA_INFO_MIN_RECOMMENDED_CHARS,
  MAX_ANALYSIS_QUESTIONS,
  countVietnameseWords,
  getTopPopularQuestions,
  getVisibleSuggestions,
  hasQuestionInText,
  parseQuestionLines,
  toggleQuestionInText,
  type SuggestionGroup,
} from '../core/context/suggestions';
import { vi } from '../i18n/vi';
import { useSession } from '../hooks/useSession';
import {
  buildErrorCsv,
  getSchemaInfo,
  runUpload,
} from '../services/uploadService';
import { setBusinessContext } from '../services/sessionService';
import { getBusinessContext } from '../services/readers';
import { PixelBadge } from '../components/pixel/PixelBadge';
import { PixelButton } from '../components/pixel/PixelButton';
import { PixelIcon } from '../components/pixel/PixelIcon';
import { ConfirmDialog, PixelModal } from '../components/pixel/PixelModal';
import { PixelPanel } from '../components/pixel/PixelPanel';
import { PixelProgress, PixelTabs } from '../components/pixel/PixelProgressAndTabs';
import { PixelSprite } from '../components/pixel/PixelSprite';
import { PixelTable, type Column } from '../components/pixel/PixelTable';
import { useToast } from '../components/pixel/PixelToast';

interface PreviewRow {
  stt: number;
  row: number;
  date: string;
  symbol: string;
  open: string;
  high: string;
  low: string;
  close: string;
  volume: string;
}

export const UploadPage: React.FC = () => {
  const navigate = useNavigate();
  const { session, createNewSession } = useSession();
  const { showToast } = useToast();

  const fileInputId = useId();
  const extraInfoId = useId();
  const questionsId = useId();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  // -------------------------------------------------------------
  // D3 / U2: Business Context Form State
  // -------------------------------------------------------------
  const [companyName, setCompanyName] = useState('');
  const [userRole, setUserRole] = useState('');
  const [extraInfo, setExtraInfo] = useState('');
  const [questionsText, setQuestionsText] = useState('');
  const [contextSaved, setContextSaved] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [showClearContextConfirm, setShowClearContextConfirm] = useState(false);
  const [showReportApprovedConfirm, setShowReportApprovedConfirm] = useState(false);
  const [showUseTop3Confirm, setShowUseTop3Confirm] = useState(false);
  const [limitNotice, setLimitNotice] = useState<string | null>(null);
  const [suggestionTab, setSuggestionTab] = useState<SuggestionGroup>(() => {
    if (session?.dataset) {
      return session.dataset.kind === 'business' ? 'business' : 'trading';
    }
    return 'business';
  });

  // Initialize context from session & sync default suggestion tab to dataset kind
  useEffect(() => {
    if (!session) return;
    const ctx = getBusinessContext(session.id);
    if (ctx) {
      setCompanyName(ctx.company_name || '');
      setUserRole(ctx.role || '');
      setExtraInfo(ctx.extra_info || '');
      setQuestionsText((ctx.analysis_questions || []).join('\n'));
    }
    if (session.dataset) {
      const detectedKind = session.dataset.kind === 'business' ? 'business' : 'trading';
      setSuggestionTab(detectedKind);
      setFileReqTab(detectedKind);
    } else {
      setSuggestionTab('business');
    }
  }, [session?.id, session?.dataset?.kind]);

  // Two-tab File Requirements Card ('trading' | 'business')
  const [fileReqTab, setFileReqTab] = useState<'trading' | 'business'>('business');

  // Upload States: 'idle' | 'dragover' | 'processing' | 'success' | 'rejected'
  const [dragOver, setDragOver] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [progress, setProgress] = useState<ValidationProgress | null>(null);
  const [outcome, setOutcome] = useState<ValidationOutcome | null>(null);
  const isBusinessMode = outcome ? (outcome.ok ? outcome.meta.kind === 'business' : false) : fileReqTab === 'business';

  // Role Changer State for Business Dataset
  const [businessRoles, setBusinessRoles] = useState<ColumnRoleMapping[]>([]);

  // Confirm dialog when re-uploading on advanced session states
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [showConfirmReupload, setShowConfirmReupload] = useState(false);

  // Warning expansion toggle in success state
  const [showWarnings, setShowWarnings] = useState(false);

  // Test cases modal (55 test cases)
  const [showTestCasesModal, setShowTestCasesModal] = useState(false);
  const [testCasesManifest, setTestCasesManifest] = useState<any[]>([]);

  const schemaInfo = useMemo(() => getSchemaInfo(), []);

  // Check if session already has a loaded dataset
  const currentDatasetMeta = session?.dataset;
  const isAdvancedState =
    session &&
    session.state !== 'created' &&
    session.state !== 'uploaded';

  // Handle URL query parameters for demonstration / visual audit
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const p = new URLSearchParams(window.location.search);
    if (p.get('tab') === 'business') {
      setFileReqTab('business');
    }
    if (p.get('demoBusiness') === '1' || p.get('sample') === 'business') {
      fetch('/samples/business/du-lieu-test-ban-le.csv')
        .then((res) => (res.ok ? res.arrayBuffer() : null))
        .then(async (buf) => {
          if (!buf) return;
          const valRes = await validateBytes('du-lieu-test-ban-le.csv', new Uint8Array(buf));
          if (valRes.ok) {
            setOutcome(valRes);
            if (valRes.meta.columns_roles) {
              setBusinessRoles(valRes.meta.columns_roles as ColumnRoleMapping[]);
            }
          }
        })
        .catch((e) => console.error('Failed to load demo business sample', e));
    }
    const demoU2 = p.get('demoU2');
    if (demoU2 === 'empty') {
      setExtraInfo('');
      setQuestionsText('');
      setSuggestionTab('business');
      setLimitNotice(null);
    } else if (demoU2 === 'few') {
      setExtraInfo('');
      setQuestionsText(getTopPopularQuestions('business', 3).join('\n'));
      setSuggestionTab('business');
      setLimitNotice(null);
    } else if (demoU2 === 'max8') {
      const bizQs = getVisibleSuggestions('business').map((s) => s.text);
      const genQs = getVisibleSuggestions('general').map((s) => s.text);
      setExtraInfo('');
      setQuestionsText([...bizQs, ...genQs].slice(0, MAX_ANALYSIS_QUESTIONS).join('\n'));
      setSuggestionTab('business');
      setLimitNotice(vi.contextForm.suggestionsLimitNotice);
    } else if (demoU2 === 'rich') {
      setCompanyName('Cửa hàng Thời trang An Phát');
      setUserRole('Chủ cửa hàng');
      setExtraInfo(
        'Cửa hàng thời trang có ba kênh bán (cửa hàng, website, sàn thương mại điện tử). Tôi là chủ cửa hàng, đang lo biên lợi nhuận giảm từ tháng 9 và muốn biết nên tập trung vào kênh nào.'
      );
      setQuestionsText(getTopPopularQuestions('business', 3).join('\n'));
      setSuggestionTab('business');
      setLimitNotice(null);
    }
  }, []);

  // Validate form questions & extra info metrics
  const parsedQuestions = useMemo(() => parseQuestionLines(questionsText), [questionsText]);
  const extraInfoWordCount = useMemo(() => countVietnameseWords(extraInfo), [extraInfo]);
  const extraInfoHasEnoughContext = extraInfo.trim().length >= EXTRA_INFO_MIN_RECOMMENDED_CHARS;

  const visibleSuggestions = useMemo(
    () => getVisibleSuggestions(suggestionTab),
    [suggestionTab]
  );

  const suggestionTabs = useMemo(
    () => [
      { id: 'business', label: vi.contextForm.tabs.business },
      { id: 'trading', label: vi.contextForm.tabs.trading },
      { id: 'general', label: vi.contextForm.tabs.general },
    ],
    []
  );

  const isContextValid = useMemo(() => {
    if (isBusinessMode) {
      return extraInfo.trim().length <= EXTRA_INFO_MAX_CHARS;
    }
    if (extraInfo.trim().length > EXTRA_INFO_MAX_CHARS) return false;
    if (parsedQuestions.length === 0 || parsedQuestions.length > MAX_ANALYSIS_QUESTIONS) return false;
    return parsedQuestions.every((q) => q.length >= 5 && q.length <= 200);
  }, [isBusinessMode, parsedQuestions, extraInfo]);

  // Save Business Context handler
  const handleSaveContext = useCallback(
    (overrides?: {
      companyName?: string;
      userRole?: string;
      extraInfo?: string;
      questionsText?: string;
    }) => {
      if (!session) return;
      const cName = overrides?.companyName ?? companyName;
      const r = overrides?.userRole ?? userRole;
      const extra = overrides?.extraInfo ?? extraInfo;
      const qText = overrides?.questionsText ?? questionsText;

      const rawQuestions = qText
        .split('\n')
        .map((l) => l.trim())
        .filter((l) => l.length > 0);

      const res = normalizeContext(
        {
          company_name: cName,
          role: r,
          extra_info: extra,
          analysis_questions: isBusinessMode ? [] : rawQuestions,
        },
        { allowEmptyQuestions: isBusinessMode }
      );

      if (!res.ok) {
        const errMsg = res.error || 'Dữ liệu bối cảnh không hợp lệ.';
        if (extra.trim().length > EXTRA_INFO_MAX_CHARS) {
          setFieldErrors({ extra_info: vi.contextForm.extraInfoLimitError });
        } else {
          setFieldErrors({ general: errMsg });
        }
        return;
      }

      setFieldErrors({});

      if (session.state === 'report_approved') {
        setShowReportApprovedConfirm(true);
        return;
      }

      try {
        setBusinessContext(session.id, res.data!);
        setContextSaved(true);
        setTimeout(() => setContextSaved(false), 2000);
      } catch (err: any) {
        showToast({ type: 'error', title: 'Lỗi lưu bối cảnh', message: err.message });
      }
    },
    [session, companyName, userRole, extraInfo, questionsText, showToast]
  );

  const handleConfirmReportApprovedEdit = () => {
    if (!session) return;
    const res = normalizeContext({
      company_name: companyName,
      role: userRole,
      extra_info: extraInfo,
      analysis_questions: parsedQuestions,
    });
    if (res.ok) {
      setBusinessContext(session.id, res.data!);
      setShowReportApprovedConfirm(false);
      setContextSaved(true);
      setTimeout(() => setContextSaved(false), 2000);
      showToast({
        type: 'warn',
        title: 'Báo cáo chuyển về chờ duyệt',
        message: 'Do bối cảnh đã thay đổi, báo cáo cần được xem xét và phê duyệt lại.',
      });
    }
  };

  const handleToggleSuggestion = (chip: string) => {
    const result = toggleQuestionInText(questionsText, chip, MAX_ANALYSIS_QUESTIONS);
    if (result.action === 'limit_reached') {
      setLimitNotice(vi.contextForm.suggestionsLimitNotice);
      showToast({
        type: 'warn',
        title: 'Đạt giới hạn câu hỏi',
        message: vi.contextForm.suggestionsLimitNotice,
      });
      return;
    }
    setLimitNotice(null);
    setQuestionsText(result.nextText);
    if (result.count > 0) {
      handleSaveContext({ questionsText: result.nextText });
    }
  };

  const applyTop3ForActiveGroup = () => {
    const top3 = getTopPopularQuestions(suggestionTab, 3);
    const nextText = top3.join('\n');
    setLimitNotice(null);
    setQuestionsText(nextText);
    setShowUseTop3Confirm(false);
    if (top3.length > 0) {
      handleSaveContext({ questionsText: nextText });
    }
  };

  const handleUseTop3Click = () => {
    if (parsedQuestions.length === 0) {
      applyTop3ForActiveGroup();
    } else {
      setShowUseTop3Confirm(true);
    }
  };

  const handleClearContext = () => {
    setCompanyName('');
    setUserRole('');
    setExtraInfo('');
    setQuestionsText('');
    setLimitNotice(null);
    setFieldErrors({});
    if (session) {
      setBusinessContext(session.id, { analysis_questions: [] });
    }
    setShowClearContextConfirm(false);
  };

  // Extract preview data if session or outcome has raw dataset
  const previewRows = useMemo<PreviewRow[]>(() => {
    if (!session) return [];
    if (session?.dataset?.kind === 'business') return [];
    const raw = ArtifactStore.get<RawDataset>(session.id, 'raw');
    if (!raw || raw.n === 0) return [];

    const count = Math.min(20, raw.n);
    const rows: PreviewRow[] = [];

    for (let i = 0; i < count; i++) {
      const sym = raw.symbols[raw.symbol_idx[i]] || '';
      const dt = new Date(raw.date_days[i] * 86400000).toISOString().slice(0, 10);
      rows.push({
        stt: i + 1,
        row: raw.source_row[i],
        date: dt,
        symbol: sym,
        open: isNaN(raw.open[i]) ? '-' : raw.open[i].toLocaleString('vi-VN', { minimumFractionDigits: 2 }),
        high: isNaN(raw.high[i]) ? '-' : raw.high[i].toLocaleString('vi-VN', { minimumFractionDigits: 2 }),
        low: isNaN(raw.low[i]) ? '-' : raw.low[i].toLocaleString('vi-VN', { minimumFractionDigits: 2 }),
        close: isNaN(raw.close[i]) ? '-' : raw.close[i].toLocaleString('vi-VN', { minimumFractionDigits: 2 }),
        volume: isNaN(raw.volume[i]) ? '-' : raw.volume[i].toLocaleString('vi-VN'),
      });
    }

    return rows;
  }, [session, outcome]);

  // Execute actual upload with Web Worker
  const processUpload = useCallback(
    async (file: File) => {
      let activeSession = session;

      if (!activeSession) {
        activeSession = await createNewSession();
      }

      // Ensure context is saved into session before upload
      if (!isContextValid) {
        showToast({
          type: 'error',
          title: 'Thiếu yêu cầu phân tích',
          message: 'Vui lòng nhập ít nhất một câu hỏi phân tích ở khung 1 trước khi nạp tệp.',
        });
        return;
      }

      handleSaveContext();

      setProcessing(true);
      setProgress({ stage: 'S1', percent: 5, label_vi: 'Đang kiểm tra định dạng tệp...' });
      setOutcome(null);

      const controller = new AbortController();
      abortControllerRef.current = controller;

      try {
        const res = await runUpload(activeSession.id, file, {
          signal: controller.signal,
          onProgress: (p) => {
            setProgress(p);
          },
        });

        setOutcome(res);
        if (res.ok) {
          const detectedKind = res.meta.kind === 'business' ? 'business' : 'trading';
          setSuggestionTab(detectedKind);
          setFileReqTab(detectedKind);
          if (res.meta.kind === 'business' && res.meta.columns_roles) {
            setBusinessRoles(res.meta.columns_roles as ColumnRoleMapping[]);
          }
        }
      } catch (err: any) {
        if (err.message === 'VALIDATION_ABORTED') {
          showToast({
            type: 'info',
            title: 'Đã hủy nạp tệp',
            message: 'Tác vụ kiểm tra tệp đã được dừng.',
          });
        } else {
          showToast({
            type: 'error',
            title: 'Lỗi nạp tệp',
            message: err.message || 'Không thể xử lý tệp tải lên.',
          });
        }
      } finally {
        setProcessing(false);
        setProgress(null);
        abortControllerRef.current = null;
      }
    },
    [session, createNewSession, isContextValid, handleSaveContext, showToast]
  );

  const handleRoleChange = (colIdx: number, newRole: ColumnRole) => {
    if (!businessRoles[colIdx]) return;
    const updated = [...businessRoles];
    updated[colIdx] = { ...updated[colIdx], role: newRole };

    // Invariant checks: <= 1 id, <= 1 time, >= 1 measure, >= 1 dimension
    const idCount = updated.filter((r) => r.role === 'id').length;
    const timeCount = updated.filter((r) => r.role === 'time').length;
    const measureCount = updated.filter((r) => r.role === 'measure').length;
    const dimCount = updated.filter((r) => r.role === 'dimension').length;

    if (idCount > 1) {
      showToast({ type: 'warn', title: 'Ràng buộc vai trò', message: 'Tối đa 1 cột được đặt làm Mã dòng (id).' });
      return;
    }
    if (timeCount > 1) {
      showToast({ type: 'warn', title: 'Ràng buộc vai trò', message: 'Tối đa 1 cột được đặt làm Thời gian (time).' });
      return;
    }
    if (measureCount === 0) {
      showToast({ type: 'warn', title: 'Ràng buộc vai trò', message: 'Bảng cần có ít nhất 1 cột Số liệu (measure).' });
      return;
    }
    if (dimCount === 0) {
      showToast({ type: 'warn', title: 'Ràng buộc vai trò', message: 'Bảng cần có ít nhất 1 cột Phân loại (dimension).' });
      return;
    }

    setBusinessRoles(updated);
    if (session && outcome && outcome.ok) {
      outcome.meta.columns_roles = updated;
    }
    showToast({ type: 'success', title: 'Đã cập nhật vai trò', message: `Cột "${updated[colIdx].file_header}" chuyển sang ${newRole}.` });
  };

  // File drag & drop handlers
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    if (isContextValid) setDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (!isContextValid) {
      showToast({
        type: 'warn',
        title: 'Khung nạp tệp đang bị khóa',
        message: 'Hãy nhập ít nhất một yêu cầu phân tích để mở khóa khung nạp file.',
      });
      return;
    }
    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      handleFileSelected(files[0]);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      handleFileSelected(files[0]);
    }
  };

  const handleFileSelected = (file: File) => {
    if (isAdvancedState) {
      setPendingFile(file);
      setShowConfirmReupload(true);
    } else {
      processUpload(file);
    }
  };

  const handleConfirmReupload = () => {
    if (pendingFile) {
      const fileToUpload = pendingFile;
      setPendingFile(null);
      setShowConfirmReupload(false);
      processUpload(fileToUpload);
    }
  };

  const handleCancelUpload = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
  };

  const handleReset = () => {
    setOutcome(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleDownloadErrorCsv = () => {
    if (!outcome || outcome.ok) return;
    const csvContent = buildErrorCsv(outcome);
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `bao-cao-loi-${outcome.filename}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleOpenTestCases = async () => {
    try {
      const res = await fetch('/samples/test-cases/MANIFEST.json');
      if (res.ok) {
        const data = await res.json();
        setTestCasesManifest(Array.isArray(data) ? data : data.test_cases || []);
      }
    } catch {
      // Fallback
    }
    setShowTestCasesModal(true);
  };

  // Group rejection errors by code for chips display
  const errorGroups = useMemo(() => {
    if (!outcome || outcome.ok) return [];
    const groups: Record<string, number> = {};
    for (const issue of outcome.issues) {
      if (issue.severity === 'error') {
        groups[issue.code] = (groups[issue.code] || 0) + 1;
      }
    }
    return Object.entries(groups).map(([code, count]) => ({ code, count }));
  }, [outcome]);

  // Columns for preview table (Trading)
  const previewColumns: Column<PreviewRow>[] = [
    { key: 'stt', header: '#', width: '50px', align: 'center' },
    { key: 'row', header: 'Dòng tệp', width: '80px', align: 'center' },
    { key: 'date', header: 'Ngày', width: '110px' },
    { key: 'symbol', header: 'Mã', width: '70px', align: 'center' },
    { key: 'open', header: 'Mở', align: 'right' },
    { key: 'high', header: 'Cao', align: 'right' },
    { key: 'low', header: 'Thấp', align: 'right' },
    { key: 'close', header: 'Đóng', align: 'right' },
    { key: 'volume', header: 'Khối lượng', align: 'right' },
  ];

  // Columns for error issues table
  const issueColumns: Column<ValidationIssue>[] = [
    {
      key: 'code',
      header: 'Mã lỗi',
      width: '180px',
      render: (item) => (
        <span
          className="font-pixel"
          style={{
            fontSize: '12px',
            color: item.severity === 'error' ? 'var(--bad)' : 'var(--warn-text)',
          }}
        >
          {item.code}
        </span>
      ),
    },
    {
      key: 'pos',
      header: 'Vị trí',
      width: '100px',
      render: (item) => (
        <span>
          {item.sheet ? `[${item.sheet}] ` : ''}
          {item.row ? `Dòng ${item.row}` : 'Toàn tệp'}
          {item.column ? `, ${item.column}` : ''}
        </span>
      ),
    },
    {
      key: 'value',
      header: 'Giá trị sai',
      width: '110px',
      render: (item) => (
        <code style={{ fontSize: '11px', color: 'var(--ink)' }}>
          {item.value !== undefined && item.value !== null ? String(item.value) : '-'}
        </code>
      ),
    },
    {
      key: 'message_vi',
      header: 'Mô tả & Khắc phục',
      render: (item) => (
        <div>
          <div style={{ fontWeight: 600, color: 'var(--ink)' }}>{item.message_vi}</div>
          <div style={{ fontSize: '12px', color: 'var(--ink-soft)', marginTop: '2px', display: 'flex', alignItems: 'center', gap: '4px' }}>
            <PixelIcon name="info" size={12} />
            <span>{item.fix_vi}</span>
          </div>
        </div>
      ),
    },
  ];

  const totalErrors = outcome && !outcome.ok ? outcome.issues.filter((i) => i.severity === 'error').length : 0;
  const totalWarnings = outcome && !outcome.ok ? outcome.issues.filter((i) => i.severity === 'warning').length : 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)', paddingBottom: 'var(--space-8)' }}>
      {/* Page Header */}
      <div>
        <h2 className="font-pixel" style={{ fontSize: '28px', color: 'var(--ink)' }}>
          NẠP DỮ LIỆU
        </h2>
        <p className="font-content" style={{ color: 'var(--ink-soft)', marginTop: '4px' }}>
          Tải lên bảng tính Excel (.xlsx) hoặc tệp CSV: dữ liệu giao dịch chứng khoán hoặc bảng số liệu kinh doanh.
        </p>

        {/* Tab memory notice banner */}
        <div
          style={{
            marginTop: '8px',
            padding: '8px 12px',
            backgroundColor: 'var(--panel)',
            border: '1px solid var(--ink)',
            fontSize: '12px',
            color: 'var(--ink)',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '8px',
          }}
        >
          <PixelIcon name="info" size={14} color="var(--ink)" />
          <span>
            <strong>Bảo mật & Cục bộ:</strong> Toàn bộ dữ liệu được kiểm tra ngay trong trình duyệt của bạn (Web Worker). Không gửi tệp lên máy chủ nào.
          </span>
        </div>
      </div>

      {/* FRAME 1: BỐI CẢNH VÀ YÊU CẦU PHÂN TÍCH (Prompt D3 & 2A-2: Bỏ yêu cầu phân tích ở chế độ kinh doanh) */}
      <PixelPanel
        title={isBusinessMode ? "1. BỐI CẢNH DOANH NGHIỆP (TÙY CHỌN)" : "1. BỐI CẢNH VÀ YÊU CẦU PHÂN TÍCH"}
        headerAction={
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {contextSaved && (
              <span
                aria-live="polite"
                style={{
                  fontSize: '12px',
                  fontWeight: 'bold',
                  color: 'var(--good-d)',
                  backgroundColor: 'var(--good-bg)',
                  padding: '2px 8px',
                  border: '1px solid var(--good-d)',
                }}
              >
                Đã lưu
              </span>
            )}
            <PixelButton
              variant="ghost"
              size="sm"
              icon="cross"
              onClick={() => setShowClearContextConfirm(true)}
            >
              Xóa nội dung form
            </PixelButton>
          </div>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
          {/* Top row: Company name & Role */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 'var(--space-4)' }}>
            <div>
              <label style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', fontWeight: 600, marginBottom: '4px' }}>
                <span>Tên doanh nghiệp:</span>
                <span style={{ fontSize: '11px', color: 'var(--ink-soft)' }}>{companyName.length}/80</span>
              </label>
              <input
                type="text"
                value={companyName}
                maxLength={80}
                placeholder="Ví dụ: Công ty Cổ phần Bán lẻ Thời trang An Phát"
                onChange={(e) => setCompanyName(e.target.value)}
                onBlur={() => handleSaveContext()}
                style={{
                  width: '100%',
                  padding: '8px 10px',
                  border: `2px solid ${fieldErrors.company_name ? 'var(--bad)' : 'var(--ink)'}`,
                  backgroundColor: 'var(--white)',
                  fontFamily: 'var(--font-content)',
                  fontSize: '13px',
                }}
              />
              {fieldErrors.company_name && (
                <div style={{ fontSize: '11px', color: 'var(--bad)', marginTop: '2px' }}>{fieldErrors.company_name}</div>
              )}
            </div>

            <div>
              <label style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', fontWeight: 600, marginBottom: '4px' }}>
                <span>Chức vụ người dùng:</span>
                <span style={{ fontSize: '11px', color: 'var(--ink-soft)' }}>{userRole.length}/60</span>
              </label>
              <input
                type="text"
                value={userRole}
                maxLength={60}
                placeholder="Ví dụ: Giám đốc Kinh doanh / Trưởng phòng Phân tích"
                onChange={(e) => setUserRole(e.target.value)}
                onBlur={() => handleSaveContext()}
                style={{
                  width: '100%',
                  padding: '8px 10px',
                  border: `2px solid ${fieldErrors.role ? 'var(--bad)' : 'var(--ink)'}`,
                  backgroundColor: 'var(--white)',
                  fontFamily: 'var(--font-content)',
                  fontSize: '13px',
                }}
              />
              {fieldErrors.role && (
                <div style={{ fontSize: '11px', color: 'var(--bad)', marginTop: '2px' }}>{fieldErrors.role}</div>
              )}
            </div>
          </div>

          {/* Extra Info (Prompt U2) */}
          <div>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'baseline',
                flexWrap: 'wrap',
                gap: '6px',
                marginBottom: '4px',
              }}
            >
              <label htmlFor={extraInfoId} style={{ fontSize: '13px', fontWeight: 600 }}>
                <span>{vi.contextForm.extraInfoLabel}</span>
                <span style={{ fontSize: '11px', color: 'var(--ink-soft)', fontWeight: 400, marginLeft: '6px' }}>
                  {vi.contextForm.optionalTag}
                </span>
              </label>
              <span
                data-testid="extra-info-counter"
                style={{
                  fontSize: '11px',
                  fontWeight: 600,
                  color: extraInfo.length > EXTRA_INFO_MAX_CHARS ? 'var(--bad)' : 'var(--ink-soft)',
                }}
              >
                {extraInfo.length.toLocaleString('vi-VN')}/{EXTRA_INFO_MAX_CHARS.toLocaleString('vi-VN')} ký tự (khoảng{' '}
                {extraInfoWordCount.toLocaleString('vi-VN')} từ)
              </span>
            </div>

            <textarea
              id={extraInfoId}
              rows={4}
              value={extraInfo}
              maxLength={EXTRA_INFO_MAX_CHARS}
              placeholder={vi.contextForm.extraInfoPlaceholder}
              onChange={(e) => {
                setExtraInfo(e.target.value);
                if (fieldErrors.extra_info && e.target.value.length <= EXTRA_INFO_MAX_CHARS) {
                  setFieldErrors((prev) => {
                    const next = { ...prev };
                    delete next.extra_info;
                    return next;
                  });
                }
              }}
              onBlur={() => handleSaveContext()}
              style={{
                width: '100%',
                padding: '8px 10px',
                border: `2px solid ${fieldErrors.extra_info ? 'var(--bad)' : 'var(--ink)'}`,
                backgroundColor: 'var(--white)',
                fontFamily: 'var(--font-content)',
                fontSize: '13px',
                lineHeight: 1.5,
                resize: 'vertical',
              }}
            />

            {fieldErrors.extra_info && (
              <div role="alert" style={{ fontSize: '11px', color: 'var(--bad)', marginTop: '4px', fontWeight: 600 }}>
                {fieldErrors.extra_info}
              </div>
            )}

            {/* Non-mandatory writing checklist hints */}
            <div style={{ marginTop: '6px', fontSize: '11px', color: 'var(--ink-soft)' }}>
              <div style={{ fontWeight: 600, marginBottom: '3px' }}>{vi.contextForm.extraInfoChecklistTitle}</div>
              <ul
                style={{
                  margin: 0,
                  paddingLeft: '16px',
                  display: 'flex',
                  flexWrap: 'wrap',
                  columnGap: '18px',
                  rowGap: '2px',
                }}
              >
                {vi.contextForm.extraInfoChecklist.map((hint, idx) => (
                  <li key={idx}>{hint}</li>
                ))}
              </ul>
            </div>

            {/* Soft warning (< 40 chars) or confirmation (>= 40 chars) via aria-live */}
            <div aria-live="polite" style={{ marginTop: '8px' }}>
              {!extraInfoHasEnoughContext ? (
                <div
                  role="status"
                  data-testid="extra-info-warning"
                  style={{
                    padding: '8px 12px',
                    backgroundColor: 'var(--warn-bg)',
                    border: '2px solid var(--warn-text)',
                    color: 'var(--ink)',
                    fontSize: '12px',
                    lineHeight: 1.5,
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: '8px',
                  }}
                >
                  <span style={{ flexShrink: 0, marginTop: '2px' }}>
                    <PixelIcon name="warning" size={16} color="var(--warn-text)" />
                  </span>
                  <span>{vi.contextForm.extraInfoEmptyWarning}</span>
                </div>
              ) : (
                <div
                  role="status"
                  data-testid="extra-info-confirm"
                  style={{
                    padding: '6px 10px',
                    backgroundColor: 'var(--good-bg)',
                    border: '1px solid var(--good-d)',
                    color: 'var(--good-d)',
                    fontSize: '12px',
                    fontWeight: 600,
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                  }}
                >
                  <PixelIcon name="check" size={14} color="var(--good-d)" />
                  <span>{vi.contextForm.extraInfoSavedConfirm}</span>
                </div>
              )}
            </div>
          </div>

          {/* Analysis Questions (Prompt U2 & 2A-2: Chỉ hiển thị ở chế độ giao dịch) */}
          {!isBusinessMode && (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                <label htmlFor={questionsId} style={{ fontSize: '13px', fontWeight: 600 }}>
                  <span style={{ color: 'var(--bad)', marginRight: '4px' }}>*</span>
                  {vi.contextForm.questionsLabel}
                  <span style={{ fontSize: '11px', color: 'var(--bad)', marginLeft: '6px' }}>
                    {vi.contextForm.requiredTag}
                  </span>
                </label>
                <span
                  data-testid="questions-counter"
                  style={{
                    fontSize: '11px',
                    fontWeight: 'bold',
                    color:
                      parsedQuestions.length > MAX_ANALYSIS_QUESTIONS
                        ? 'var(--bad)'
                        : parsedQuestions.length === 0
                        ? 'var(--ink-soft)'
                        : 'var(--good-d)',
                  }}
                >
                  {parsedQuestions.length}/{MAX_ANALYSIS_QUESTIONS} câu
                </span>
              </div>

              <textarea
                id={questionsId}
                rows={4}
                value={questionsText}
                placeholder={"Mỗi dòng một câu hỏi, tối đa 8 câu.\nVí dụ:\nDoanh thu theo kênh bán nào cao nhất?\nMã nào rủi ro (biến động) cao nhất?"}
                onChange={(e) => {
                  setQuestionsText(e.target.value);
                  if (limitNotice && parseQuestionLines(e.target.value).length < MAX_ANALYSIS_QUESTIONS) {
                    setLimitNotice(null);
                  }
                }}
                onBlur={() => handleSaveContext()}
                style={{
                  width: '100%',
                  padding: '8px 10px',
                  border: `2px solid ${fieldErrors.analysis_questions ? 'var(--bad)' : isContextValid ? 'var(--ink)' : 'var(--warn-text)'}`,
                  backgroundColor: 'var(--white)',
                  fontFamily: 'var(--font-content)',
                  fontSize: '13px',
                  lineHeight: 1.5,
                }}
              />
              {fieldErrors.analysis_questions && (
                <div role="alert" style={{ fontSize: '11px', color: 'var(--bad)', marginTop: '2px', fontWeight: 600 }}>
                  {fieldErrors.analysis_questions}
                </div>
              )}

              {/* Soft warning when exactly 1 question is entered (non-blocking) */}
              <div aria-live="polite">
                {parsedQuestions.length === 1 && (
                  <div
                    role="status"
                    data-testid="single-question-warning"
                    style={{
                      marginTop: '6px',
                      padding: '6px 10px',
                      backgroundColor: 'var(--warn-bg)',
                      border: '1px solid var(--warn-text)',
                      color: 'var(--ink)',
                      fontSize: '12px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                    }}
                  >
                    <PixelIcon name="info" size={14} color="var(--warn-text)" />
                    <span>{vi.contextForm.questionsSingleWarning}</span>
                  </div>
                )}

                {limitNotice && (
                  <div
                    role="status"
                    data-testid="questions-limit-notice"
                    style={{
                      marginTop: '6px',
                      padding: '6px 10px',
                      backgroundColor: 'var(--warn-bg)',
                      border: '1px solid var(--bad)',
                      color: 'var(--bad)',
                      fontSize: '12px',
                      fontWeight: 600,
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                    }}
                  >
                    <PixelIcon name="warning" size={14} color="var(--bad)" />
                    <span>{limitNotice}</span>
                  </div>
                )}
              </div>

              {/* Clickable Suggestion Box with PixelTabs (Prompt U2) */}
              <div
                data-testid="question-suggestions-box"
                style={{
                  marginTop: '12px',
                  padding: '12px',
                  backgroundColor: 'var(--panel)',
                  border: '2px solid var(--ink)',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    flexWrap: 'wrap',
                    gap: '8px',
                    marginBottom: '8px',
                  }}
                >
                  <div>
                    <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--ink)' }}>
                      {vi.contextForm.suggestionsTitle}
                    </span>
                    <span style={{ fontSize: '11px', color: 'var(--ink-soft)', marginLeft: '8px' }}>
                      {vi.contextForm.suggestionsHint}
                    </span>
                  </div>
                  <PixelButton
                    variant="secondary"
                    font="content"
                    size="sm"
                    onClick={handleUseTop3Click}
                  >
                    {vi.contextForm.useTop3Button}
                  </PixelButton>
                </div>

                <PixelTabs
                  tabs={suggestionTabs}
                  activeTab={suggestionTab}
                  onChange={(id) => setSuggestionTab(id as SuggestionGroup)}
                  style={{ marginBottom: '10px' }}
                />

                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                  {visibleSuggestions.map((item) => {
                    const isAdded = hasQuestionInText(questionsText, item.text);
                    return (
                      <button
                        key={item.id}
                        type="button"
                        aria-pressed={isAdded}
                        data-suggestion-id={item.id}
                        onClick={() => handleToggleSuggestion(item.text)}
                        style={{
                          padding: '5px 10px',
                          backgroundColor: isAdded ? 'var(--good-bg)' : 'var(--white)',
                          border: isAdded ? '1px dashed var(--good-d)' : '1px solid var(--ink)',
                          color: isAdded ? 'var(--good-d)' : 'var(--ink)',
                          opacity: isAdded ? 0.85 : 1,
                          fontFamily: 'var(--font-content)',
                          fontSize: '12px',
                          lineHeight: 1.4,
                          cursor: 'pointer',
                          borderRadius: 0,
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '6px',
                          textAlign: 'left',
                        }}
                      >
                        {isAdded ? (
                          <PixelIcon name="check" size={12} color="var(--good-d)" />
                        ) : (
                          <span aria-hidden="true" style={{ fontWeight: 700 }}>
                            +
                          </span>
                        )}
                        <span>{item.text}</span>
                        {isAdded && (
                          <span
                            style={{
                              fontSize: '10px',
                              fontWeight: 700,
                              padding: '1px 4px',
                              border: '1px solid var(--good-d)',
                              backgroundColor: 'var(--white)',
                              color: 'var(--good-d)',
                            }}
                          >
                            {vi.contextForm.suggestionAddedTag}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </div>
      </PixelPanel>

      {/* FRAME 2: MAIN 2-COLUMN GRID (DROPZONE & FILE REQUIREMENTS) */}
      <PixelPanel title="2. NẠP DỮ LIỆU GIAO DỊCH HOẶC BẢNG KINH DOANH">
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'minmax(0, 1fr) 360px',
            gap: 'var(--space-6)',
            alignItems: 'start',
          }}
        >
          {/* LEFT COLUMN: DROPZONE & RESULTS */}
          <div>
            {/* 1. IDLE / DRAGOVER STATE */}
            {!processing && !outcome && (
              <div
                tabIndex={0}
                role="button"
                aria-disabled={!isContextValid}
                aria-label={isContextValid ? 'Khu vực kéo thả tệp giao dịch' : 'Khu vực kéo thả tệp giao dịch (đang khóa: cần nhập yêu cầu phân tích)'}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onClick={() => {
                  if (!isContextValid) {
                    showToast({
                      type: 'warn',
                      title: 'Khung nạp tệp đang bị khóa',
                      message: 'Hãy nhập ít nhất một yêu cầu phân tích để mở khóa khung nạp file.',
                    });
                    return;
                  }
                  fileInputRef.current?.click();
                }}
                onKeyDown={(e) => {
                  if (isContextValid && (e.key === 'Enter' || e.key === ' ')) {
                    e.preventDefault();
                    fileInputRef.current?.click();
                  }
                }}
                className="px-shadow"
                style={{
                  border: `3px dashed ${dragOver && isContextValid ? 'var(--accent)' : 'var(--ink)'}`,
                  backgroundColor: !isContextValid ? 'var(--panel)' : dragOver ? 'var(--warn-bg)' : 'var(--panel)',
                  backgroundImage: !isContextValid
                    ? 'repeating-linear-gradient(45deg, var(--panel), var(--panel) 10px, #E2EAF1 10px, #E2EAF1 20px)'
                    : undefined,
                  padding: 'var(--space-10) var(--space-6)',
                  textAlign: 'center',
                  cursor: isContextValid ? 'pointer' : 'not-allowed',
                  opacity: !isContextValid ? 0.85 : 1,
                  transition: 'background-color 0.15s steps(2), border-color 0.15s steps(2)',
                  outline: 'none',
                }}
              >
                <input
                  id={fileInputId}
                  ref={fileInputRef}
                  type="file"
                  accept=".xlsx,.csv"
                  disabled={!isContextValid}
                  style={{ display: 'none' }}
                  onChange={handleInputChange}
                />

                {!isContextValid ? (
                  <div
                    style={{
                      padding: '8px 14px',
                      backgroundColor: '#FFF2D6',
                      border: '2px solid var(--accent)',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '8px',
                      marginBottom: 'var(--space-4)',
                      fontSize: '13px',
                      fontWeight: 600,
                      color: 'var(--ink)',
                    }}
                  >
                    <PixelIcon name="lock" size={16} />
                    <span>Hãy nhập ít nhất một yêu cầu phân tích để Agent biết cần trả lời điều gì.</span>
                  </div>
                ) : null}

                <PixelSprite mood={!isContextValid ? 'thinking' : dragOver ? 'search' : 'idle'} size={80} />

                <h3
                  className="font-pixel"
                  style={{
                    fontSize: '22px',
                    color: 'var(--ink)',
                    marginTop: 'var(--space-4)',
                  }}
                >
                  {dragOver ? 'THẢ TỆP VÀO ĐÂY ĐỂ KIỂM TRA!' : 'KÉO THẢ TỆP EXCEL HOẶC CSV VÀO ĐÂY'}
                </h3>

                <p
                  className="font-content"
                  style={{
                    color: 'var(--ink-soft)',
                    marginTop: 'var(--space-2)',
                    fontSize: '14px',
                  }}
                >
                  Kéo thả tệp Excel hoặc CSV: dữ liệu giao dịch (giá, khối lượng) hoặc bảng kinh doanh (doanh thu, chi phí...)
                </p>

                <div style={{ marginTop: 'var(--space-5)' }}>
                  <PixelButton
                    variant="primary"
                    size="lg"
                    disabled={!isContextValid}
                    icon="upload"
                    onClick={(e) => {
                      e.stopPropagation();
                      if (!isContextValid) return;
                      fileInputRef.current?.click();
                    }}
                  >
                    Hoặc bấm để chọn tệp từ máy tính
                  </PixelButton>
                </div>

                <div
                  style={{
                    marginTop: 'var(--space-4)',
                    fontSize: '12px',
                    color: 'var(--ink-soft)',
                  }}
                >
                  Giới hạn an toàn: Dung lượng ≤ {schemaInfo.limits.max_file_mb} MB • Tối đa {schemaInfo.limits.max_rows.toLocaleString('vi-VN')} dòng
                </div>
              </div>
            )}

            {/* 2. PROCESSING / PROGRESS STATE */}
            {processing && (
              <PixelPanel variant="raised" title="ĐANG KIỂM TRA TỆP DỮ LIỆU...">
                <div style={{ textAlign: 'center', padding: 'var(--space-6) var(--space-4)' }}>
                  <PixelSprite mood="working" size={72} />

                  <div
                    className="font-pixel"
                    style={{
                      fontSize: '18px',
                      color: 'var(--ink)',
                      marginTop: 'var(--space-4)',
                      marginBottom: 'var(--space-3)',
                    }}
                  >
                    {progress?.stage ? `[${progress.stage}] ` : ''}
                    {progress?.label_vi || 'Đang phân tích cấu trúc tệp...'}
                  </div>

                  <div style={{ maxWidth: '420px', margin: '0 auto' }}>
                    <PixelProgress value={progress?.percent} totalBlocks={20} color="var(--accent)" />
                  </div>

                  <div
                    style={{
                      fontSize: '13px',
                      color: 'var(--ink-soft)',
                      marginTop: 'var(--space-2)',
                    }}
                  >
                    {progress?.percent !== undefined ? `${progress.percent}% hoàn thành` : 'Đang xử lý trong Web Worker...'}
                  </div>

                  <div style={{ marginTop: 'var(--space-6)' }}>
                    <PixelButton variant="ghost" icon="cross" onClick={handleCancelUpload}>
                      Hủy kiểm tra
                    </PixelButton>
                  </div>
                </div>
              </PixelPanel>
            )}

            {/* 3. SUCCESS STATE */}
            {!processing && outcome && outcome.ok && (
              <div>
                {/* Success Alert Banner */}
                <div
                  className="px-shadow-sm"
                  style={{
                    backgroundColor: 'var(--good-bg)',
                    border: '2px solid var(--good-d)',
                    padding: 'var(--space-4) var(--space-6)',
                    marginBottom: 'var(--space-6)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 'var(--space-4)',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
                    <PixelSprite mood="success" size={48} />
                    <div>
                      <div style={{ marginBottom: '4px' }}>
                        <PixelBadge variant={outcome.meta.kind === 'business' ? 'info' : 'success'} size="md">
                          {outcome.meta.kind === 'business' ? 'Đã nhận diện: Dữ liệu kinh doanh' : 'Đã nhận diện: Dữ liệu giao dịch'}
                        </PixelBadge>
                      </div>
                      <h3
                        className="font-pixel"
                        style={{ fontSize: '20px', color: 'var(--good-d)', margin: 0 }}
                      >
                        NẠP TỆP DỮ LIỆU THÀNH CÔNG!
                      </h3>
                      <p
                        className="font-content"
                        style={{ margin: 0, fontSize: '13px', color: 'var(--ink)' }}
                      >
                        Đã xác minh và nạp <strong>{outcome.meta.rows.toLocaleString('vi-VN')}</strong> dòng dữ liệu hợp lệ.
                      </p>
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
                    <PixelButton
                      variant="primary"
                      icon="check"
                      onClick={() => navigate('/lam-sach')}
                    >
                      Tiếp tục làm sạch
                    </PixelButton>
                    <PixelButton variant="secondary" onClick={handleReset}>
                      Nạp tệp khác
                    </PixelButton>
                  </div>
                </div>

                {/* Warning Banner (if any warnings) */}
                {outcome.warnings && outcome.warnings.length > 0 && (
                  <div
                    style={{
                      backgroundColor: 'var(--warn-bg)',
                      border: '2px solid var(--warn)',
                      padding: 'var(--space-3) var(--space-4)',
                      marginBottom: 'var(--space-6)',
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        cursor: 'pointer',
                      }}
                      onClick={() => setShowWarnings(!showWarnings)}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <PixelBadge variant="warn" size="sm">
                          {outcome.warnings.length} CẢNH BÁO
                        </PixelBadge>
                        <span className="font-content" style={{ fontSize: '13px', fontWeight: 600 }}>
                          Tệp có {outcome.warnings.length} cảnh báo chất lượng cần lưu ý (không ngăn cản tiếp tục).
                        </span>
                      </div>
                      <span style={{ fontSize: '12px', color: 'var(--accent)' }}>
                        {showWarnings ? '▲ Thu gọn' : '▼ Xem chi tiết'}
                      </span>
                    </div>

                    {showWarnings && (
                      <div style={{ marginTop: 'var(--space-3)', borderTop: '1px solid var(--warn)', paddingTop: 'var(--space-3)' }}>
                        {outcome.warnings.map((w, idx) => (
                          <div key={idx} style={{ fontSize: '12px', marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <strong>[{w.code}]</strong>: {w.message_vi} — <PixelIcon name="info" size={12} /> <em>{w.fix_vi}</em>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Column Role Changer Table (For Business Datasets - Prompt M1) */}
                {outcome.meta.kind === 'business' && businessRoles.length > 0 && (
                  <PixelPanel title="VAI TRÒ CÁC CỘT (CẤU HÌNH HỒ SƠ KINH DOANH)" style={{ marginBottom: 'var(--space-6)' }}>
                    <div style={{ marginBottom: 'var(--space-3)', fontSize: '13px', color: 'var(--ink-soft)' }}>
                      Hệ thống đã tự động suy luận vai trò từng cột. Bạn có thể thay đổi vai trò (Mã dòng, Thời gian, Phân loại, Số liệu, Bỏ qua) nếu cần trước khi tiếp tục.
                    </div>
                    <div style={{ overflowX: 'auto' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                        <thead>
                          <tr style={{ backgroundColor: 'var(--panel)', borderBottom: '2px solid var(--ink)', textAlign: 'left' }}>
                            <th style={{ padding: '8px 12px' }}>Tên cột trong file</th>
                            <th style={{ padding: '8px 12px' }}>Vai trò nhận diện</th>
                            <th style={{ padding: '8px 12px' }}>Đơn vị tính</th>
                            <th style={{ padding: '8px 12px' }}>Điều chỉnh vai trò</th>
                          </tr>
                        </thead>
                        <tbody>
                          {businessRoles.map((col, idx) => (
                            <tr key={idx} style={{ borderBottom: '1px solid var(--chart-grid)' }}>
                              <td style={{ padding: '8px 12px', fontWeight: 600 }}>{col.file_header}</td>
                              <td style={{ padding: '8px 12px' }}>
                                <PixelBadge
                                  variant={
                                    col.role === 'measure'
                                      ? 'success'
                                      : col.role === 'dimension'
                                      ? 'info'
                                      : col.role === 'time'
                                      ? 'info'
                                      : col.role === 'id'
                                      ? 'warn'
                                      : 'neutral'
                                  }
                                  size="sm"
                                >
                                  {col.role === 'measure'
                                    ? 'Số liệu (measure)'
                                    : col.role === 'dimension'
                                    ? 'Phân loại (dimension)'
                                    : col.role === 'time'
                                    ? 'Thời gian (time)'
                                    : col.role === 'id'
                                    ? 'Mã dòng (id)'
                                    : 'Bỏ qua (ignored)'}
                                </PixelBadge>
                              </td>
                              <td style={{ padding: '8px 12px', color: 'var(--ink-soft)' }}>
                                {col.unit || '-'}
                              </td>
                              <td style={{ padding: '8px 12px' }}>
                                <select
                                  value={col.role}
                                  onChange={(e) => handleRoleChange(idx, e.target.value as ColumnRole)}
                                  style={{
                                    padding: '4px 8px',
                                    border: '1px solid var(--ink)',
                                    backgroundColor: 'var(--white)',
                                    fontFamily: 'var(--font-content)',
                                    fontSize: '12px',
                                  }}
                                >
                                  <option value="dimension">Phân loại (dimension)</option>
                                  <option value="measure">Số liệu (measure)</option>
                                  <option value="time">Thời gian (time)</option>
                                  <option value="id">Mã dòng (id)</option>
                                  <option value="ignored">Bỏ qua (ignored)</option>
                                </select>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </PixelPanel>
                )}

                {/* Dataset Meta Information Card */}
                <PixelPanel title="THÔNG TIN TỆP VÀ BẢO TOÀN DỮ LIỆU" style={{ marginBottom: 'var(--space-6)' }}>
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                      gap: 'var(--space-4)',
                      fontSize: '13px',
                    }}
                  >
                    <div>
                      <span style={{ color: 'var(--ink-soft)' }}>Tên tệp:</span>
                      <div style={{ fontWeight: 600, color: 'var(--ink)' }}>{outcome.meta.filename}</div>
                    </div>
                    <div>
                      <span style={{ color: 'var(--ink-soft)' }}>Số dòng hợp lệ:</span>
                      <div style={{ fontWeight: 600, color: 'var(--ink)' }}>
                        {outcome.meta.rows.toLocaleString('vi-VN')} dòng
                      </div>
                    </div>
                    <div>
                      <span style={{ color: 'var(--ink-soft)' }}>Số cột:</span>
                      <div style={{ fontWeight: 600, color: 'var(--ink)' }}>
                        {outcome.meta.n_columns || (outcome.preview ? outcome.preview.columns.length : 0)} cột
                      </div>
                    </div>
                    {outcome.meta.kind === 'trading' && (
                      <div>
                        <span style={{ color: 'var(--ink-soft)' }}>Mã chứng khoán:</span>
                        <div style={{ fontWeight: 600, color: 'var(--ink)' }}>
                          {outcome.meta.symbols.join(', ')}
                        </div>
                      </div>
                    )}
                    <div>
                      <span style={{ color: 'var(--ink-soft)' }}>Khoảng thời gian:</span>
                      <div style={{ fontWeight: 600, color: 'var(--ink)' }}>
                        {outcome.meta.date_from} → {outcome.meta.date_to}
                      </div>
                    </div>
                    {outcome.meta.source_sheet && (
                      <div>
                        <span style={{ color: 'var(--ink-soft)' }}>Sheet nguồn:</span>
                        <div style={{ fontWeight: 600, color: 'var(--ink)' }}>{outcome.meta.source_sheet}</div>
                      </div>
                    )}
                    {outcome.meta.skipped_blank_rows !== undefined && outcome.meta.skipped_blank_rows > 0 && (
                      <div>
                        <span style={{ color: 'var(--ink-soft)' }}>Dòng trống đã bỏ qua:</span>
                        <div style={{ fontWeight: 600, color: 'var(--ink)' }}>
                          {outcome.meta.skipped_blank_rows} dòng
                        </div>
                      </div>
                    )}
                    <div>
                      <span style={{ color: 'var(--ink-soft)' }}>Mã băm SHA-256 (kiểm toán):</span>
                      <div
                        style={{
                          fontFamily: 'monospace',
                          fontSize: '11px',
                          color: 'var(--ink-soft)',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                        title={outcome.meta.sha256}
                      >
                        {outcome.meta.sha256}
                      </div>
                    </div>
                  </div>
                </PixelPanel>

                {/* Data Preview Table */}
                {outcome.meta.kind === 'trading' ? (
                  <PixelPanel title={`XEM TRƯỚC DỮ LIỆU (${previewRows.length} DÒNG ĐẦU TIÊN)`}>
                    <PixelTable
                      columns={previewColumns}
                      data={previewRows}
                      keyExtractor={(item) => item.stt}
                    />
                  </PixelPanel>
                ) : (
                  <PixelPanel title={`XEM TRƯỚC BẢNG KINH DOANH (${outcome.preview?.rows.length || 0} DÒNG ĐẦU TIÊN)`}>
                    <div style={{ overflowX: 'auto' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                        <thead>
                          <tr style={{ backgroundColor: 'var(--panel)', borderBottom: '2px solid var(--ink)', textAlign: 'left' }}>
                            <th style={{ padding: '6px 8px' }}>#</th>
                            {outcome.preview?.columns.map((col, idx) => (
                              <th key={idx} style={{ padding: '6px 8px' }}>{col}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {outcome.preview?.rows.map((rowCells, rIdx) => (
                            <tr key={rIdx} style={{ borderBottom: '1px solid var(--chart-grid)' }}>
                              <td style={{ padding: '6px 8px', color: 'var(--ink-soft)' }}>{rIdx + 1}</td>
                              {rowCells.map((val, cIdx) => {
                                const str = String(val ?? '');
                                const isPadded = str && str !== str.trim();
                                const isBlank = !str.trim();
                                return (
                                  <td
                                    key={cIdx}
                                    style={{
                                      padding: '6px 8px',
                                      backgroundColor: isPadded ? '#FFF9E6' : undefined,
                                      color: isBlank ? 'var(--ink-soft)' : 'var(--ink)',
                                    }}
                                  >
                                    {isBlank ? '-' : str}
                                  </td>
                                );
                              })}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </PixelPanel>
                )}
              </div>
            )}

            {/* 4. REJECTED STATE */}
            {!processing && outcome && !outcome.ok && (
              <div>
                {/* Rejection Alert Banner */}
                <div
                  className="px-shadow-sm"
                  style={{
                    backgroundColor: '#FDF0ED',
                    border: '2px solid var(--bad)',
                    padding: 'var(--space-4) var(--space-6)',
                    marginBottom: 'var(--space-6)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 'var(--space-4)',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
                    <PixelSprite mood="error" size={48} />
                    <div>
                      <h3
                        className="font-pixel"
                        style={{ fontSize: '20px', color: 'var(--bad)', margin: 0 }}
                      >
                        TỆP BỊ TỪ CHỐI KIỂM TRA
                      </h3>
                      <p
                        className="font-content"
                        style={{ margin: 0, fontSize: '13px', color: 'var(--ink)' }}
                      >
                        Phát hiện <strong>{totalErrors}</strong> lỗi và <strong>{totalWarnings}</strong> cảnh báo vi phạm hợp đồng dữ liệu.
                      </p>
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
                    <PixelButton
                      variant="primary"
                      icon="download"
                      onClick={handleDownloadErrorCsv}
                    >
                      Tải báo cáo lỗi (.csv)
                    </PixelButton>
                    <PixelButton variant="secondary" onClick={handleReset}>
                      Thử lại với tệp khác
                    </PixelButton>
                  </div>
                </div>

                {/* Error Summary Chips */}
                {errorGroups.length > 0 && (
                  <div style={{ marginBottom: 'var(--space-4)', display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                    {errorGroups.map((grp) => (
                      <span
                        key={grp.code}
                        style={{
                          backgroundColor: '#FBE8E5',
                          border: '1px solid var(--bad)',
                          color: 'var(--bad)',
                          padding: '4px 8px',
                          fontSize: '12px',
                          fontWeight: 'bold',
                          fontFamily: 'var(--font-pixel)',
                        }}
                      >
                        {grp.code} ({grp.count})
                      </span>
                    ))}
                  </div>
                )}

                {/* Issues Table */}
                <PixelPanel title={`DANH SÁCH CHI TIẾT LỖI (${outcome.issues.length} LỖI / CẢNH BÁO)`}>
                  <PixelTable
                    columns={issueColumns}
                    data={outcome.issues.slice(0, 50)}
                    keyExtractor={(item, idx) => `${item.code}-${idx}`}
                  />
                  {outcome.issues.length > 50 && (
                    <div
                      style={{
                        padding: 'var(--space-3)',
                        textAlign: 'center',
                        fontSize: '12px',
                        color: 'var(--ink-soft)',
                        backgroundColor: 'var(--panel)',
                        borderTop: '1px solid var(--ink)',
                      }}
                    >
                      ... và còn {outcome.issues.length - 50} lỗi khác chưa hiển thị. Vui lòng bấm{' '}
                      <strong>&quot;Tải báo cáo lỗi (.csv)&quot;</strong> để xem toàn bộ danh sách.
                    </div>
                  )}
                </PixelPanel>
              </div>
            )}
          </div>

          {/* RIGHT COLUMN: SCHEMA REQUIREMENTS & CURRENT SESSION DATA */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
            {/* Card: Current Loaded Data (if already exists) */}
            {currentDatasetMeta && (
              <PixelPanel variant="inset" title="DỮ LIỆU HIỆN CÓ CỦA PHIÊN">
                <div style={{ fontSize: '13px' }}>
                  <div style={{ marginBottom: '6px' }}>
                    <span style={{ color: 'var(--ink-soft)' }}>Tệp hiện tại:</span>
                    <div style={{ fontWeight: 600 }}>{currentDatasetMeta.filename}</div>
                  </div>
                  <div style={{ marginBottom: '6px' }}>
                    <span style={{ color: 'var(--ink-soft)' }}>Loại dữ liệu:</span>
                    <div>
                      <PixelBadge variant={currentDatasetMeta.kind === 'business' ? 'info' : 'success'} size="sm">
                        {currentDatasetMeta.kind === 'business' ? 'Dữ liệu kinh doanh' : 'Dữ liệu giao dịch'}
                      </PixelBadge>
                    </div>
                  </div>
                  <div style={{ marginBottom: '6px' }}>
                    <span style={{ color: 'var(--ink-soft)' }}>Quy mô:</span>
                    <div>
                      {currentDatasetMeta.rows.toLocaleString('vi-VN')} dòng
                      {currentDatasetMeta.kind === 'trading' && ` (${currentDatasetMeta.symbols.length} mã)`}
                    </div>
                  </div>
                  <div style={{ marginBottom: '6px' }}>
                    <span style={{ color: 'var(--ink-soft)' }}>Khoảng ngày:</span>
                    <div>
                      {currentDatasetMeta.date_from} → {currentDatasetMeta.date_to}
                    </div>
                  </div>
                  <div
                    style={{
                      marginTop: 'var(--space-3)',
                      paddingTop: 'var(--space-2)',
                      borderTop: '1px solid var(--ink-soft)',
                      fontSize: '11px',
                      color: 'var(--warn-text)',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                    }}
                  >
                    <PixelIcon name="warning" size={12} />
                    <span>Nạp tệp mới sẽ thay thế dữ liệu này và khởi động lại quy trình phân tích.</span>
                  </div>
                </div>
              </PixelPanel>
            )}

            {/* Card: Schema Requirements with 2 Tabs (Trading / Business) */}
            <PixelPanel title="YÊU CẦU FILE">
              {/* Tabs Switcher */}
              <div style={{ display: 'flex', borderBottom: '2px solid var(--ink)', marginBottom: 'var(--space-3)' }}>
                <button
                  type="button"
                  onClick={() => setFileReqTab('trading')}
                  style={{
                    flex: 1,
                    padding: '6px 8px',
                    backgroundColor: fileReqTab === 'trading' ? 'var(--accent)' : 'var(--panel)',
                    color: fileReqTab === 'trading' ? 'var(--white)' : 'var(--ink)',
                    border: 'none',
                    fontWeight: 'bold',
                    fontSize: '12px',
                    cursor: 'pointer',
                  }}
                >
                  Dữ liệu giao dịch
                </button>
                <button
                  type="button"
                  onClick={() => setFileReqTab('business')}
                  style={{
                    flex: 1,
                    padding: '6px 8px',
                    backgroundColor: fileReqTab === 'business' ? 'var(--accent)' : 'var(--panel)',
                    color: fileReqTab === 'business' ? 'var(--white)' : 'var(--ink)',
                    border: 'none',
                    fontWeight: 'bold',
                    fontSize: '12px',
                    cursor: 'pointer',
                  }}
                >
                  Dữ liệu kinh doanh
                </button>
              </div>

              {/* Tab 1: Trading requirements */}
              {fileReqTab === 'trading' && (
                <div style={{ fontSize: '13px' }}>
                  <div style={{ marginBottom: 'var(--space-3)' }}>
                    <strong style={{ color: 'var(--ink)' }}>Định dạng hỗ trợ:</strong>
                    <ul style={{ margin: '4px 0 0 16px', padding: 0, color: 'var(--ink-soft)' }}>
                      <li>Excel (.xlsx) có sheet tên <code>DuLieu</code></li>
                      <li>CSV (.csv) mã hóa UTF-8 hoặc Windows-1258</li>
                    </ul>
                  </div>

                  <div style={{ marginBottom: 'var(--space-3)' }}>
                    <strong style={{ color: 'var(--ink)' }}>7 Cột bắt buộc:</strong>
                    <div style={{ marginTop: '4px', display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                      {schemaInfo.requiredColumns.map((col) => (
                        <span
                          key={col.key}
                          style={{
                            backgroundColor: 'var(--white)',
                            border: '1px solid var(--ink)',
                            padding: '2px 6px',
                            fontSize: '11px',
                            fontFamily: 'monospace',
                          }}
                        >
                          {col.label_vi}
                        </span>
                      ))}
                    </div>
                  </div>

                  <div style={{ marginBottom: 'var(--space-4)' }}>
                    <strong style={{ color: 'var(--ink)' }}>Giới hạn an toàn:</strong>
                    <ul style={{ margin: '4px 0 0 16px', padding: 0, color: 'var(--ink-soft)' }}>
                      <li>Dung lượng ≤ {schemaInfo.limits.max_file_mb} MB</li>
                      <li>Số dòng ≤ {schemaInfo.limits.max_rows.toLocaleString('vi-VN')} dòng</li>
                      <li>Số mã ≤ {schemaInfo.limits.max_symbols} mã</li>
                      <li>Số phiên ≥ {schemaInfo.limits.min_sessions} phiên/mã</li>
                    </ul>
                  </div>

                  {/* Trading Sample Download Links */}
                  <div
                    style={{
                      borderTop: '1px solid var(--ink-soft)',
                      paddingTop: 'var(--space-3)',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '8px',
                    }}
                  >
                    <div className="font-pixel" style={{ fontSize: '12px', color: 'var(--ink)' }}>
                      TẢI FILE MẪU CHUẨN:
                    </div>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <a
                        href="/samples/file-mau-chuan.xlsx"
                        download
                        style={{ textDecoration: 'none', flex: 1 }}
                      >
                        <PixelButton variant="secondary" size="sm" icon="download" style={{ width: '100%' }}>
                          File .xlsx
                        </PixelButton>
                      </a>
                      <a
                        href="/samples/file-mau-chuan.csv"
                        download
                        style={{ textDecoration: 'none', flex: 1 }}
                      >
                        <PixelButton variant="secondary" size="sm" icon="download" style={{ width: '100%' }}>
                          File .csv
                        </PixelButton>
                      </a>
                    </div>
                    <a
                      href="/samples/file-mau-co-loi.csv"
                      download
                      style={{ textDecoration: 'none', marginTop: '4px' }}
                    >
                      <PixelButton
                        variant="secondary"
                        size="sm"
                        icon="warning"
                        font="content"
                        className="font-content"
                        style={{ width: '100%', fontSize: '13px' }}
                      >
                        File mẫu có lỗi (thử làm sạch)
                      </PixelButton>
                    </a>
                  </div>
                </div>
              )}

              {/* Tab 2: Business requirements */}
              {fileReqTab === 'business' && (
                <div style={{ fontSize: '13px' }}>
                  <div style={{ marginBottom: 'var(--space-3)' }}>
                    <strong style={{ color: 'var(--ink)' }}>Quy cách bảng kinh doanh:</strong>
                    <ul style={{ margin: '4px 0 0 16px', padding: 0, color: 'var(--ink-soft)' }}>
                      <li>Hỗ trợ tệp <strong>CSV</strong> (.csv) hoặc <strong>Excel</strong> (.xlsx)</li>
                      <li>Tối thiểu <strong>1 cột phân loại</strong> (dimension)</li>
                      <li>Tối thiểu <strong>1 cột số liệu</strong> (measure)</li>
                      <li>Từ <strong>5 dòng</strong> dữ liệu trở lên, tối đa 30 cột</li>
                    </ul>
                  </div>

                  <div style={{ marginBottom: 'var(--space-3)' }}>
                    <strong style={{ color: 'var(--ink)' }}>Ví dụ tên cột thường dùng:</strong>
                    <div style={{ marginTop: '4px', display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                      {['Mã dòng', 'Tháng', 'Kênh bán', 'Khu vực', 'Sản phẩm', 'Số đơn', 'Doanh thu (VND)', 'Giá vốn', 'Lợi nhuận'].map((c, idx) => (
                        <span
                          key={idx}
                          style={{
                            backgroundColor: 'var(--white)',
                            border: '1px solid var(--ink)',
                            padding: '2px 6px',
                            fontSize: '11px',
                          }}
                        >
                          {c}
                        </span>
                      ))}
                    </div>
                  </div>

                  {/* Business Sample Download Links */}
                  <div
                    style={{
                      borderTop: '1px solid var(--ink-soft)',
                      paddingTop: 'var(--space-3)',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '8px',
                    }}
                  >
                    <div className="font-pixel" style={{ fontSize: '12px', color: 'var(--ink)' }}>
                      TẢI FILE MẪU KINH DOANH:
                    </div>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <a
                        href="/samples/file-mau-kinh-doanh.xlsx"
                        download
                        style={{ textDecoration: 'none', flex: 1 }}
                      >
                        <PixelButton variant="secondary" size="sm" icon="download" style={{ width: '100%' }}>
                          Kinh doanh .xlsx
                        </PixelButton>
                      </a>
                      <a
                        href="/samples/file-mau-kinh-doanh.csv"
                        download
                        style={{ textDecoration: 'none', flex: 1 }}
                      >
                        <PixelButton variant="secondary" size="sm" icon="download" style={{ width: '100%' }}>
                          Kinh doanh .csv
                        </PixelButton>
                      </a>
                    </div>
                    <a
                      href="/samples/file-mau-kinh-doanh-co-loi.csv"
                      download
                      style={{ textDecoration: 'none', marginTop: '4px' }}
                    >
                      <PixelButton
                        variant="secondary"
                        size="sm"
                        icon="warning"
                        font="content"
                        className="font-content"
                        style={{ width: '100%', fontSize: '13px' }}
                      >
                        File mẫu có lỗi (thử làm sạch)
                      </PixelButton>
                    </a>
                  </div>
                </div>
              )}

              {/* 55 Test cases trigger */}
              <div style={{ marginTop: 'var(--space-4)', borderTop: '1px dashed var(--ink-soft)', paddingTop: 'var(--space-2)', textAlign: 'center' }}>
                <button
                  type="button"
                  onClick={handleOpenTestCases}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: 'var(--accent)',
                    fontSize: '12px',
                    cursor: 'pointer',
                    textDecoration: 'underline',
                  }}
                >
                  Xem danh mục 55 ca kiểm thử chuẩn (MANIFEST)
                </button>
              </div>
            </PixelPanel>
          </div>
        </div>
      </PixelPanel>

      {/* Confirm Dialog: Re-uploading on Advanced State */}
      <ConfirmDialog
        isOpen={showConfirmReupload}
        title="Xác nhận nạp lại tệp dữ liệu"
        message="Phiên làm việc hiện tại đã qua các bước làm sạch hoặc phân tích. Nạp tệp mới sẽ xóa bỏ kết quả làm sạch, tính toán chỉ số và báo cáo cũ để bắt đầu lại từ đầu. Bạn có chắc chắn muốn tiếp tục?"
        confirmLabel="Đồng ý nạp lại"
        cancelLabel="Hủy bỏ"
        onConfirm={handleConfirmReupload}
        onCancel={() => {
          setPendingFile(null);
          setShowConfirmReupload(false);
        }}
      />

      {/* Confirm Dialog: Replace Existing Questions with Top 3 Popular (Prompt U2) */}
      <ConfirmDialog
        isOpen={showUseTop3Confirm}
        title={vi.contextForm.useTop3ConfirmTitle}
        message={vi.contextForm.useTop3ConfirmMessage}
        confirmLabel={vi.contextForm.useTop3ConfirmButton}
        cancelLabel={vi.common.cancel}
        onConfirm={applyTop3ForActiveGroup}
        onCancel={() => setShowUseTop3Confirm(false)}
      />

      {/* Confirm Dialog: Clear Form Content */}
      <ConfirmDialog
        isOpen={showClearContextConfirm}
        title="Xác nhận xóa nội dung form"
        message="Toàn bộ thông tin bối cảnh doanh nghiệp và các câu hỏi phân tích đã nhập sẽ bị xóa. Bạn có chắc chắn muốn xóa không?"
        confirmLabel="Xóa nội dung"
        cancelLabel="Giữ lại"
        onConfirm={handleClearContext}
        onCancel={() => setShowClearContextConfirm(false)}
      />

      {/* Confirm Dialog: Editing Context while Report Approved */}
      <ConfirmDialog
        isOpen={showReportApprovedConfirm}
        title="Báo cáo sẽ chuyển về chờ duyệt"
        message="Sửa bối cảnh sau khi duyệt sẽ đưa báo cáo về trạng thái chờ duyệt để đảm bảo nhận định phù hợp với bối cảnh mới. Bạn có muốn tiếp tục lưu thay đổi không?"
        confirmLabel="Tiếp tục lưu"
        cancelLabel="Hủy sửa"
        onConfirm={handleConfirmReportApprovedEdit}
        onCancel={() => setShowReportApprovedConfirm(false)}
      />

      {/* 55 Test Cases Manifest Modal */}
      <PixelModal
        isOpen={showTestCasesModal}
        onClose={() => setShowTestCasesModal(false)}
        title="BỘ 55 CA KIỂM THỬ TỰ ĐỘNG (MANIFEST)"
        maxWidth="760px"
      >
        <div style={{ maxHeight: '450px', overflowY: 'auto', fontSize: '12px' }}>
          <p style={{ color: 'var(--ink-soft)', marginBottom: 'var(--space-3)' }}>
            Hệ thống tuân thủ nghiêm ngặt 55 ca kiểm thử định dạng và nội dung tệp. Toàn bộ các ca dưới đây được kiểm tra tự động trước mỗi lần phát hành.
          </p>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
            <thead>
              <tr style={{ backgroundColor: 'var(--panel)', borderBottom: '2px solid var(--ink)' }}>
                <th style={{ padding: '6px' }}>Mã</th>
                <th style={{ padding: '6px' }}>Tên tệp</th>
                <th style={{ padding: '6px' }}>Mục tiêu</th>
                <th style={{ padding: '6px' }}>Kết quả kỳ vọng</th>
              </tr>
            </thead>
            <tbody>
              {testCasesManifest.map((tc, idx) => (
                <tr key={idx} style={{ borderBottom: '1px solid var(--chart-grid)' }}>
                  <td style={{ padding: '6px', fontWeight: 'bold' }}>{tc.id}</td>
                  <td style={{ padding: '6px', fontFamily: 'monospace' }}>{tc.filename}</td>
                  <td style={{ padding: '6px' }}>{tc.description}</td>
                  <td style={{ padding: '6px' }}>
                    <PixelBadge variant={tc.expected_ok ? 'success' : 'danger'} size="sm">
                      {tc.expected_ok ? 'Chấp nhận' : tc.expected_code || 'Từ chối'}
                    </PixelBadge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </PixelModal>
    </div>
  );
};
