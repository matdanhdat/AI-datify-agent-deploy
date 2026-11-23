import React, { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSession } from '../hooks/useSession';
import { ArtifactStore } from '../core/artifacts';
import type { RawDataset } from '../core/dataset';
import type { BusinessColumn, BusinessTable } from '../core/businessTable';
import type { BusinessProfile, BusinessCleanPipelineResult } from '../core/cleaner/businessCleaner';
import {
  getProfileAndProposals,
  computeCleanDiff,
  approveCleanGate,
  getActiveCleanArtifact,
  requestReclean,
} from '../services/cleanService';
import { runUpload } from '../services/uploadService';
import { fetchCleaningExplanations, type VerifiedExplanation } from '../agent/cleaningExplainer';
import { formatAiError } from '../core/aiErrors';
import type { CleanProposal, Profile } from '../core/schemas';
import type { CleanPipelineResult } from '../core/cleaner/pipeline';
import { resolveBusinessRoles, type RoleResolutionStatus } from '../core/metrics/businessRoles';
import { validateBytes, DEFAULT_LIMITS } from '../core/validator';
import { applyManualBusinessRoles } from '../core/validator/business';
import { BusinessContextPanel } from '../components/layout/BusinessContextPanel';
import { FileReadConfirmationPanel } from '../components/clean/FileReadConfirmationPanel';
import { calculateBusinessProfile, generateBusinessProposals } from '../core/cleaner/businessCleaner';
import { PixelBadge, type BadgeVariant } from '../components/pixel/PixelBadge';
import { PixelButton } from '../components/pixel/PixelButton';
import { PixelIcon } from '../components/pixel/PixelIcon';
import { PixelModal } from '../components/pixel/PixelModal';
import { PixelPanel } from '../components/pixel/PixelPanel';
import { PixelProgress, PixelTabs } from '../components/pixel/PixelProgressAndTabs';
import { PixelSwitch } from '../components/pixel/PixelFormControls';
import { PixelTable, type Column } from '../components/pixel/PixelTable';
import { useToast } from '../components/pixel/PixelToast';

export function renderCleanMetric(
  val: number | null | undefined,
  roleStatus?: RoleResolutionStatus,
  suffix: string = ''
): string {
  if (val !== null && val !== undefined && !isNaN(val)) {
    return `${val.toLocaleString('vi-VN')}${suffix}`;
  }
  if (roleStatus === 'không đáng tin') {
    return 'Không đáng tin';
  }
  return 'Không có cột này';
}

export interface ApprovalLockParams {
  isBusiness: boolean;
  approving: boolean;
  reviewerName: string;
  diffResult: CleanPipelineResult | BusinessCleanPipelineResult | null;
  resolvedRoles: any;
  hasRevenueApproved: boolean;
  isRevenueInferred: boolean;
  inferredUnconfirmedRoles: Array<{ key: string; label: string; colName: string }>;
  isReadConfirmed: boolean;
  unconfirmedCount: number;
}

export function getApprovalLockReasons(params: ApprovalLockParams): string[] {
  if (params.approving) return ['Đang phê duyệt...'];
  const reasons: string[] = [];

  if (params.isBusiness) {
    if (params.isRevenueInferred) {
      const guessedColName = params.resolvedRoles?.revenue?.col?.label || 'Doanh thu';
      reasons.push(`Doanh thu: app mới đoán cột "${guessedColName}", bạn cần xác nhận`);
    } else if (!params.hasRevenueApproved) {
      reasons.push('Cần chỉ định cột Doanh thu trước khi duyệt');
    }

    for (const r of params.inferredUnconfirmedRoles) {
      if (r.key === 'revenue') continue;
      reasons.push(`${r.label}: app mới đoán cột "${r.colName}", bạn cần xác nhận`);
    }
  }

  if (!params.isReadConfirmed) {
    const countStr = params.unconfirmedCount > 0 ? `${params.unconfirmedCount} ` : '';
    reasons.push(`Còn ${countStr}mục chưa xác nhận`);
  }

  if (!params.reviewerName.trim()) {
    reasons.push('Chưa nhập tên người duyệt');
  }

  if (params.diffResult && !params.diffResult.valid) {
    reasons.push('Dữ liệu sau làm sạch không hợp lệ');
  }

  return reasons;
}

export const CleanPage: React.FC = () => {
  const navigate = useNavigate();
  const { session, refreshSession } = useSession();
  const { showToast } = useToast();

  const reviewerInputId = useId();

  // Core Data States
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [profile, setProfile] = useState<Profile | BusinessProfile | null>(null);
  const [proposals, setProposals] = useState<CleanProposal[]>([]);
  const [decisions, setDecisions] = useState<Record<string, boolean>>({});
  const [diffResult, setDiffResult] = useState<CleanPipelineResult | BusinessCleanPipelineResult | null>(null);
  const [rawDataset, setRawDataset] = useState<RawDataset | BusinessTable | null>(null);
  const [explanations, setExplanations] = useState<Record<string, VerifiedExplanation>>({});
  const [aiLoading, setAiLoading] = useState(false);
  const [aiExplainingError, setAiExplainingError] = useState<any>(null);

  // Reviewer & Approval States
  const [reviewerName, setReviewerName] = useState<string>('Ban Giám Khảo');
  const [approving, setApproving] = useState(false);
  const [showReopenConfirm, setShowReopenConfirm] = useState(false);

  // UI Interactive States
  const [activeTab, setActiveTab] = useState<'profile' | 'diff'>('profile');
  const [diffViewMode, setDiffViewMode] = useState<'all' | 'clean_only'>('all');
  const [diffPage, setDiffPage] = useState(1);
  const pageSize = 50;

  // Affected rows modal
  const [modalProposal, setModalProposal] = useState<CleanProposal | null>(null);
  const [modalPage, setModalPage] = useState(1);
  const modalPageSize = 25;

  // Debounce ref for switch updates
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);

  // File Read Confirmation Status (Prompt 1C-2a & 1C-2a-UI)
  const [isReadConfirmed, setIsReadConfirmed] = useState<boolean>(true);
  const [unconfirmedCount, setUnconfirmedCount] = useState<number>(0);

  // Role Confirmation Status (Prompt 1D-2 0b.1)
  const [confirmedRoles, setConfirmedRoles] = useState<Record<string, boolean>>({});
  const handleConfirmRole = useCallback((roleKey: string) => {
    setConfirmedRoles((prev) => ({ ...prev, [roleKey]: true }));
  }, []);
  const handleRevertRoleConfirm = useCallback((roleKey: string) => {
    setConfirmedRoles((prev) => ({ ...prev, [roleKey]: false }));
  }, []);

  const isApproved =
    session?.state === 'clean_approved' ||
    session?.state === 'analyzed' ||
    session?.state === 'report_approved';

  const isBusiness =
    session?.dataset?.kind === 'business' ||
    (profile as any)?.kind === 'business' ||
    (rawDataset as any)?.kind === 'business';

  const activeCleanArtifact = useMemo(() => {
    if (!session || !isApproved) return undefined;
    return getActiveCleanArtifact(session.id);
  }, [session, isApproved]);

  // Load Initial Data on Mount or Session Change
  const loadData = useCallback(async () => {
    if (!session) return;

    if (session.state === 'created') {
      navigate('/nap-du-lieu');
      return;
    }

    setLoading(true);
    setErrorMsg(null);

    try {
      let raw = ArtifactStore.get<RawDataset | BusinessTable>(session.id, 'raw');
      const params = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null;

      if (!raw && params && (params.get('sample') || params.get('loadSample') || params.get('testCase') || session.state === 'cleaning_review' || session.state === 'clean_approved')) {
        try {
          const res = await fetch('/samples/file-co-loi-lam-sach.xlsx');
          if (res.ok) {
            const buf = await res.arrayBuffer();
            const file = new File([buf], 'file-co-loi-lam-sach.xlsx', {
              type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            });
            const uploadRes = await runUpload(session.id, file);
            if (uploadRes.ok) {
              raw = (uploadRes.dataset || uploadRes.businessTable) as any;
              if (params.get('approved') === 'true' || session.state === 'clean_approved') {
                await approveCleanGate(session.id, 'Ban Giám Khảo', {
                  drop_exact_duplicates: true,
                  drop_rows_missing_ohlc: true,
                  fill_missing_volume_zero: true,
                  flag_outliers: true,
                  drop_flagged_outliers: false,
                });
              }
            }
          }
        } catch (loadErr) {
          console.warn('[CleanPage] Could not auto-load sample file:', loadErr);
        }
      }

      setRawDataset(raw || null);

      const { profile: prof, proposals: props, savedDecisions } = await getProfileAndProposals(session.id);

      setProfile(prof);
      setProposals(props);

      // Initialize decisions: saved decisions from store or default_enabled
      let currentDecisions: Record<string, boolean> = {};
      if (savedDecisions && Object.keys(savedDecisions).length > 0) {
        currentDecisions = { ...savedDecisions };
      } else {
        for (const p of props) {
          currentDecisions[p.id] = p.default_enabled;
          currentDecisions[p.op] = p.default_enabled;
        }
      }

      if (params?.get('dropOutliers') === 'true') {
        currentDecisions['drop_flagged_outliers'] = true;
      }

      setDecisions(currentDecisions);

      if (params?.get('tab') === 'diff') {
        setActiveTab('diff');
      }
      if (params?.get('showModal') === 'true' && props.length > 0) {
        setModalProposal(props[0]);
      }

      // Pre-fill reviewer name if already saved in session meta
      const savedReviewer = session.reviewer_name;
      if (savedReviewer) {
        setReviewerName(savedReviewer);
      }

      // Run initial diff pipeline
      const initialDiff = await computeCleanDiff(session.id, currentDecisions);
      setDiffResult(initialDiff);
      setLoading(false);

      // Fetch AI explanations non-blockingly if not in read-only approved mode
      if (session.state === 'cleaning_review' || session.state === 'uploaded') {
        setAiLoading(true);
        try {
          const explMap = await fetchCleaningExplanations(session.id, props, prof);
          setExplanations(explMap);
        } catch (aiErr) {
          console.warn('[CleanPage] AI explanation error:', aiErr);
          setAiExplainingError(aiErr);
        } finally {
          setAiLoading(false);
        }
      }
    } catch (err: any) {
      setErrorMsg(err.message_vi || err.message || 'Lỗi nạp dữ liệu làm sạch.');
      setLoading(false);
    }
  }, [session, navigate]);

  useEffect(() => {
    if (session) {
      loadData();
    }
    return () => {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    };
  }, [session?.id, session?.state]);

  // Handle Switch Toggle with Debounce (computeCleanDiff)
  const handleToggleDecision = useCallback(
    (proposalId: string, enabled: boolean) => {
      if (!session || isApproved) return;

      const p = proposals.find((x) => x.id === proposalId);
      const opKey = p ? p.op : proposalId;

      const updated = {
        ...decisions,
        [proposalId]: enabled,
        [opKey]: enabled,
      };
      setDecisions(updated);

      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);

      debounceTimerRef.current = setTimeout(async () => {
        try {
          const diff = await computeCleanDiff(session.id, updated);
          setDiffResult(diff);
        } catch (err: any) {
          console.error('[CleanPage] Error computing diff:', err);
        }
      }, 150);
    },
    [session, decisions, proposals, isApproved]
  );

  // Handle dynamic table update from FileReadConfirmationPanel (Prompt 1C-2a Phần F & 1C-2b Phần E)
  const handleUpdateBusinessTable = useCallback(
    async (newTable: BusinessTable) => {
      if (!session) return;
      ArtifactStore.put(session.id, 'raw', newTable);
      setRawDataset(newTable);

      let resolved = resolveBusinessRoles(newTable);
      resolved = applyManualBusinessRoles(resolved, newTable);
      const newProfile = calculateBusinessProfile(newTable);
      setProfile(newProfile);
      ArtifactStore.put(session.id, 'profile', newProfile);

      const newProps = generateBusinessProposals(newTable, newProfile);
      setProposals(newProps);
      ArtifactStore.put(session.id, 'proposals', newProps);

      try {
        const diff = await computeCleanDiff(session.id, decisions);
        setDiffResult(diff);
      } catch (err: any) {
        console.error('[CleanPage] Error recomputing diff after table update:', err);
      }
    },
    [session, decisions]
  );

  // Handle Sheet Selection from Multi-sheet XLSX (Prompt 1C-2b Phần D)
  const handleSelectSheet = useCallback(
    async (sheetName: string) => {
      if (!session || !rawDataset) return;
      const curTable = rawDataset as BusinessTable;
      const bytes = curTable.raw_bytes || ArtifactStore.get<Uint8Array>(session.id, 'raw_bytes');
      const filename =
        curTable.filename ||
        ArtifactStore.get<string>(session.id, 'raw_filename') ||
        session.dataset?.filename ||
        'file.xlsx';

      if (!bytes) {
        console.warn('[CleanPage] Cannot switch sheet: raw_bytes not found in store.');
        return;
      }

      setLoading(true);
      try {
        const outcome = await validateBytes(filename, bytes, DEFAULT_LIMITS, {}, { sheetName });
        if (!outcome.ok) {
          setErrorMsg(`Sheet "${sheetName}" không chứa bảng dữ liệu hợp lệ. Vui lòng chọn sheet khác.`);
          setLoading(false);
          return;
        }

        if (outcome.businessTable) {
          setErrorMsg(null);
          const newTable = outcome.businessTable;
          newTable.selected_sheet = sheetName;
          newTable.raw_bytes = bytes;
          newTable.filename = filename;
          if (curTable.available_sheets) {
            newTable.available_sheets = curTable.available_sheets;
          }
          ArtifactStore.put(session.id, 'raw', newTable);
          setRawDataset(newTable);

          let resolved = resolveBusinessRoles(newTable);
          resolved = applyManualBusinessRoles(resolved, newTable);
          const newProfile = calculateBusinessProfile(newTable);
          setProfile(newProfile);
          ArtifactStore.put(session.id, 'profile', newProfile);

          const newProps = generateBusinessProposals(newTable, newProfile);
          setProposals(newProps);
          ArtifactStore.put(session.id, 'proposals', newProps);

          const diff = await computeCleanDiff(session.id, decisions);
          setDiffResult(diff);
        }
      } catch (err: any) {
        setErrorMsg(`Lỗi khi chuyển sang sheet "${sheetName}": ${err.message || err}`);
      } finally {
        setLoading(false);
      }
    },
    [session, rawDataset, decisions]
  );

  // Gate 1 Approval Handler
  const handleApprove = useCallback(async () => {
    if (!session || !reviewerName.trim() || !diffResult || !diffResult.valid) return;

    setApproving(true);
    try {
      await approveCleanGate(session.id, reviewerName.trim(), decisions);
      await refreshSession();
      showToast({ message: 'Phê duyệt Cổng 1 thành công!', type: 'success' });
      navigate(isBusiness ? '/trao-doi' : '/phan-tich?autoRun=1');
    } catch (err: any) {
      showToast({ message: err.message_vi || err.message || 'Lỗi phê duyệt Cổng 1', type: 'error' });
    } finally {
      setApproving(false);
    }
  }, [session, reviewerName, diffResult, decisions, isBusiness, refreshSession, showToast, navigate]);

  // Reclean Handler
  const handleReclean = useCallback(async () => {
    if (!session) return;
    try {
      requestReclean(session.id);
      await refreshSession();
      showToast({ message: 'Đã chuyển về trạng thái Làm sạch lại.', type: 'info' });
    } catch (err: any) {
      setErrorMsg(err.message_vi || err.message || 'Lỗi yêu cầu làm sạch lại.');
    }
  }, [session, refreshSession, showToast]);

  // Retry Handler
  const handleRetry = useCallback(() => {
    setErrorMsg(null);
    setLoading(true);
    loadData();
  }, [loadData]);

  // Copy Diagnostics Handler
  const handleCopyDiagnostics = useCallback(() => {
    const diag = {
      app: 'Datify AI Agent',
      sessionId: session?.id,
      state: session?.state,
      datasetKind: session?.dataset?.kind,
      error: errorMsg,
      timestamp: new Date().toISOString(),
      userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : 'unknown',
    };
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(JSON.stringify(diag, null, 2));
      showToast({ message: 'Đã sao chép chẩn đoán vào bộ nhớ tạm', type: 'info' });
    }
  }, [session, errorMsg, showToast]);

  // Rows for Tab 1 (Profiling Table)
  const profileTableRows = useMemo(() => {
    if (!profile) return [];
    if (isBusiness) {
      const bProf = profile as BusinessProfile;
      return (bProf.columns_summary || []).map((cs) => {
        let statsStr = '';
        if (cs.role === 'measure') {
          statsStr = `Tổng: ${(cs.sum || 0).toLocaleString('vi-VN')} | Min: ${(cs.min as number || 0).toLocaleString('vi-VN')} | Max: ${(cs.max as number || 0).toLocaleString('vi-VN')}`;
        } else {
          statsStr = `Mẫu: ${cs.sample_values.slice(0, 3).join(', ')}`;
        }
        return {
          key: cs.key,
          label: cs.label,
          role: cs.role === 'id' ? 'Định danh (ID)' : cs.role === 'time' ? 'Thời gian' : cs.role === 'dimension' ? 'Phân loại (Dimension)' : 'Chỉ tiêu (Measure)',
          non_null_count: cs.non_null_count.toLocaleString('vi-VN'),
          missing_count: cs.missing_count.toLocaleString('vi-VN'),
          distinct_count: cs.distinct_count.toLocaleString('vi-VN'),
          stats: statsStr,
        };
      });
    }

    const tProf = profile as Profile;
    return Object.values(tProf.by_symbol || {}).map((sp) => {
      const missingOhlc = sp.missing.open + sp.missing.high + sp.missing.low + sp.missing.close;
      return {
        symbol: sp.symbol,
        row_count: sp.rows.toLocaleString('vi-VN'),
        unique_dates: sp.unique_dates.toLocaleString('vi-VN'),
        date_range: `${sp.date_from} → ${sp.date_to}`,
        missing_ohlc: missingOhlc.toLocaleString('vi-VN'),
        missing_vol: sp.missing.volume.toLocaleString('vi-VN'),
        zero_vol: sp.zero_volume_sessions.toLocaleString('vi-VN'),
        long_gaps: sp.long_gaps_count.toLocaleString('vi-VN'),
        outliers: sp.outliers_count.toLocaleString('vi-VN'),
        close_range: `${sp.stats.close_min.toFixed(2)} / ${sp.stats.close_median.toFixed(2)} / ${sp.stats.close_max.toFixed(2)}`,
        volume_range: `${sp.stats.vol_min.toLocaleString('vi-VN')} / ${sp.stats.vol_median.toLocaleString('vi-VN')} / ${sp.stats.vol_max.toLocaleString('vi-VN')}`,
      };
    });
  }, [profile, isBusiness]);

  const profileColumns: Column<any>[] = useMemo(() => {
    if (isBusiness) {
      return [
        { key: 'label', header: 'Tên cột', width: '160px' },
        { key: 'role', header: 'Vai trò dữ liệu', width: '180px' },
        { key: 'non_null_count', header: 'Có giá trị', width: '100px', align: 'right' },
        { key: 'missing_count', header: 'Ô khuyết', width: '90px', align: 'right' },
        { key: 'distinct_count', header: 'Giá trị khác nhau', width: '130px', align: 'right' },
        { key: 'stats', header: 'Thống kê / Mẫu giá trị', width: '320px' },
      ];
    }
    return [
      { key: 'symbol', header: 'Mã CK', width: '80px' },
      { key: 'row_count', header: 'Số dòng', width: '80px', align: 'right' },
      { key: 'unique_dates', header: 'Số ngày', width: '80px', align: 'right' },
      { key: 'date_range', header: 'Khoảng thời gian', width: '180px' },
      { key: 'missing_ohlc', header: 'Khuyết OHLC', width: '90px', align: 'right' },
      { key: 'missing_vol', header: 'Khuyết KL', width: '80px', align: 'right' },
      { key: 'zero_vol', header: 'KL = 0', width: '70px', align: 'right' },
      { key: 'outliers', header: 'Dị biệt', width: '70px', align: 'right' },
      { key: 'close_range', header: 'Đóng (Min/Med/Max)', width: '170px', align: 'right' },
      { key: 'volume_range', header: 'KL (Min/Med/Max)', width: '200px', align: 'right' },
    ];
  }, [isBusiness]);

  // Rows for Tab 2 (Diff Table)
  const diffTableRows = useMemo(() => {
    if (!diffResult || !rawDataset) return [];

    if (isBusiness) {
      const bRes = diffResult as BusinessCleanPipelineResult;
      const cleanTable = bRes.cleanTable;
      const resolved = bRes.resolvedRoles || resolveBusinessRoles(cleanTable);
      const rows: any[] = [];

      const idCol = cleanTable.columns.find((c) => c.role === 'id');
      const timeCol =
        resolved.time.status === 'tìm thấy' && resolved.time.col
          ? cleanTable.columns.find((c) => c.key === resolved.time.col?.key)
          : undefined;
      const channelCol =
        resolved.channel.status === 'tìm thấy' && resolved.channel.col
          ? cleanTable.columns.find((c) => c.key === resolved.channel.col?.key)
          : undefined;
      const regionCol =
        resolved.region.status === 'tìm thấy' && resolved.region.col
          ? cleanTable.columns.find((c) => c.key === resolved.region.col?.key)
          : undefined;
      const prodCol =
        resolved.product.status === 'tìm thấy' && resolved.product.col
          ? cleanTable.columns.find((c) => c.key === resolved.product.col?.key)
          : undefined;

      const ordersCol =
        resolved.orders.status === 'tìm thấy' && resolved.orders.col
          ? (cleanTable.columns.find(
            (c) => c.key === resolved.orders.col?.key && c.role === 'measure'
          ) as Extract<BusinessColumn, { role: 'measure' }> | undefined)
          : undefined;
      const revCol =
        (resolved.revenue.status === 'tìm thấy' || resolved.revenue.status === 'suy luận') &&
          resolved.revenue.col
          ? (cleanTable.columns.find(
            (c) => c.key === resolved.revenue.col?.key && c.role === 'measure'
          ) as Extract<BusinessColumn, { role: 'measure' }> | undefined)
          : undefined;
      const cogsCol =
        resolved.cogs.status === 'tìm thấy' && resolved.cogs.col
          ? (cleanTable.columns.find(
            (c) => c.key === resolved.cogs.col?.key && c.role === 'measure'
          ) as Extract<BusinessColumn, { role: 'measure' }> | undefined)
          : undefined;
      const profitCol =
        (resolved.profit.status === 'tìm thấy' || resolved.profit.status === 'suy luận') &&
          resolved.profit.col
          ? (cleanTable.columns.find(
            (c) => c.key === resolved.profit.col?.key && c.role === 'measure'
          ) as Extract<BusinessColumn, { role: 'measure' }> | undefined)
          : undefined;
      const isProfitComputed = resolved.profit.status === 'tính ra';

      for (let i = 0; i < cleanTable.n; i++) {
        const getColVal = (col: any): string => {
          if (!col) return '';
          if (col.role === 'id') return col.values[i] || '';
          if (col.role === 'time') return col.raw_labels ? col.raw_labels[i] : String(col.values[i]);
          if (col.role === 'dimension') {
            if (col.raw_labels) return col.raw_labels[i];
            const code = col.codes[i];
            return code === 0xffff ? 'Không xác định' : col.categories[code] || 'Không xác định';
          }
          return '';
        };

        const getMeasureCell = (
          col: Extract<BusinessColumn, { role: 'measure' }> | undefined,
          status?: RoleResolutionStatus,
          isComputedProfit?: boolean
        ): string => {
          if (status === 'không đáng tin') return 'Không đáng tin';
          if (status === 'thiếu') return 'Không có cột này';
          if (isComputedProfit && revCol && cogsCol) {
            const rVal = revCol.values[i];
            const cVal = cogsCol.values[i];
            if (!isNaN(rVal) && !isNaN(cVal)) {
              return (rVal - cVal).toLocaleString('vi-VN');
            }
          }
          if (!col) return 'Không có cột này';
          const num = col.values[i];
          return isNaN(num) ? 'Không có cột này' : num.toLocaleString('vi-VN');
        };

        const idVal = getColVal(idCol);
        const origRowNum = cleanTable.source_row ? cleanTable.source_row[i] : i + 1;
        // Prompt 1C-2b F2: Prioritize source_row matching to prevent duplicate ID status collision
        const matchingDiffs = (bRes.diffRows || []).filter((dr) =>
          dr.original_row && origRowNum
            ? dr.original_row === origRowNum
            : dr.row_id && idVal && dr.row_id === idVal
        );
        const isFilled = matchingDiffs.some((dr) => dr.status === 'blank_filled');
        const isTrimmed = matchingDiffs.some((dr) => dr.status === 'trimmed');

        let statusLabel = 'Giữ nguyên';
        let statusVariant: BadgeVariant = 'neutral';
        if (isFilled && isTrimmed) {
          statusLabel = 'Đã điền & chuẩn hóa';
          statusVariant = 'warn';
        } else if (isFilled) {
          statusLabel = 'Đã điền';
          statusVariant = 'warn';
        } else if (isTrimmed) {
          statusLabel = 'Đã chuẩn hóa';
          statusVariant = 'warn';
        }

        rows.push({
          stt: i + 1,
          sourceRow: origRowNum,
          id: idVal,
          time: getColVal(timeCol),
          channel: getColVal(channelCol),
          region: getColVal(regionCol),
          product: getColVal(prodCol),
          orders: getMeasureCell(ordersCol, resolved.orders.status),
          revenue: getMeasureCell(revCol, resolved.revenue.status),
          cogs: getMeasureCell(cogsCol, resolved.cogs.status),
          profit: getMeasureCell(profitCol, resolved.profit.status, isProfitComputed),
          status: statusLabel,
          statusVariant,
          isDropped: false,
          isFilled,
          isOutlier: false,
        });
      }

      // Add dropped duplicate rows from rawTable / diffRows (Prompt 1C-2b F2)
      const droppedDiffs = (bRes.diffRows || []).filter((dr) => dr.status === 'duplicate_dropped');
      if (bRes.rawTable && droppedDiffs.length > 0) {
        const rawTable = bRes.rawTable;
        const rawIdCol = rawTable.columns.find((c) => c.role === 'id');
        const rawTimeCol = resolved.time.col ? rawTable.columns.find((c) => c.key === resolved.time.col?.key) : undefined;
        const rawChannelCol = resolved.channel.col ? rawTable.columns.find((c) => c.key === resolved.channel.col?.key) : undefined;
        const rawRegionCol = resolved.region.col ? rawTable.columns.find((c) => c.key === resolved.region.col?.key) : undefined;
        const rawProdCol = resolved.product.col ? rawTable.columns.find((c) => c.key === resolved.product.col?.key) : undefined;
        const rawOrdersCol = resolved.orders.col ? (rawTable.columns.find((c) => c.key === resolved.orders.col?.key && c.role === 'measure') as any) : undefined;
        const rawRevCol = resolved.revenue.col ? (rawTable.columns.find((c) => c.key === resolved.revenue.col?.key && c.role === 'measure') as any) : undefined;
        const rawCogsCol = resolved.cogs.col ? (rawTable.columns.find((c) => c.key === resolved.cogs.col?.key && c.role === 'measure') as any) : undefined;
        const rawProfitCol = resolved.profit.col ? (rawTable.columns.find((c) => c.key === resolved.profit.col?.key && c.role === 'measure') as any) : undefined;

        for (const dr of droppedDiffs) {
          let rawIdx = -1;
          if (rawTable.source_row) {
            for (let r = 0; r < rawTable.n; r++) {
              if (rawTable.source_row[r] === dr.original_row) {
                rawIdx = r;
                break;
              }
            }
          }
          if (rawIdx !== -1) {
            const getRawColVal = (col: any): string => {
              if (!col) return '';
              if (col.role === 'id') return col.values[rawIdx] || '';
              if (col.role === 'time') return col.raw_labels ? col.raw_labels[rawIdx] : String(col.values[rawIdx]);
              if (col.role === 'dimension') {
                if (col.raw_labels) return col.raw_labels[rawIdx];
                const code = col.codes[rawIdx];
                return code === 0xffff ? 'Không xác định' : col.categories[code] || 'Không xác định';
              }
              return '';
            };
            const getRawMeasureCell = (col: any, status?: RoleResolutionStatus): string => {
              if (status === 'không đáng tin') return 'Không đáng tin';
              if (status === 'thiếu') return 'Không có cột này';
              if (!col) return 'Không có cột này';
              const num = col.values[rawIdx];
              return isNaN(num) ? 'Không có cột này' : num.toLocaleString('vi-VN');
            };

            rows.push({
              stt: 0,
              sourceRow: dr.original_row,
              id: getRawColVal(rawIdCol) || dr.row_id,
              time: getRawColVal(rawTimeCol),
              channel: getRawColVal(rawChannelCol),
              region: getRawColVal(rawRegionCol),
              product: getRawColVal(rawProdCol),
              orders: getRawMeasureCell(rawOrdersCol, resolved.orders.status),
              revenue: getRawMeasureCell(rawRevCol, resolved.revenue.status),
              cogs: getRawMeasureCell(rawCogsCol, resolved.cogs.status),
              profit: getRawMeasureCell(rawProfitCol, resolved.profit.status),
              status: 'Bỏ: Trùng lặp',
              statusVariant: 'danger' as BadgeVariant,
              isDropped: true,
              isFilled: false,
              isOutlier: false,
            });
          }
        }
      }

      rows.sort((a, b) => a.sourceRow - b.sourceRow);
      rows.forEach((r, idx) => {
        r.stt = idx + 1;
      });

      let filteredRows = rows;
      if (diffViewMode === 'clean_only') {
        filteredRows = filteredRows.filter((r) => !r.isDropped);
      }

      const startIdx = (diffPage - 1) * pageSize;
      return filteredRows.slice(startIdx, startIdx + pageSize);
    }

    const tRes = diffResult as CleanPipelineResult;
    const tRaw = rawDataset as RawDataset;

    let rowsToRender = tRes.diffRows;
    if (diffViewMode === 'clean_only') {
      rowsToRender = rowsToRender.filter((r) => r.status !== 'dropped');
    }

    const startIdx = (diffPage - 1) * pageSize;
    const pageSlice = rowsToRender.slice(startIdx, startIdx + pageSize);

    return pageSlice.map((r, i) => {
      const origIdx = r.original_index;
      const opVal = tRaw.open[origIdx];
      const hiVal = tRaw.high[origIdx];
      const loVal = tRaw.low[origIdx];
      const clVal = tRaw.close[origIdx];
      const voVal = tRaw.volume[origIdx];

      const dt = new Date(r.date_days * 86400000).toISOString().slice(0, 10);

      let statusLabel = 'Giữ nguyên';
      let statusVariant: BadgeVariant = 'neutral';
      if (r.status === 'dropped') {
        statusLabel = r.dropped_by === 'drop_exact_duplicates' ? 'Bỏ: Trùng lặp' : r.dropped_by === 'drop_rows_missing_ohlc' ? 'Bỏ: Thiếu giá' : 'Bỏ: Dị biệt';
        statusVariant = 'danger';
      } else if (r.status === 'filled') {
        statusLabel = 'Điền KL = 0';
        statusVariant = 'success';
      } else if (r.status === 'outlier') {
        statusLabel = 'Cảnh báo dị biệt';
        statusVariant = 'warn';
      }

      return {
        stt: startIdx + i + 1,
        sourceRow: r.source_row,
        date: dt,
        symbol: r.symbol,
        open: isNaN(opVal) ? '-' : opVal.toFixed(2),
        high: isNaN(hiVal) ? '-' : hiVal.toFixed(2),
        low: isNaN(loVal) ? '-' : loVal.toFixed(2),
        close: isNaN(clVal) ? '-' : clVal.toFixed(2),
        volume: isNaN(voVal) ? '-' : voVal.toLocaleString('vi-VN'),
        status: statusLabel,
        statusVariant,
        isDropped: r.status === 'dropped',
        isFilled: r.status === 'filled',
        isOutlier: r.status === 'outlier',
      };
    });
  }, [diffResult, rawDataset, isBusiness, diffViewMode, diffPage]);

  const totalDiffRows = useMemo(() => {
    if (!diffResult) return 0;
    if (isBusiness) {
      return (diffResult as BusinessCleanPipelineResult).cleanTable.n;
    }
    const tRes = diffResult as CleanPipelineResult;
    if (diffViewMode === 'clean_only') {
      return tRes.diffRows.filter((r) => r.status !== 'dropped').length;
    }
    return tRes.diffRows.length;
  }, [diffResult, isBusiness, diffViewMode]);

  const totalDiffPages = Math.max(1, Math.ceil(totalDiffRows / pageSize));

  const bDiff = isBusiness ? (diffResult as BusinessCleanPipelineResult) : null;
  const bProfile = isBusiness ? (profile as BusinessProfile) : null;

  const totalBeforeCount = isBusiness && bProfile ? bProfile.total_rows : (diffResult ? diffResult.totalBeforeRows : 0);
  const totalAfterCount = diffResult ? diffResult.totalAfterRows : 0;
  const totalDroppedCount = isBusiness && bProfile && diffResult ? bProfile.total_rows - diffResult.totalAfterRows : (diffResult ? diffResult.droppedCount : 0);

  const cleanTable = bDiff?.cleanTable;
  const resolvedRoles = bDiff ? (bDiff.resolvedRoles || (cleanTable ? resolveBusinessRoles(cleanTable) : null)) : null;

  const isRevenueUserChosen = Boolean(
    cleanTable?.columns.some((c) => c.userChosenRole === 'revenue') ||
    (rawDataset as BusinessTable)?.columns?.some((c) => c.userChosenRole === 'revenue') ||
    ((rawDataset as BusinessTable)?.manual_column_roles && (rawDataset as BusinessTable).manual_column_roles![resolvedRoles?.revenue?.col?.label || ''] === 'revenue')
  );

  const isRevenueInferred = Boolean(
    isBusiness &&
    resolvedRoles &&
    resolvedRoles.revenue.status === 'suy luận' &&
    !isRevenueUserChosen &&
    !confirmedRoles['revenue']
  );

  // Prompt 1D-1 & 1D-2: Only allow revenue to pass Gate 1 if found, userChosen, or confirmed
  const hasRevenueApproved = Boolean(
    resolvedRoles &&
    (resolvedRoles.revenue.status === 'tìm thấy' || isRevenueUserChosen || confirmedRoles['revenue']) &&
    !isRevenueInferred
  );

  const hasChannel = Boolean(resolvedRoles && resolvedRoles.channel.status === 'tìm thấy');
  const hasRegion = Boolean(resolvedRoles && resolvedRoles.region.status === 'tìm thấy');
  const hasProduct = Boolean(resolvedRoles && resolvedRoles.product.status === 'tìm thấy');
  const hasOrders = Boolean(resolvedRoles && resolvedRoles.orders.status === 'tìm thấy');
  const hasRevenue = hasRevenueApproved;
  const showRevenueInDiff = Boolean(
    resolvedRoles && (resolvedRoles.revenue.status === 'tìm thấy' || resolvedRoles.revenue.status === 'suy luận')
  );
  const hasCogs = Boolean(resolvedRoles && resolvedRoles.cogs.status === 'tìm thấy');
  const hasProfit = Boolean(resolvedRoles && (resolvedRoles.profit.status === 'tìm thấy' || resolvedRoles.profit.status === 'suy luận' || resolvedRoles.profit.status === 'tính ra'));

  const inferredUnconfirmedRoles: Array<{ key: string; label: string; colName: string }> = useMemo(() => {
    if (!isBusiness || !resolvedRoles) return [];
    const list: Array<{ key: string; label: string; colName: string }> = [];
    const specs = [
      { key: 'revenue', label: 'Doanh thu' },
      { key: 'cogs', label: 'Giá vốn' },
      { key: 'profit', label: 'Lợi nhuận' },
      { key: 'orders', label: 'Số đơn' },
      { key: 'channel', label: 'Kênh bán' },
      { key: 'region', label: 'Khu vực' },
      { key: 'product', label: 'Sản phẩm' },
      { key: 'time', label: 'Tháng' },
    ];
    for (const s of specs) {
      const item = (resolvedRoles as any)[s.key];
      if (item && item.status === 'suy luận' && item.col) {
        const isChosen = Boolean(
          cleanTable?.columns.some((c) => c.userChosenRole === s.key) ||
          (rawDataset as BusinessTable)?.columns?.some((c) => c.userChosenRole === s.key) ||
          ((rawDataset as BusinessTable)?.manual_column_roles && (rawDataset as BusinessTable).manual_column_roles![item.col.label] === s.key)
        );
        if (!isChosen && !confirmedRoles[s.key]) {
          list.push({ key: s.key, label: s.label, colName: item.col.label });
        }
      }
    }
    return list;
  }, [isBusiness, resolvedRoles, cleanTable, rawDataset, confirmedRoles]);

  const missingCleanCols: string[] = useMemo(() => {
    if (!isBusiness || !resolvedRoles) return [];
    const missing: string[] = [];
    if (!hasChannel) missing.push('Kênh bán');
    if (!hasRegion) missing.push('Khu vực');
    if (!hasProduct) missing.push('Sản phẩm');
    if (!hasOrders) missing.push('Số đơn');
    if (!hasRevenueApproved) missing.push('Doanh thu');
    if (!hasCogs) missing.push('Giá vốn');
    if (!hasProfit) missing.push('Lợi nhuận');
    return missing;
  }, [isBusiness, resolvedRoles, hasChannel, hasRegion, hasProduct, hasOrders, hasRevenueApproved, hasCogs, hasProfit]);

  // Reduction Chain (Prompt 1Y-2 Muc 5 & Prompt 1C-2a D3)
  const pipelineReductionChain: string = useMemo(() => {
    if (!isBusiness || !bProfile || !diffResult) return '';
    const G = bProfile.total_rows;
    const B = bProfile.skipped_blank_rows ?? 0;
    const T = bProfile.skipped_total_rows ?? 0;
    const bRes = diffResult as BusinessCleanPipelineResult;
    const D = (bRes.diffRows || []).filter((dr) => dr.status === 'duplicate_dropped').length;

    const parts: string[] = [`${G} dòng gốc`];
    let current = G;

    if (B > 0) {
      current -= B;
      parts.push(`${current} (bỏ ${B} dòng trống)`);
    }

    if (T > 0) {
      current -= T;
      parts.push(`${current} (bỏ ${T} dòng tổng cộng)`);
    }

    if (D > 0) {
      current -= D;
      parts.push(`${current} (bỏ ${D} dòng trùng)`);
    }

    if (B === 0 && T === 0 && D === 0) {
      parts.push(`${current} (bỏ 0 dòng)`);
    }

    return parts.join(' → ');
  }, [isBusiness, bProfile, diffResult]);

  const hasDownstreamResults = useMemo(() => {
    if (!session) return false;
    const meta = (session as any).meta || {};
    return Boolean(
      session.state === 'analyzed' ||
      session.state === 'report_approved' ||
      session.report_status === 'approved' ||
      session.report_status === 'draft' ||
      meta.metrics ||
      meta.charts ||
      meta.report
    );
  }, [session]);

  const lockReasons = useMemo(() => {
    return getApprovalLockReasons({
      isBusiness: Boolean(isBusiness),
      approving,
      reviewerName,
      diffResult,
      resolvedRoles,
      hasRevenueApproved,
      isRevenueInferred,
      inferredUnconfirmedRoles,
      isReadConfirmed,
      unconfirmedCount,
    });
  }, [
    isBusiness,
    approving,
    reviewerName,
    diffResult,
    resolvedRoles,
    hasRevenueApproved,
    isRevenueInferred,
    inferredUnconfirmedRoles,
    isReadConfirmed,
    unconfirmedCount,
  ]);

  // Columns for Diff Table
  const diffColumns: Column<any>[] = useMemo(() => {
    if (isBusiness) {
      const cols: Column<any>[] = [
        { key: 'stt', header: 'STT', width: '50px', align: 'center' },
        { key: 'id', header: 'Mã dòng', width: '85px', align: 'center' },
        { key: 'time', header: 'Tháng', width: '85px', align: 'center' },
      ];
      if (hasChannel) cols.push({ key: 'channel', header: 'Kênh bán', width: '130px' });
      if (hasRegion) cols.push({ key: 'region', header: 'Khu vực', width: '130px' });
      if (hasProduct) cols.push({ key: 'product', header: 'Sản phẩm', width: '120px' });
      if (hasOrders) cols.push({ key: 'orders', header: 'Số đơn', width: '70px', align: 'right' });
      if (showRevenueInDiff) cols.push({ key: 'revenue', header: 'Doanh thu (VND)', width: '130px', align: 'right' });
      if (hasCogs) cols.push({ key: 'cogs', header: 'Giá vốn (VND)', width: '120px', align: 'right' });
      if (hasProfit) {
        const profitHeader = resolvedRoles?.profit?.status === 'tính ra' ? 'Lợi nhuận (tự tính)' : 'Lợi nhuận (VND)';
        cols.push({ key: 'profit', header: profitHeader, width: '130px', align: 'right' });
      }
      cols.push({
        key: 'status',
        header: 'Trạng thái',
        width: '120px',
        render: (row) =>
          row.status ? (
            <PixelBadge variant={row.statusVariant} size="sm">
              {row.status}
            </PixelBadge>
          ) : (
            <span style={{ color: 'var(--ink-soft)' }}>-</span>
          ),
      });
      return cols;
    }
    return [
      { key: 'stt', header: 'STT', width: '50px', align: 'center' },
      { key: 'sourceRow', header: 'Dòng gốc', width: '70px', align: 'center' },
      { key: 'date', header: 'Ngày', width: '100px' },
      { key: 'symbol', header: 'Mã', width: '70px', align: 'center' },
      { key: 'open', header: 'Mở', width: '80px', align: 'right' },
      { key: 'high', header: 'Cao', width: '80px', align: 'right' },
      { key: 'low', header: 'Thấp', width: '80px', align: 'right' },
      { key: 'close', header: 'Đóng', width: '80px', align: 'right' },
      { key: 'volume', header: 'Khối lượng', width: '100px', align: 'right' },
      {
        key: 'status',
        header: 'Trạng thái xử lý',
        width: '180px',
        render: (row) => (
          <PixelBadge variant={row.statusVariant} size="sm">
            {row.status}
          </PixelBadge>
        ),
      },
    ];
  }, [isBusiness, hasChannel, hasRegion, hasProduct, hasOrders, hasRevenue, hasCogs, hasProfit]);

  // Affected Rows Modal Rows
  const modalAffectedRows = useMemo(() => {
    if (!modalProposal || !diffResult || !rawDataset) return [];

    if (isBusiness) {
      const bRes = diffResult as BusinessCleanPipelineResult;
      const op = modalProposal.op as string;
      const affectedList: any[] = [];

      let matchingStatus = '';
      if (op === 'remove_blank_rows') matchingStatus = 'blank_row_dropped';
      else if (op === 'trim_whitespace') matchingStatus = 'trimmed';
      else if (op === 'drop_exact_duplicates') matchingStatus = 'duplicate_dropped';
      else if (op === 'fill_blank_dimension_label') matchingStatus = 'blank_filled';

      const timeCol = bRes.cleanTable?.columns.find((c) => c.role === 'time');

      if (matchingStatus) {
        const matching = (bRes.diffRows || []).filter((r) => r.status === matchingStatus);
        if (matching.length > 0) {
          matching.forEach((dr, idx) => {
            let dateStr = '-';
            if (timeCol) {
              const rowInClean = bRes.cleanTable.source_row ? Array.from(bRes.cleanTable.source_row).findIndex((sr) => sr === dr.original_row) : -1;
              if (rowInClean >= 0 && timeCol.raw_labels) {
                dateStr = timeCol.raw_labels[rowInClean] || '-';
              }
            }
            affectedList.push({
              stt: idx + 1,
              sourceRow: dr.original_row || '-',
              date: dateStr,
              symbol: dr.row_id || `Dòng ${dr.original_row}`,
              action: dr.details_vi || modalProposal.title_vi,
            });
          });
        } else if (op === 'remove_blank_rows' && modalProposal.rows_affected > 0) {
          for (let i = 0; i < modalProposal.rows_affected; i++) {
            affectedList.push({
              stt: i + 1,
              sourceRow: '-',
              date: '-',
              symbol: `Dòng trống #${i + 1}`,
              action: 'Loại bỏ dòng trống hoàn toàn (dữ liệu thô không có giá trị)',
            });
          }
        }
      } else if (op === 'sort_natural') {
        const rowCount = bRes.totalAfterRows || bRes.cleanTable?.n || modalProposal.rows_affected || 0;
        affectedList.push({
          stt: 1,
          sourceRow: 1,
          date: '-',
          symbol: `Toàn bộ ${rowCount} dòng`,
          action: modalProposal.description_vi || 'Sắp xếp tự nhiên theo thứ tự thời gian và mã định danh',
        });
      }

      const startIdx = (modalPage - 1) * modalPageSize;
      return affectedList.slice(startIdx, startIdx + modalPageSize);
    }

    const tRaw = rawDataset as RawDataset;
    const tDiff = diffResult as CleanPipelineResult;
    const op = modalProposal.op;
    const affected = tDiff.diffRows.filter((r) => {
      if (op === 'drop_exact_duplicates') return r.dropped_by === 'drop_exact_duplicates';
      if (op === 'drop_rows_missing_ohlc') return r.dropped_by === 'drop_rows_missing_ohlc';
      if (op === 'fill_missing_volume_zero') return r.status === 'filled';
      if (op === 'flag_outliers' || op === 'drop_flagged_outliers') return r.status === 'outlier' || r.dropped_by === 'drop_flagged_outliers';
      return false;
    });

    const startIdx = (modalPage - 1) * modalPageSize;
    return affected.slice(startIdx, startIdx + modalPageSize).map((r, i) => {
      const origIdx = r.original_index;
      const opVal = tRaw.open[origIdx];
      const hiVal = tRaw.high[origIdx];
      const loVal = tRaw.low[origIdx];
      const clVal = tRaw.close[origIdx];
      const voVal = tRaw.volume[origIdx];

      return {
        stt: startIdx + i + 1,
        sourceRow: r.source_row,
        date: new Date(r.date_days * 86400000).toISOString().slice(0, 10),
        symbol: r.symbol,
        open: isNaN(opVal) ? '-' : opVal.toFixed(2),
        high: isNaN(hiVal) ? '-' : hiVal.toFixed(2),
        low: isNaN(loVal) ? '-' : loVal.toFixed(2),
        close: isNaN(clVal) ? '-' : clVal.toFixed(2),
        volume: isNaN(voVal) ? '-' : voVal.toLocaleString('vi-VN'),
        action: r.status === 'dropped' ? 'Loại bỏ' : r.status === 'filled' ? 'Điền 0' : 'Gắn cờ',
      };
    });
  }, [modalProposal, diffResult, rawDataset, isBusiness, modalPage]);

  const totalModalAffected = useMemo(() => {
    if (!modalProposal || !diffResult) return 0;
    if (isBusiness) {
      if (modalProposal.op === 'sort_natural') {
        return (diffResult as BusinessCleanPipelineResult).totalAfterRows || (diffResult as BusinessCleanPipelineResult).cleanTable?.n || modalProposal.rows_affected || 0;
      }
      const matchingStatus =
        modalProposal.op === 'remove_blank_rows'
          ? 'blank_row_dropped'
          : modalProposal.op === 'trim_whitespace'
            ? 'trimmed'
            : modalProposal.op === 'drop_exact_duplicates'
              ? 'duplicate_dropped'
              : modalProposal.op === 'fill_blank_dimension_label'
                ? 'blank_filled'
                : '';
      if (matchingStatus) {
        const matched = ((diffResult as BusinessCleanPipelineResult).diffRows || []).filter(
          (r) => r.status === matchingStatus
        );
        if (matched.length > 0) return matched.length;
      }
      return modalProposal.rows_affected;
    }
    const tDiff = diffResult as CleanPipelineResult;
    const op = modalProposal.op;
    return tDiff.diffRows.filter((r) => {
      if (op === 'drop_exact_duplicates') return r.dropped_by === 'drop_exact_duplicates';
      if (op === 'drop_rows_missing_ohlc') return r.dropped_by === 'drop_rows_missing_ohlc';
      if (op === 'fill_missing_volume_zero') return r.status === 'filled';
      if (op === 'flag_outliers' || op === 'drop_flagged_outliers') return r.status === 'outlier' || r.dropped_by === 'drop_flagged_outliers';
      return false;
    }).length;
  }, [modalProposal, diffResult, isBusiness]);

  const totalModalPages = Math.max(1, Math.ceil(totalModalAffected / modalPageSize));

  if (loading) {
    return (
      <div style={{ padding: 'var(--space-6)', textAlign: 'center' }}>
        <PixelPanel title="ĐANG PHÂN TÍCH DỮ LIỆU..." variant="default">
          <div style={{ padding: 'var(--space-6)' }}>
            <p className="font-pixel" style={{ fontSize: '14px', marginBottom: 'var(--space-4)' }}>
              ĐANG ĐỌC HỒ SƠ DỮ LIỆU VÀ TÍNH TOÁN ĐỀ XUẤT LÀM SẠCH...
            </p>
            <PixelProgress value={65} />
          </div>
        </PixelPanel>
      </div>
    );
  }

  if (errorMsg || !profile || !diffResult) {
    return (
      <div style={{ padding: 'var(--space-6)' }}>
        <PixelPanel title="LỖI LÀM SẠCH DỮ LIỆU" variant="danger">
          <div style={{ padding: 'var(--space-4)' }}>
            <p style={{ color: 'var(--bad)', fontWeight: 600, fontSize: '15px' }}>
              {errorMsg || 'Không thể tải hồ sơ dữ liệu.'}
            </p>
            <div style={{ display: 'flex', gap: '8px', marginTop: 'var(--space-4)', flexWrap: 'wrap' }}>
              <PixelButton variant="primary" onClick={handleRetry}>
                Thử lại
              </PixelButton>
              <PixelButton variant="secondary" onClick={handleCopyDiagnostics}>
                Sao chép chẩn đoán
              </PixelButton>
              <PixelButton variant="ghost" onClick={() => navigate('/nap-du-lieu')}>
                Quay lại nạp file
              </PixelButton>
            </div>
          </div>
        </PixelPanel>
      </div>
    );
  }

  const tProfile = !isBusiness ? (profile as Profile) : null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)', paddingBottom: '90px' }}>
      <BusinessContextPanel session={session} />
      {/* Header Bar */}
      <div style={{ marginBottom: 'var(--space-4)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <h2 className="font-pixel" style={{ fontSize: '26px', color: 'var(--ink)' }}>
              {isBusiness ? 'LÀM SẠCH DỮ LIỆU BẢNG KINH DOANH & CỔNG DUYỆT 1' : 'LÀM SẠCH DỮ LIỆU & CỔNG DUYỆT 1'}
            </h2>
            <p className="font-content" style={{ color: 'var(--ink-soft)', marginTop: '4px' }}>
              {isBusiness
                ? 'Xem hồ sơ dữ liệu, áp dụng 5 thao tác chuẩn hóa kinh doanh, đối chiếu số liệu và phê duyệt Cổng 1.'
                : 'Xem hồ sơ chất lượng, bật/tắt các đề xuất làm sạch, xem trước bảng đối chiếu và phê duyệt dữ liệu.'}
            </p>
          </div>
          {isApproved && (
            <PixelBadge variant="success" size="md">
              ĐÃ PHÊ DUYỆT CỔNG 1
            </PixelBadge>
          )}
        </div>

        {/* Total rows banner if skipped_total_rows > 0 (Prompt 1C-2a D3) */}
        {isBusiness && bProfile && (bProfile.skipped_total_rows ?? 0) > 0 && (
          <div
            style={{
              padding: '10px 14px',
              backgroundColor: '#eff6ff',
              border: '1px solid var(--blue)',
              color: 'var(--blue)',
              fontFamily: 'var(--font-content)',
              fontSize: '14px',
              marginTop: 'var(--space-3)',
              marginBottom: 'var(--space-3)',
            }}
          >
            ℹ️ Đã loại {bProfile.skipped_total_rows} dòng tổng cộng (dòng gốc số{' '}
            {(bProfile.skipped_total_row_numbers ?? []).join(', ')}).
          </div>
        )}

        {/* Khung Xác nhận cách đọc file (Prompt 1C-2a & 1C-2a-UI & 1C-2b & 1D-2) */}
        {isBusiness && rawDataset && (rawDataset as any).kind === 'business' && (
          <FileReadConfirmationPanel
            table={rawDataset as BusinessTable}
            onUpdateTable={handleUpdateBusinessTable}
            onSelectSheet={handleSelectSheet}
            onConfirmStatusChange={(isConfirmed, count) => {
              setIsReadConfirmed(isConfirmed);
              if (count !== undefined) {
                setUnconfirmedCount(count);
              }
            }}
            isApproved={isApproved}
            approvalLockReasons={lockReasons}
            confirmedRoles={confirmedRoles}
            onConfirmRole={handleConfirmRole}
            onRevertRoleConfirm={handleRevertRoleConfirm}
          />
        )}

        {/* 4 KPI Summary Cards */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
            gap: 'var(--space-3)',
            marginTop: 'var(--space-4)',
          }}
        >
          {isBusiness && bProfile ? (
            <>
              <div
                className="px-shadow-sm"
                style={{
                  backgroundColor: 'var(--white)',
                  border: '2px solid var(--ink)',
                  padding: '12px 16px',
                }}
              >
                <div className="font-pixel" style={{ fontSize: '11px', color: 'var(--ink-soft)' }}>
                  TỔNG SỐ DÒNG
                </div>
                <div className="font-pixel" style={{ fontSize: '24px', color: 'var(--ink)', marginTop: '4px' }}>
                  {bProfile.total_rows.toLocaleString('vi-VN')} dòng gốc
                  {(bProfile.skipped_blank_rows ?? 0) > 0 && (
                    <span style={{ fontSize: '14px', color: 'var(--ink-soft)', marginLeft: '6px' }}>
                      ({(bProfile.total_rows - (bProfile.skipped_blank_rows ?? 0)).toLocaleString('vi-VN')} có dữ liệu)
                    </span>
                  )}
                </div>
              </div>

              <div
                className="px-shadow-sm"
                style={{
                  backgroundColor: 'var(--white)',
                  border: '2px solid var(--ink)',
                  padding: '12px 16px',
                }}
              >
                <div className="font-pixel" style={{ fontSize: '11px', color: 'var(--ink-soft)' }}>
                  CỘT & CHỈ TIÊU
                </div>
                <div className="font-pixel" style={{ fontSize: '24px', color: 'var(--blue)', marginTop: '4px' }}>
                  {bProfile.total_columns} cột ({bProfile.columns_summary.filter((c) => c.role === 'measure').length} chỉ tiêu)
                </div>
              </div>

              <div
                className="px-shadow-sm"
                style={{
                  backgroundColor: 'var(--white)',
                  border: '2px solid var(--ink)',
                  padding: '12px 16px',
                }}
              >
                <div className="font-pixel" style={{ fontSize: '11px', color: 'var(--ink-soft)' }}>
                  Ô PHÂN LOẠI KHUYẾT
                </div>
                <div
                  className="font-pixel"
                  style={{
                    fontSize: '24px',
                    color: bProfile.blank_dimension_cells_count > 0 ? 'var(--warn)' : 'var(--good)',
                    marginTop: '4px',
                  }}
                >
                  {bProfile.blank_dimension_cells_count} ô
                </div>
              </div>

              <div
                className="px-shadow-sm"
                style={{
                  backgroundColor: 'var(--white)',
                  border: '2px solid var(--ink)',
                  padding: '12px 16px',
                }}
              >
                <div className="font-pixel" style={{ fontSize: '11px', color: 'var(--ink-soft)' }}>
                  TỔNG DOANH THU
                </div>
                <div style={{ fontSize: '11px', color: 'var(--ink-soft)', fontStyle: 'italic', marginTop: '1px' }}>
                  (gốc, trước làm sạch)
                </div>
                <div className="font-pixel" style={{ fontSize: '24px', color: 'var(--good)', marginTop: '4px' }}>
                  {bProfile.aggregates.total_revenue.toLocaleString('vi-VN')} đ
                </div>
              </div>
            </>
          ) : (
            tProfile && (
              <>
                <div
                  className="px-shadow-sm"
                  style={{
                    backgroundColor: 'var(--white)',
                    border: '2px solid var(--ink)',
                    padding: '12px 16px',
                  }}
                >
                  <div className="font-pixel" style={{ fontSize: '11px', color: 'var(--ink-soft)' }}>
                    TỔNG SỐ DÒNG
                  </div>
                  <div className="font-pixel" style={{ fontSize: '24px', color: 'var(--ink)', marginTop: '4px' }}>
                    {tProfile.total_rows.toLocaleString('vi-VN')}
                  </div>
                </div>

                <div
                  className="px-shadow-sm"
                  style={{
                    backgroundColor: 'var(--white)',
                    border: '2px solid var(--ink)',
                    padding: '12px 16px',
                  }}
                >
                  <div className="font-pixel" style={{ fontSize: '11px', color: 'var(--ink-soft)' }}>
                    SỐ MÃ CỔ PHIẾU
                  </div>
                  <div className="font-pixel" style={{ fontSize: '24px', color: 'var(--blue)', marginTop: '4px' }}>
                    {tProfile.total_symbols} mã
                  </div>
                </div>

                <div
                  className="px-shadow-sm"
                  style={{
                    backgroundColor: 'var(--white)',
                    border: '2px solid var(--ink)',
                    padding: '12px 16px',
                  }}
                >
                  <div className="font-pixel" style={{ fontSize: '11px', color: 'var(--ink-soft)' }}>
                    Ô KHUYẾT THIẾU
                  </div>
                  <div
                    className="font-pixel"
                    style={{
                      fontSize: '24px',
                      color: tProfile.total_missing_cells > 0 ? 'var(--warn)' : 'var(--good)',
                      marginTop: '4px',
                    }}
                  >
                    {tProfile.total_missing_cells.toLocaleString('vi-VN')} ô
                  </div>
                </div>

                <div
                  className="px-shadow-sm"
                  style={{
                    backgroundColor: 'var(--white)',
                    border: '2px solid var(--ink)',
                    padding: '12px 16px',
                  }}
                >
                  <div className="font-pixel" style={{ fontSize: '11px', color: 'var(--ink-soft)' }}>
                    ĐIỂM DỊ BIỆT
                  </div>
                  <div
                    className="font-pixel"
                    style={{
                      fontSize: '24px',
                      color: tProfile.total_outliers > 0 ? 'var(--accent)' : 'var(--good)',
                      marginTop: '4px',
                    }}
                  >
                    {tProfile.total_outliers.toLocaleString('vi-VN')} điểm
                  </div>
                </div>
              </>
            )
          )}
        </div>
      </div>

      {/* Approved Read-only Info Banner */}
      {isApproved && activeCleanArtifact && (
        <div style={{ marginBottom: 'var(--space-4)' }}>
          <PixelPanel title="THÔNG TIN PHÊ DUYỆT CỔNG 1" variant="success">
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '16px', alignItems: 'center' }}>
              <div>
                <strong>Người duyệt:</strong> {activeCleanArtifact.reviewer_name}
              </div>
              <div>
                <strong>Thời điểm duyệt:</strong>{' '}
                {new Date(activeCleanArtifact.approved_at).toLocaleString('vi-VN')}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <strong>Mã băm SHA-256:</strong>
                <span
                  style={{
                    fontFamily: 'monospace',
                    fontSize: '12px',
                    backgroundColor: 'var(--panel)',
                    padding: '2px 6px',
                    border: '1px solid var(--ink)',
                  }}
                >
                  {activeCleanArtifact.hash.slice(0, 16)}...
                </span>
              </div>
            </div>
          </PixelPanel>
        </div>
      )}

      {/* Main Two-Column Layout */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(0, 2fr) minmax(320px, 1fr)',
          gap: 'var(--space-4)',
          alignItems: 'start',
        }}
      >
        {/* Left Column: Tabs (Profiling vs Diff) */}
        <div>
          <PixelPanel title={activeTab === 'profile' ? 'HỒ SƠ CHẤT LƯỢNG' : 'SO SÁNH THAY ĐỔI'}>
            <div style={{ marginBottom: 'var(--space-3)' }}>
              <PixelTabs
                tabs={[
                  { id: 'profile', label: isBusiness ? 'Hồ sơ các cột' : 'Hồ sơ dữ liệu' },
                  { id: 'diff', label: 'Bảng đối chiếu (Trước / Sau)' },
                ]}
                activeTab={activeTab}
                onChange={(id) => setActiveTab(id as 'profile' | 'diff')}
              />
            </div>

            {/* TAB 1: Profiling */}
            {activeTab === 'profile' && (
              <div>
                {isBusiness && bProfile && (
                  <div
                    style={{
                      fontSize: '12px',
                      color: 'var(--ink-soft)',
                      marginBottom: '8px',
                      fontStyle: 'italic',
                    }}
                  >
                    Tính trên {(bProfile.total_rows - (bProfile.skipped_blank_rows ?? 0)).toLocaleString('vi-VN')} dòng có dữ liệu, trước khi bỏ trùng
                  </div>
                )}
                <div style={{ overflowX: 'auto' }}>
                  <PixelTable
                    columns={profileColumns}
                    data={profileTableRows}
                    emptyMessage="Chưa có dữ liệu hồ sơ."
                  />
                </div>
              </div>
            )}

            {/* TAB 2: Diff View */}
            {activeTab === 'diff' && (
              <div>
                {/* Diff summary header */}
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    backgroundColor: 'var(--panel)',
                    padding: '8px 12px',
                    border: '1px solid var(--ink)',
                    marginBottom: 'var(--space-3)',
                    flexWrap: 'wrap',
                    gap: '8px',
                  }}
                >
                  <div>
                    <strong style={{ fontSize: '13px' }}>Tác động: </strong>
                    <span style={{ fontSize: '13px' }}>
                      {totalBeforeCount} → {totalAfterCount} dòng (bỏ {totalDroppedCount} dòng)
                    </span>
                  </div>

                  {isBusiness && bDiff && (
                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                      <span className="font-pixel" style={{ fontSize: '12px', color: 'var(--good)' }}>
                        Đơn: {renderCleanMetric(bDiff.statsAfter.orders, bDiff.resolvedRoles?.orders?.status)} | Doanh thu: {renderCleanMetric(bDiff.statsAfter.revenue, bDiff.resolvedRoles?.revenue?.status, ' đ')} | Lợi nhuận: {renderCleanMetric(bDiff.statsAfter.profit, bDiff.resolvedRoles?.profit?.status, ' đ')}{bDiff.statsAfter.margin_pct !== null && bDiff.statsAfter.margin_pct !== undefined ? ` (${bDiff.statsAfter.margin_pct.toFixed(2)}%)` : ''}
                      </span>
                    </div>
                  )}

                  <div style={{ display: 'flex', gap: '6px' }}>
                    <PixelButton
                      variant={diffViewMode === 'all' ? 'primary' : 'secondary'}
                      size="sm"
                      onClick={() => {
                        setDiffViewMode('all');
                        setDiffPage(1);
                      }}
                    >
                      Tất cả
                    </PixelButton>
                    <PixelButton
                      variant={diffViewMode === 'clean_only' ? 'primary' : 'secondary'}
                      size="sm"
                      onClick={() => {
                        setDiffViewMode('clean_only');
                        setDiffPage(1);
                      }}
                    >
                      Chỉ dòng giữ lại
                    </PixelButton>
                  </div>
                </div>

                {/* Pipeline Reduction Chain (Prompt 1Y-2 Muc 5) */}
                {isBusiness && pipelineReductionChain && (
                  <div
                    style={{
                      backgroundColor: 'var(--panel)',
                      border: '1px solid var(--ink)',
                      padding: '6px 12px',
                      marginBottom: '8px',
                      fontSize: '12px',
                      fontWeight: 600,
                      color: 'var(--ink)',
                    }}
                  >
                    {pipelineReductionChain}
                  </div>
                )}

                {isBusiness && missingCleanCols.length > 0 && (
                  <div
                    style={{
                      fontSize: '11px',
                      color: 'var(--ink-soft)',
                      marginBottom: '8px',
                      fontStyle: 'italic',
                    }}
                  >
                    Không có cột: {missingCleanCols.join(', ')}.
                  </div>
                )}

                {/* Diff Paginated Table */}
                <div style={{ overflowX: 'auto' }}>
                  <table
                    style={{
                      width: '100%',
                      borderCollapse: 'collapse',
                      fontSize: '12px',
                      fontFamily: 'monospace',
                    }}
                  >
                    <thead>
                      <tr style={{ backgroundColor: 'var(--panel)', borderBottom: '2px solid var(--ink)' }}>
                        {diffColumns.map((c) => (
                          <th
                            key={c.key}
                            style={{
                              padding: '6px 8px',
                              textAlign: c.align || 'left',
                              width: c.width,
                              borderRight: '1px solid var(--ink-soft)',
                            }}
                          >
                            {c.header}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {diffTableRows.map((r) => (
                        <tr
                          key={`${r.stt}-${r.sourceRow}-${r.id || r.symbol}`}
                          style={{
                            borderBottom: '1px solid var(--ink-soft)',
                            backgroundColor: r.isDropped
                              ? 'var(--bad-bg, #ffebee)'
                              : r.isFilled
                                ? 'var(--good-bg, #e8f5e9)'
                                : r.isOutlier
                                  ? 'var(--warn-bg, #fff9c4)'
                                  : 'transparent',
                            textDecoration: r.isDropped ? 'line-through' : 'none',
                            color: r.isDropped ? 'var(--ink-soft)' : 'var(--ink)',
                          }}
                        >
                          {isBusiness ? (
                            <>
                              <td style={{ padding: '4px 8px', textAlign: 'center' }}>{r.stt}</td>
                              <td style={{ padding: '4px 8px', textAlign: 'center' }}>
                                <strong>{r.id}</strong>
                              </td>
                              <td style={{ padding: '4px 8px', textAlign: 'center' }}>{r.time}</td>
                              {hasChannel && <td style={{ padding: '4px 8px' }}>{r.channel}</td>}
                              {hasRegion && (
                                <td style={{ padding: '4px 8px' }}>
                                  {r.region === 'Không xác định' ? (
                                    <PixelBadge variant="warn" size="sm">
                                      Không xác định
                                    </PixelBadge>
                                  ) : (
                                    r.region
                                  )}
                                </td>
                              )}
                              {hasProduct && (
                                <td style={{ padding: '4px 8px' }}>
                                  {r.product === 'Không xác định' ? (
                                    <PixelBadge variant="warn" size="sm">
                                      Không xác định
                                    </PixelBadge>
                                  ) : (
                                    r.product
                                  )}
                                </td>
                              )}
                              {hasOrders && <td style={{ padding: '4px 8px', textAlign: 'right' }}>{r.orders}</td>}
                              {hasRevenue && <td style={{ padding: '4px 8px', textAlign: 'right' }}>{r.revenue}</td>}
                              {hasCogs && <td style={{ padding: '4px 8px', textAlign: 'right' }}>{r.cogs}</td>}
                              {hasProfit && <td style={{ padding: '4px 8px', textAlign: 'right' }}>{r.profit}</td>}
                              <td style={{ padding: '4px 8px' }}>
                                {r.status ? (
                                  <PixelBadge variant={r.statusVariant} size="sm">
                                    {r.status}
                                  </PixelBadge>
                                ) : (
                                  <span style={{ color: 'var(--ink-soft)' }}>-</span>
                                )}
                              </td>
                            </>
                          ) : (
                            <>
                              <td style={{ padding: '4px 8px', textAlign: 'center' }}>{r.stt}</td>
                              <td style={{ padding: '4px 8px', textAlign: 'center' }}>{r.sourceRow}</td>
                              <td style={{ padding: '4px 8px' }}>{r.date}</td>
                              <td style={{ padding: '4px 8px', textAlign: 'center' }}>
                                <strong>{r.symbol}</strong>
                              </td>
                              <td style={{ padding: '4px 8px', textAlign: 'right' }}>{r.open}</td>
                              <td style={{ padding: '4px 8px', textAlign: 'right' }}>{r.high}</td>
                              <td style={{ padding: '4px 8px', textAlign: 'right' }}>{r.low}</td>
                              <td style={{ padding: '4px 8px', textAlign: 'right' }}>{r.close}</td>
                              <td style={{ padding: '4px 8px', textAlign: 'right' }}>{r.volume}</td>
                              <td style={{ padding: '4px 8px' }}>
                                <PixelBadge variant={r.statusVariant} size="sm">
                                  {r.status}
                                </PixelBadge>
                              </td>
                            </>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Pagination Controls */}
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginTop: 'var(--space-3)',
                    paddingTop: '8px',
                    borderTop: '1px solid var(--ink-soft)',
                  }}
                >
                  <div style={{ fontSize: '12px', color: 'var(--ink-soft)' }}>
                    Trang {diffPage} / {totalDiffPages} (Tổng {totalDiffRows.toLocaleString('vi-VN')} dòng)
                  </div>
                  <div style={{ display: 'flex', gap: '6px' }}>
                    <PixelButton
                      variant="secondary"
                      size="sm"
                      disabled={diffPage <= 1}
                      onClick={() => setDiffPage((p) => Math.max(1, p - 1))}
                    >
                      Trang trước
                    </PixelButton>
                    <PixelButton
                      variant="secondary"
                      size="sm"
                      disabled={diffPage >= totalDiffPages}
                      onClick={() => setDiffPage((p) => Math.min(totalDiffPages, p + 1))}
                    >
                      Trang sau
                    </PixelButton>
                  </div>
                </div>
              </div>
            )}
          </PixelPanel>
        </div>

        {/* Right Column: Proposals List */}
        <div>
          <PixelPanel title="DANH SÁCH ĐỀ XUẤT LÀM SẠCH" variant="default">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
              {!isBusiness && (
                <div
                  className="px-shadow-sm"
                  style={{
                    backgroundColor: 'var(--panel)',
                    border: '2px solid var(--ink)',
                    padding: '12px',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <strong style={{ fontSize: '13px' }}>Sắp xếp theo Mã và Ngày</strong>
                      <PixelBadge variant="info" size="sm">
                        MẶC ĐỊNH
                      </PixelBadge>
                    </div>
                    <PixelSwitch checked={true} onChange={() => { }} disabled={true} />
                  </div>
                  <p style={{ fontSize: '12px', color: 'var(--ink-soft)', marginTop: '6px', margin: 0 }}>
                    Thao tác nền tảng luôn được áp dụng để đảm bảo tính chuỗi thời gian cho các chỉ số kỹ thuật.
                  </p>
                </div>
              )}

              {/* Toggable Proposal Cards */}
              {proposals.map((p) => {
                const isChecked = !!decisions[p.id];
                const expl = explanations[p.id];
                const whyText = isBusiness ? (p.description_vi || expl?.why_vi) : (expl?.why_vi || p.description_vi);
                const defaultRiskText = p.rows_affected === 0 ? 'Không có bản ghi nào bị ảnh hưởng.' : (expl?.risk_vi || 'Cần xem xét kỹ số lượng bản ghi bị ảnh hưởng.');
                const riskText = isBusiness && p.rows_affected === 0 ? 'Không có bản ghi nào bị ảnh hưởng.' : (expl?.risk_vi || defaultRiskText);
                const isAi = expl?.is_ai;

                const badgeVariant: BadgeVariant = p.severity === 'warn' ? 'warn' : 'info';

                return (
                  <div
                    key={p.id}
                    className="px-shadow-sm"
                    style={{
                      backgroundColor: 'var(--white)',
                      border: '2px solid var(--ink)',
                      padding: '12px',
                    }}
                  >
                    {/* Header: Title, Badge, Switch */}
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'flex-start',
                        marginBottom: '8px',
                      }}
                    >
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                          <strong style={{ fontSize: '14px', color: 'var(--ink)' }}>{p.title_vi}</strong>
                          <PixelBadge variant={badgeVariant} size="sm">
                            {p.severity.toUpperCase()}
                          </PixelBadge>
                        </div>
                        <div style={{ fontSize: '11px', color: 'var(--ink-soft)', marginTop: '2px' }}>
                          Ảnh hưởng: <strong>{p.rows_affected}</strong> {isBusiness ? 'bản ghi/ô' : 'dòng'}
                          {p.affected_symbols.length > 0 && (
                            <span> ({p.affected_symbols.join(', ')})</span>
                          )}
                        </div>
                      </div>

                      <PixelSwitch
                        checked={isChecked}
                        disabled={isApproved}
                        onChange={(checked) => handleToggleDecision(p.id, checked)}
                      />
                    </div>

                    {/* Explanation Box */}
                    <div
                      style={{
                        backgroundColor: 'var(--panel)',
                        border: '1px solid var(--ink-soft)',
                        padding: '8px 10px',
                        fontSize: '12px',
                        marginBottom: '8px',
                      }}
                    >
                      <div
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          marginBottom: '4px',
                        }}
                      >
                        <span style={{ fontWeight: 600, color: 'var(--ink)' }}>Giải thích đề xuất:</span>
                        {aiLoading && !expl ? (
                          <span style={{ fontSize: '10px', color: 'var(--blue)' }}>Đang hỏi AI...</span>
                        ) : isAi ? (
                          <PixelBadge variant="info" size="sm">
                            [AI] Trợ lý phân tích
                          </PixelBadge>
                        ) : (
                          <PixelBadge
                            variant="neutral"
                            size="sm"
                            title={aiExplainingError ? formatAiError(aiExplainingError).user_display : (isBusiness ? 'Giải thích theo quy tắc chuẩn' : 'Giải thích theo mẫu dự phòng chuẩn')}
                          >
                            {isBusiness ? 'GIẢI THÍCH THEO QUY TẮC' : `[MẪU] Giải thích mẫu${aiExplainingError ? ` (mã ${formatAiError(aiExplainingError).code})` : ''}`}
                          </PixelBadge>
                        )}
                      </div>

                      <div style={{ color: 'var(--ink)', marginBottom: '4px' }}>
                        <strong>Lý do:</strong> {whyText}
                      </div>
                      <div style={{ color: 'var(--ink-soft)' }}>
                        <strong>Rủi ro:</strong> {riskText}
                      </div>
                    </div>

                    {/* Button to view affected rows */}
                    <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                      <PixelButton
                        variant="ghost"
                        size="sm"
                        font="content"
                        icon="checklist"
                        onClick={() => {
                          setModalProposal(p);
                          setModalPage(1);
                        }}
                      >
                        Xem các dòng ảnh hưởng ({p.rows_affected})
                      </PixelButton>
                    </div>
                  </div>
                );
              })}
            </div>
          </PixelPanel>
        </div>
      </div>

      {/* Fixed Action Bar at Bottom */}
      <div
        data-bottom-bar="true"
        className="px-shadow-md"
        style={{
          position: 'fixed',
          bottom: 0,
          left: 0,
          right: 0,
          backgroundColor: 'var(--white)',
          borderTop: '3px solid var(--ink)',
          padding: '12px 24px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          zIndex: 100,
          flexWrap: 'wrap',
          gap: '12px',
        }}
        aria-live="polite"
      >
        {/* Left Side: Summary text */}
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <span className="font-pixel" style={{ fontSize: '11px', color: 'var(--ink-soft)' }}>
            KẾT QUẢ ÁP DỤNG ĐỀ XUẤT:
          </span>
          <span className="font-content" style={{ fontSize: '14px', fontWeight: 600, color: 'var(--ink)' }}>
            {totalBeforeCount.toLocaleString('vi-VN')} → {totalAfterCount.toLocaleString('vi-VN')} dòng (bỏ{' '}
            {totalDroppedCount.toLocaleString('vi-VN')} dòng)
          </span>
        </div>

        {/* Center: Constraint Violation Warning */}
        {!diffResult.valid && (
          <div
            style={{
              backgroundColor: 'var(--bad-bg, #ffebee)',
              border: '2px solid var(--bad)',
              padding: '6px 12px',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              maxWidth: '500px',
            }}
          >
            <PixelIcon name="warning" size={16} color="var(--bad)" />
            <span style={{ fontSize: '12px', color: 'var(--bad)', fontWeight: 600 }}>
              {diffResult.violations[0]?.message_vi || 'Vi phạm ràng buộc dữ liệu sau làm sạch.'}
            </span>
          </div>
        )}

        {/* Right Side: Approval Form or Approved Controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          {isApproved ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '13px', color: 'var(--good)', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                <PixelIcon name="check" size={14} />
                <span>Đã được duyệt bởi {activeCleanArtifact?.reviewer_name || reviewerName}</span>
              </span>
              {!showReopenConfirm ? (
                <PixelButton
                  variant="secondary"
                  size="sm"
                  icon="refresh"
                  onClick={() => {
                    if (hasDownstreamResults) {
                      setShowReopenConfirm(true);
                    } else {
                      handleReclean();
                    }
                  }}
                >
                  MỞ LẠI CỔNG 1 ĐỂ SỬA
                </PixelButton>
              ) : (
                <div
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    backgroundColor: '#fffbeb',
                    border: '1px solid var(--warn, #f59e0b)',
                    padding: '3px 8px',
                    borderRadius: '4px',
                  }}
                >
                  <span style={{ fontSize: '12px', color: '#92400e', fontWeight: 600 }}>
                    Mở lại sẽ xóa kết quả phân tích và báo cáo hiện có.
                  </span>
                  <PixelButton
                    variant="primary"
                    size="sm"
                    onClick={async () => {
                      setShowReopenConfirm(false);
                      await handleReclean();
                    }}
                    style={{ backgroundColor: 'var(--bad, #ef4444)', color: '#fff', fontSize: '11px', padding: '2px 8px' }}
                  >
                    MỞ LẠI VÀ XÓA
                  </PixelButton>
                  <PixelButton
                    variant="secondary"
                    size="sm"
                    onClick={() => setShowReopenConfirm(false)}
                    style={{ fontSize: '11px', padding: '2px 8px' }}
                  >
                    HỦY
                  </PixelButton>
                </div>
              )}
              <PixelButton
                variant="primary"
                size="sm"
                icon="arrow-right"
                onClick={() => navigate(isBusiness ? '/trao-doi' : '/phan-tich')}
              >
                {isBusiness ? 'Đến bước Trao đổi' : 'Đến bước Phân tích'}
              </PixelButton>
            </div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <label
                htmlFor={reviewerInputId}
                className="font-pixel"
                style={{ fontSize: '11px', color: 'var(--ink)' }}
              >
                NGƯỜI DUYỆT (*):
              </label>
              <input
                id={reviewerInputId}
                type="text"
                maxLength={60}
                placeholder="Nhập tên người duyệt..."
                value={reviewerName}
                onChange={(e) => setReviewerName(e.target.value)}
                style={{
                  border: '2px solid var(--ink)',
                  padding: '6px 10px',
                  fontSize: '13px',
                  width: '180px',
                  fontFamily: 'inherit',
                  backgroundColor: 'var(--white)',
                }}
              />
              {/* Prompt F1 & 1C-2d E1: Lock reason notice next to Duyệt button */}
              {lockReasons.length > 0 && (
                <span
                  title={lockReasons.join(', ')}
                  style={{
                    fontSize: '12px',
                    color: !isReadConfirmed || (isBusiness && !hasRevenue) ? '#b45309' : 'var(--ink-soft)',
                    fontFamily: 'var(--font-content)',
                    fontWeight: 500,
                  }}
                >
                  {lockReasons.length === 1 ? lockReasons[0] : `${lockReasons[0]} (+${lockReasons.length - 1})`}
                </span>
              )}
              <PixelButton
                variant="primary"
                icon="check"
                disabled={lockReasons.length > 0 || approving}
                loading={approving}
                onClick={handleApprove}
              >
                Duyệt và tiếp tục
              </PixelButton>
            </div>
          )}
        </div>
      </div>

      {/* Modal: View Affected Rows */}
      <PixelModal
        isOpen={!!modalProposal}
        onClose={() => setModalProposal(null)}
        title={modalProposal ? `DÒNG BỊ ẢNH HƯỞNG - ${modalProposal.title_vi.toUpperCase()}` : ''}
        maxWidth="850px"
      >
        {modalProposal && (
          <div>
            <div style={{ marginBottom: 'var(--space-3)', fontSize: '13px', color: 'var(--ink-soft)' }}>
              {modalProposal.description_vi}
            </div>

            <div style={{ overflowX: 'auto' }}>
              <table
                style={{
                  width: '100%',
                  borderCollapse: 'collapse',
                  fontSize: '12px',
                  fontFamily: 'monospace',
                }}
              >
                <thead>
                  <tr style={{ backgroundColor: 'var(--panel)', borderBottom: '2px solid var(--ink)' }}>
                    <th style={{ padding: '6px 8px', textAlign: 'center' }}>STT</th>
                    <th style={{ padding: '6px 8px', textAlign: 'center' }}>Dòng gốc</th>
                    <th style={{ padding: '6px 8px' }}>Thời gian / Ngày</th>
                    <th style={{ padding: '6px 8px', textAlign: 'center' }}>Mã / Định danh</th>
                    <th style={{ padding: '6px 8px' }}>Chi tiết / Thao tác</th>
                  </tr>
                </thead>
                <tbody>
                  {modalAffectedRows.map((r) => (
                    <tr key={`${r.stt}-${r.sourceRow}-${r.symbol}`} style={{ borderBottom: '1px solid var(--ink-soft)' }}>
                      <td style={{ padding: '4px 8px', textAlign: 'center' }}>{r.stt}</td>
                      <td style={{ padding: '4px 8px', textAlign: 'center' }}>{r.sourceRow}</td>
                      <td style={{ padding: '4px 8px' }}>{r.date}</td>
                      <td style={{ padding: '4px 8px', textAlign: 'center' }}>
                        <strong>{r.symbol}</strong>
                      </td>
                      <td style={{ padding: '4px 8px' }}>
                        <PixelBadge variant="info" size="sm">
                          {r.action}
                        </PixelBadge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Modal Pagination */}
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginTop: 'var(--space-3)',
                paddingTop: '8px',
                borderTop: '1px solid var(--ink-soft)',
              }}
            >
              <div style={{ fontSize: '12px', color: 'var(--ink-soft)' }}>
                Trang {modalPage} / {totalModalPages} (Tổng {totalModalAffected} dòng)
              </div>
              <div style={{ display: 'flex', gap: '6px' }}>
                <PixelButton
                  variant="secondary"
                  size="sm"
                  disabled={modalPage <= 1}
                  onClick={() => setModalPage((p) => Math.max(1, p - 1))}
                >
                  Trang trước
                </PixelButton>
                <PixelButton
                  variant="secondary"
                  size="sm"
                  disabled={modalPage >= totalModalPages}
                  onClick={() => setModalPage((p) => Math.min(totalModalPages, p + 1))}
                >
                  Trang sau
                </PixelButton>
              </div>
            </div>
          </div>
        )}
      </PixelModal>
    </div>
  );
};
