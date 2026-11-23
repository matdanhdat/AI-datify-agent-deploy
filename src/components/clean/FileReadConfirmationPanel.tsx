import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { PixelButton } from '../pixel/PixelButton';
import type { BusinessTable, BusinessColumn } from '../../core/businessTable';
import { recalculateBusinessTable, applyManualBusinessRoles } from '../../core/validator/business';
import { resolveBusinessRoles } from '../../core/metrics/businessRoles';

export const REJECTION_TOAST_TIMEOUT_MS = 6000;
export const CONFIRM_ALL_UNDO_TIMEOUT_MS = 10000;

/**
 * Prompt 1C-2c G5: Determines if automatic table recognition is confident enough
 * to collapse the role mapping panel to a single summary line.
 */
export function isTableRecognitionConfident(
  table: BusinessTable,
  resolvedRoles: ReturnType<typeof resolveBusinessRoles>
): boolean {
  // 1. Mandatory role (Doanh thu) must be 'tìm thấy' or userChosen
  const rev = resolvedRoles.revenue;
  const isRevChosen = Boolean(
    table.columns.some((c) => c.userChosenRole === 'revenue') ||
    (table.manual_column_roles && table.manual_column_roles[rev?.col?.label || ''] === 'revenue')
  );
  if (!rev || (rev.status !== 'tìm thấy' && !isRevChosen) || !rev.col) {
    return false;
  }

  // 2. No role can be 'suy luận'
  for (const key of Object.keys(resolvedRoles)) {
    if (key === 'warnings') continue;
    const roleItem = (resolvedRoles as any)[key];
    if (roleItem && roleItem.status === 'suy luận') {
      return false;
    }
  }

  // 3. No measure column has ambiguous separator
  for (const col of table.columns) {
    if (col.role === 'measure' && col.ambiguous_separator) {
      return false;
    }
  }

  // 4. Currency unit must be 'đồng' and not suspicious
  for (const col of table.columns) {
    if (col.role === 'measure' && col.detectedUnit) {
      const u = col.userUnit || col.detectedUnit;
      if (u !== 'đồng') return false;
      if (col.unit_suspicious) return false;
    }
  }

  // 5. No COGS > Revenue warning
  if (table.cogs_exceeds_revenue_warning) {
    return false;
  }

  return true;
}

export interface FileReadConfirmationPanelProps {
  table: BusinessTable;
  onUpdateTable: (newTable: BusinessTable) => void;
  onConfirmStatusChange: (isConfirmed: boolean, unconfirmedCount?: number) => void;
  onSelectSheet?: (sheetName: string) => void;
  isApproved?: boolean;
  approvalLockReasons?: string[];
  confirmedRoles?: Record<string, boolean>;
  onConfirmRole?: (roleKey: string) => void;
  onRevertRoleConfirm?: (roleKey: string) => void;
}

const UNIT_OPTIONS = [
  { label: 'đồng', mult: 1 },
  { label: 'nghìn đồng', mult: 1e3 },
  { label: 'triệu đồng', mult: 1e6 },
  { label: 'tỷ đồng', mult: 1e9 },
  { label: 'nghìn tỷ đồng', mult: 1e12 },
] as const;

const BUSINESS_ROLES_SPEC: Array<{ key: string; label: string; numeric: boolean }> = [
  { key: 'revenue', label: 'Doanh thu', numeric: true },
  { key: 'orders', label: 'Số đơn', numeric: true },
  { key: 'cogs', label: 'Giá vốn', numeric: true },
  { key: 'profit', label: 'Lợi nhuận', numeric: true },
  { key: 'product', label: 'Sản phẩm', numeric: false },
  { key: 'channel', label: 'Kênh', numeric: false },
  { key: 'region', label: 'Khu vực', numeric: false },
  { key: 'time', label: 'Tháng', numeric: false },
];

export const FileReadConfirmationPanel: React.FC<FileReadConfirmationPanelProps> = ({
  table,
  onUpdateTable,
  onConfirmStatusChange,
  onSelectSheet,
  isApproved = false,
  approvalLockReasons,
  confirmedRoles = {},
  onConfirmRole,
  onRevertRoleConfirm,
}) => {
  const resolvedRoles = useMemo(() => {
    const raw = resolveBusinessRoles(table);
    return applyManualBusinessRoles(raw, table);
  }, [table]);

  const isConfident = useMemo(() => isTableRecognitionConfident(table, resolvedRoles), [table, resolvedRoles]);
  const [isCollapsed, setIsCollapsed] = useState<boolean>(isConfident);
  const userToggledRef = useRef<boolean>(false);

  useEffect(() => {
    if (!userToggledRef.current) {
      setIsCollapsed(isConfident);
    }
  }, [isConfident]);

  const errorTimerRef = useRef<any>(null);

  const setColumnErrorWithTimer = useCallback((msg: string | null) => {
    if (errorTimerRef.current) {
      clearTimeout(errorTimerRef.current);
      errorTimerRef.current = null;
    }
    setColumnError(msg);
    if (msg) {
      errorTimerRef.current = setTimeout(() => {
        setColumnError(null);
        errorTimerRef.current = null;
      }, REJECTION_TOAST_TIMEOUT_MS);
    }
  }, []);

  useEffect(() => {
    return () => {
      if (errorTimerRef.current) {
        clearTimeout(errorTimerRef.current);
      }
    };
  }, []);

  // Handler for Role-based column assignment (Prompt 1C-2b Phần E)
  const handleAssignRole = useCallback(
    (targetRoleKey: string, chosenColKey: string) => {
      setColumnErrorWithTimer(null);
      const roleSpec = BUSINESS_ROLES_SPEC.find((r) => r.key === targetRoleKey);
      if (!roleSpec) return;

      if (!chosenColKey) {
        // Unassign any column that had targetRoleKey
        const newCols = table.columns.map((c) => {
          if ((c as any).userChosenRole === targetRoleKey) {
            return { ...c, userChosenRole: undefined };
          }
          return c;
        });
        const updatedTable: BusinessTable = {
          ...table,
          columns: newCols,
        };
        onUpdateTable(updatedTable);
        return;
      }

      const chosenCol = table.columns.find((c) => c.key === chosenColKey);
      if (!chosenCol) return;

      // E2 rule 1: If numeric role, chosen column must be >= 80% parseable numbers
      if (roleSpec.numeric) {
        let validNumCount = 0;
        let totalCells = 0;
        if (chosenCol.role === 'measure') {
          validNumCount = chosenCol.values.filter((v) => !isNaN(v)).length;
          totalCells = chosenCol.values.length;
        } else if (chosenCol.role === 'dimension') {
          const rawStrings: string[] = (chosenCol as any).categories
            ? (chosenCol as any).codes.map((code: number) => (code === 0xffff ? '' : (chosenCol as any).categories[code] || ''))
            : (chosenCol as any).values || [];
          for (const s of rawStrings) {
            if (!s || !s.trim()) continue;
            totalCells++;
            const cleanStr = s.trim().replace(/\./g, '').replace(/,/g, '');
            if (!isNaN(Number(cleanStr))) {
              validNumCount++;
            }
          }
        } else if (chosenCol.role === 'id') {
          for (const s of chosenCol.values || []) {
            if (!s || !s.trim()) continue;
            totalCells++;
            const cleanStr = s.trim().replace(/\./g, '').replace(/,/g, '');
            if (!isNaN(Number(cleanStr))) {
              validNumCount++;
            }
          }
        }
        const ratio = totalCells > 0 ? validNumCount / totalCells : 0;
        if (ratio < 0.8) {
          setColumnErrorWithTimer(`Cột này toàn chữ, không dùng làm ${roleSpec.label} được.`);
          return;
        }
      }

      // E2 rule 2: Column cannot be assigned to two roles at the same time
      for (const otherSpec of BUSINESS_ROLES_SPEC) {
        if (otherSpec.key === targetRoleKey) continue;
        const assignedCol = (resolvedRoles as any)[otherSpec.key]?.col;
        if (assignedCol && assignedCol.key === chosenColKey) {
          setColumnErrorWithTimer(
            `Cột ${chosenCol.label} đã được gán làm ${otherSpec.label}, không thể gán thêm vai trò ${roleSpec.label}.`
          );
          return;
        }
      }

      // Passed checks: update table
      const newCols = table.columns.map((c) => {
        if (c.key === chosenColKey) {
          if (roleSpec.numeric && c.role !== 'measure') {
            const floatVals = new Float64Array(table.n);
            const rawStrings: string[] = (c as any).categories
              ? (c as any).codes.map((code: number) => (code === 0xffff ? '' : (c as any).categories[code] || ''))
              : (c as any).values || [];
            for (let i = 0; i < table.n; i++) {
              const s = String(rawStrings[i] || '').trim().replace(/\./g, '').replace(/,/g, '');
              const n = Number(s);
              floatVals[i] = isNaN(n) ? NaN : n;
            }
            return {
              role: 'measure' as const,
              key: c.key,
              label: c.label,
              values: floatVals,
              raw_values: floatVals,
              userChosenRole: targetRoleKey,
            };
          }
          return {
            ...c,
            userChosenRole: targetRoleKey,
          };
        } else if ((c as any).userChosenRole === targetRoleKey) {
          return {
            ...c,
            userChosenRole: undefined,
          };
        }
        return c;
      });

      const updatedTable: BusinessTable = {
        ...table,
        columns: newCols,
        manual_column_roles: {
          ...(table.manual_column_roles || {}),
          [chosenCol.label]: targetRoleKey,
        },
      };

      onUpdateTable(updatedTable);
    },
    [table, resolvedRoles, onUpdateTable]
  );
  // Find all measure columns that have a currency unit detected
  const moneyColumns = useMemo(
    () =>
      table.columns.filter(
        (c): c is Extract<BusinessColumn, { role: 'measure' }> =>
          c.role === 'measure' && Boolean(c.detectedUnit)
      ),
    [table.columns]
  );

  // Find columns with ambiguous separator (e.g. 1.250)
  const ambiguousColumns = useMemo(
    () =>
      table.columns.filter(
        (c): c is Extract<BusinessColumn, { role: 'measure' }> =>
          c.role === 'measure' && Boolean(c.ambiguous_separator)
      ),
    [table.columns]
  );

  // State to track user confirmations and selection status
  const [confirmedUnits, setConfirmedUnits] = useState<Record<string, boolean>>({});
  const [confirmedSeps, setConfirmedSeps] = useState<Record<string, boolean>>({});
  const [selectedNotConfirmedUnits, setSelectedNotConfirmedUnits] = useState<Record<string, boolean>>({});
  const [selectedNotConfirmedSeps, setSelectedNotConfirmedSeps] = useState<Record<string, boolean>>({});
  const [skippedWarningNotice, setSkippedWarningNotice] = useState<string | null>(null);
  const [columnError, setColumnError] = useState<string | null>(null);

  // Determine unconfirmed items
  const unconfirmedItems = useMemo(() => {
    const items: Array<{
      id: string;
      colKey: string;
      type: 'unit' | 'sep';
      label: string;
      isSuspicious: boolean;
    }> = [];

    moneyColumns.forEach((col) => {
      const currentUnit = col.userUnit || col.detectedUnit || 'đồng';
      const needsUnitConfirm = currentUnit !== 'đồng' || Boolean(col.unit_suspicious);
      if (needsUnitConfirm && !confirmedUnits[col.key]) {
        const hasAmbiguous = ambiguousColumns.some((a) => a.key === col.key);
        items.push({
          id: `unit-${col.key}`,
          colKey: col.key,
          type: 'unit',
          label: hasAmbiguous ? `${col.label} (đơn vị)` : col.label,
          isSuspicious: Boolean(col.unit_suspicious),
        });
      }
    });

    ambiguousColumns.forEach((col) => {
      if (!confirmedSeps[col.key]) {
        const hasMoney = moneyColumns.some((m) => m.key === col.key);
        items.push({
          id: `sep-${col.key}`,
          colKey: col.key,
          type: 'sep',
          label: hasMoney ? `${col.label} (dấu số)` : col.label,
          isSuspicious: false,
        });
      }
    });

    return items;
  }, [moneyColumns, ambiguousColumns, confirmedUnits, confirmedSeps]);

  const isAllConfirmed = unconfirmedItems.length === 0;

  useEffect(() => {
    onConfirmStatusChange(isAllConfirmed, unconfirmedItems.length);
  }, [isAllConfirmed, unconfirmedItems.length, onConfirmStatusChange]);

  // Handler for selecting a unit
  const handleSelectUnit = useCallback(
    (colKey: string, unitLabel: string, mult: number) => {
      setColumnErrorWithTimer(null);
      const updatedTable = recalculateBusinessTable(table, {
        units: { [colKey]: { unit: unitLabel, multiplier: mult } },
      });
      // Prompt C1 & G2: switching option resets row to unconfirmed and marks as selected-not-confirmed
      setConfirmedUnits((prev) => ({ ...prev, [colKey]: false }));
      setSelectedNotConfirmedUnits((prev) => ({ ...prev, [colKey]: true }));
      onUpdateTable(updatedTable);
    },
    [table, onUpdateTable, setColumnErrorWithTimer]
  );

  // Handler for confirming the current guessed unit
  const handleConfirmCurrentUnit = useCallback((colKey: string) => {
    setColumnErrorWithTimer(null);
    setConfirmedUnits((prev) => ({ ...prev, [colKey]: true }));
    setSelectedNotConfirmedUnits((prev) => ({ ...prev, [colKey]: false }));
  }, [setColumnErrorWithTimer]);

  // Handler for selecting decimal convention
  const handleSelectDecimalConvention = useCallback(
    (colKey: string, convention: 'dot' | 'comma') => {
      setColumnErrorWithTimer(null);
      const updatedTable = recalculateBusinessTable(table, {
        decimals: { [colKey]: convention },
      });
      // Prompt C1 & G2: switching option resets row to unconfirmed and marks as selected-not-confirmed
      setConfirmedSeps((prev) => ({ ...prev, [colKey]: false }));
      setSelectedNotConfirmedSeps((prev) => ({ ...prev, [colKey]: true }));
      onUpdateTable(updatedTable);
    },
    [table, onUpdateTable, setColumnErrorWithTimer]
  );

  // Handler for confirming the current decimal convention
  const handleConfirmCurrentSep = useCallback((colKey: string) => {
    setColumnErrorWithTimer(null);
    setConfirmedSeps((prev) => ({ ...prev, [colKey]: true }));
    setSelectedNotConfirmedSeps((prev) => ({ ...prev, [colKey]: false }));
  }, [setColumnErrorWithTimer]);

  // Handler for unconfirming a unit row (Prompt 1C-2d C1)
  const handleUnconfirmUnit = useCallback((colKey: string) => {
    setConfirmedUnits((prev) => ({ ...prev, [colKey]: false }));
    setSelectedNotConfirmedUnits((prev) => ({ ...prev, [colKey]: true }));
  }, []);

  // Handler for unconfirming a separator row (Prompt 1C-2d C1)
  const handleUnconfirmSep = useCallback((colKey: string) => {
    setConfirmedSeps((prev) => ({ ...prev, [colKey]: false }));
    setSelectedNotConfirmedSeps((prev) => ({ ...prev, [colKey]: true }));
  }, []);

  // State for "XÁC NHẬN TẤT CẢ" undo banner (Prompt 1C-2d C2)
  const [undoConfirmAll, setUndoConfirmAll] = useState<{
    count: number;
    prevUnits: Record<string, boolean>;
    prevSeps: Record<string, boolean>;
  } | null>(null);

  const undoTimerRef = useRef<any>(null);

  useEffect(() => {
    return () => {
      if (undoTimerRef.current) {
        clearTimeout(undoTimerRef.current);
      }
    };
  }, []);

  // Handler for "XÁC NHẬN TẤT CẢ" (Prompt 1C-2a C3 & 1C-2d C2)
  const handleConfirmAll = useCallback(() => {
    let skippedCount = 0;
    let newlyConfirmedCount = 0;
    const newConfirmedUnits = { ...confirmedUnits };
    const newConfirmedSeps = { ...confirmedSeps };

    moneyColumns.forEach((col) => {
      const currentUnit = col.userUnit || col.detectedUnit || 'đồng';
      const needsUnitConfirm = currentUnit !== 'đồng' || Boolean(col.unit_suspicious);
      if (needsUnitConfirm && !confirmedUnits[col.key]) {
        if (col.unit_suspicious) {
          skippedCount++;
        } else {
          newConfirmedUnits[col.key] = true;
          newlyConfirmedCount++;
        }
      }
    });

    ambiguousColumns.forEach((col) => {
      if (!confirmedSeps[col.key]) {
        newConfirmedSeps[col.key] = true;
        newlyConfirmedCount++;
      }
    });

    const prevUnits = { ...confirmedUnits };
    const prevSeps = { ...confirmedSeps };

    setConfirmedUnits(newConfirmedUnits);
    setConfirmedSeps(newConfirmedSeps);
    setSelectedNotConfirmedUnits({});
    setSelectedNotConfirmedSeps({});

    if (newlyConfirmedCount > 0) {
      setUndoConfirmAll({
        count: newlyConfirmedCount,
        prevUnits,
        prevSeps,
      });

      if (undoTimerRef.current) {
        clearTimeout(undoTimerRef.current);
      }
      undoTimerRef.current = setTimeout(() => {
        setUndoConfirmAll(null);
        undoTimerRef.current = null;
      }, CONFIRM_ALL_UNDO_TIMEOUT_MS);
    }

    if (skippedCount > 0) {
      setSkippedWarningNotice(
        `Đã bỏ qua ${skippedCount} hàng có cảnh báo cần xem và bấm riêng.`
      );
    } else {
      setSkippedWarningNotice(null);
    }
  }, [moneyColumns, ambiguousColumns, confirmedUnits, confirmedSeps]);

  const handleUndoConfirmAll = useCallback(() => {
    if (!undoConfirmAll) return;
    setConfirmedUnits(undoConfirmAll.prevUnits);
    setConfirmedSeps(undoConfirmAll.prevSeps);
    if (undoTimerRef.current) {
      clearTimeout(undoTimerRef.current);
      undoTimerRef.current = null;
    }
    setUndoConfirmAll(null);
  }, [undoConfirmAll]);

  const summaryRoles = useMemo(() => {
    const list: Array<{ key: string; label: string; colLabel: string }> = [];
    for (const spec of BUSINESS_ROLES_SPEC) {
      const roleItem = (resolvedRoles as any)[spec.key];
      const assignedCol = roleItem?.col as BusinessColumn | null;
      if (assignedCol) {
        list.push({ key: spec.key, label: spec.label, colLabel: assignedCol.label });
      } else if (spec.key === 'profit' && resolvedRoles.revenue?.col && resolvedRoles.cogs?.col) {
        list.push({ key: spec.key, label: spec.label, colLabel: 'tự tính' });
      }
    }
    return list;
  }, [resolvedRoles]);

  const displayedSummaryRoles = summaryRoles.slice(0, 4);
  const hasMoreRoles = summaryRoles.length > 4;

  return (
    <div style={{ marginBottom: 'var(--space-4)' }}>
      {/* Prompt 1C-2b D2 & D3: Multi-sheet Selector using Buttons */}
      {table.available_sheets && table.available_sheets.length > 1 && (
        <div
          style={{
            padding: '10px 14px',
            backgroundColor: '#eff6ff',
            border: '1px solid var(--blue, #3b82f6)',
            borderRadius: '4px',
            marginBottom: '12px',
            fontFamily: 'var(--font-content)',
            fontSize: '13px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            <span style={{ fontWeight: 600 }}>📄 Trang tính (sheet):</span>
            {table.available_sheets.map((s) => {
              const isSelected = (table.selected_sheet || table.available_sheets![0].name) === s.name;
              return (
                <PixelButton
                  key={s.name}
                  variant={isSelected ? 'primary' : 'secondary'}
                  size="sm"
                  font="content"
                  onClick={() => onSelectSheet?.(s.name)}
                  style={{
                    fontWeight: isSelected ? 700 : 400,
                  }}
                >
                  {s.name} ({s.rowCount} dòng)
                </PixelButton>
              );
            })}
          </div>
          {table.available_sheets
            .filter((s) => s.sameHeaderAsSelected)
            .map((s) => (
              <div key={s.name} style={{ color: '#b45309', fontSize: '12px', marginTop: '6px' }}>
                ⚠️ Sheet "{s.name}" có cùng tiêu đề cột và KHÔNG được gộp.
              </div>
            ))}
        </div>
      )}

      {/* Prompt 1C-2c E3: COGS Exceeds Revenue Warning */}
      {table.cogs_exceeds_revenue_warning && (
        <div
          style={{
            padding: '10px 14px',
            backgroundColor: '#fffbeb',
            border: '1px solid var(--warn, #f59e0b)',
            borderRadius: '4px',
            marginBottom: '12px',
            color: '#92400e',
            fontSize: '13px',
            fontWeight: 600,
            fontFamily: 'var(--font-content)',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
          }}
        >
          <span style={{ fontSize: '16px' }}>⚠️</span>
          <span>{table.cogs_exceeds_revenue_warning}</span>
        </div>
      )}

      {/* Prompt 1C-2b E1 & 1C-2c G5 & 1C-2d E4: Column Role Mapping Panel */}
      {isConfident && isCollapsed ? (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '8px 14px',
            backgroundColor: '#f0fdf4',
            border: '1px solid #10b981',
            borderRadius: '4px',
            marginBottom: '12px',
            fontSize: '13px',
            color: '#065f46',
            fontFamily: 'var(--font-content)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            <span style={{ color: '#059669', fontWeight: 700 }}>✓</span>
            <span>
              Đã tự đọc file:{' '}
              {displayedSummaryRoles.map((r, idx) => (
                <React.Fragment key={r.key}>
                  {idx > 0 && '; '}
                  {r.label} = <strong>{r.colLabel}</strong>
                </React.Fragment>
              ))}
              {hasMoreRoles ? '…' : ''}
            </span>
          </div>
          <button
            type="button"
            onClick={() => {
              setIsCollapsed(false);
              userToggledRef.current = true;
            }}
            style={{
              background: 'none',
              border: 'none',
              color: '#047857',
              fontWeight: 700,
              cursor: 'pointer',
              textDecoration: 'underline',
              padding: '2px 6px',
              fontSize: '13px',
              whiteSpace: 'nowrap',
            }}
          >
            [Xem/sửa]
          </button>
        </div>
      ) : (
        <div
          style={{
            border: '1px solid var(--ink-soft, #cbd5e1)',
            borderRadius: '4px',
            backgroundColor: 'var(--panel, #f8fafc)',
            padding: '12px 14px',
            marginBottom: '12px',
          }}
        >
          <div
            style={{
              fontWeight: 700,
              fontSize: '13px',
              marginBottom: '8px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: '8px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span>CỘT ĐÃ NHẬN DIỆN</span>
              {isConfident && (
                <button
                  type="button"
                  onClick={() => {
                    setIsCollapsed(true);
                    userToggledRef.current = true;
                  }}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: '#047857',
                    fontWeight: 600,
                    cursor: 'pointer',
                    textDecoration: 'underline',
                    fontSize: '12px',
                    padding: 0,
                  }}
                >
                  [Thu gọn]
                </button>
              )}
            </div>
            <span style={{ fontSize: '11px', color: 'var(--ink-soft)', fontWeight: 'normal' }}>
              Có thể chọn lại vai trò nếu nhận diện chưa đúng
            </span>
          </div>

          {columnError && (
            <div
              style={{
                padding: '6px 10px',
                backgroundColor: '#fef2f2',
                border: '1px solid var(--bad, #ef4444)',
                color: 'var(--bad, #b91c1c)',
                fontSize: '12px',
                fontFamily: 'var(--font-content)',
                marginBottom: '8px',
                borderRadius: '4px',
              }}
            >
              ⚠️ {columnError}
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '8px' }}>
            {BUSINESS_ROLES_SPEC.map((spec) => {
              const roleItem = (resolvedRoles as any)[spec.key];
              const assignedCol = roleItem?.col as BusinessColumn | null;
              const isMandatory = spec.key === 'revenue';
              const isProfit = spec.key === 'profit';
              const hasRev = Boolean(resolvedRoles.revenue?.col);
              const hasCogs = Boolean(resolvedRoles.cogs?.col);
              const isProfitComputed = isProfit && !assignedCol && hasRev && hasCogs;

              let colLabel = '';
              let labelColor = 'var(--ink)';
              if (assignedCol) {
                colLabel = assignedCol.label;
              } else if (isProfitComputed) {
                colLabel = 'tự tính';
                labelColor = 'var(--ink-soft)';
              } else if (isMandatory) {
                colLabel = '(chưa tìm thấy)';
                labelColor = 'var(--bad, #ef4444)';
              } else {
                colLabel = 'không có';
                labelColor = 'var(--ink-soft)';
              }

              const isUserChosen = Boolean(
                (assignedCol && (assignedCol as any).userChosenRole === spec.key) ||
                (table.manual_column_roles && table.manual_column_roles[assignedCol?.label || ''] === spec.key)
              );
              const isInferred = roleItem?.status === 'suy luận';
              const isRoleConfirmed = Boolean(confirmedRoles[spec.key]);

              let sourceLabel = 'tự nhận diện';
              if (isProfitComputed) {
                sourceLabel = 'tự tính';
              } else if (isUserChosen) {
                sourceLabel = 'người dùng chọn';
              } else if (isInferred) {
                sourceLabel = isRoleConfirmed ? 'suy luận (đã xác nhận)' : 'suy luận (chưa xác nhận)';
              }

              const isUnconfirmedInferred = isInferred && assignedCol && !isUserChosen && !isRoleConfirmed;

              return (
                <div
                  key={spec.key}
                  style={{
                    display: 'flex',
                    flexDirection: isUnconfirmedInferred ? 'column' : 'row',
                    alignItems: isUnconfirmedInferred ? 'stretch' : 'center',
                    justifyContent: 'space-between',
                    padding: '6px 10px',
                    backgroundColor: '#ffffff',
                    border: '1px solid #e2e8f0',
                    borderRadius: '4px',
                    gap: isUnconfirmedInferred ? '6px' : '8px',
                  }}
                >
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', overflow: 'hidden' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: isUnconfirmedInferred ? 'wrap' : 'nowrap' }}>
                      <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--ink)' }}>
                        {spec.label}:
                      </span>
                      <span
                        style={{
                          fontSize: '13px',
                          fontWeight: 600,
                          color: labelColor,
                          whiteSpace: isUnconfirmedInferred ? 'normal' : 'nowrap',
                          wordBreak: isUnconfirmedInferred ? 'break-word' : 'normal',
                          textOverflow: isUnconfirmedInferred ? 'clip' : 'ellipsis',
                          overflow: isUnconfirmedInferred ? 'visible' : 'hidden',
                        }}
                        title={colLabel}
                      >
                        {colLabel}
                      </span>
                    </div>
                    {(assignedCol || isProfitComputed) && (
                      <span
                        style={{
                          fontSize: '10px',
                          fontWeight: isUserChosen || isRoleConfirmed ? 700 : 'normal',
                          color: isUserChosen || isRoleConfirmed ? '#065f46' : 'var(--ink-soft)',
                          backgroundColor: isUserChosen || isRoleConfirmed ? '#d1fae5' : '#f1f5f9',
                          padding: '1px 5px',
                          borderRadius: '2px',
                          width: 'fit-content',
                        }}
                      >
                        nguồn: {sourceLabel}
                      </span>
                    )}
                  </div>

                  <div
                    style={{
                      display: 'flex',
                      flexDirection: isUnconfirmedInferred ? 'column' : 'row',
                      alignItems: isUnconfirmedInferred ? 'stretch' : 'center',
                      gap: '6px',
                      marginLeft: isUnconfirmedInferred ? '0' : 'auto',
                      width: isUnconfirmedInferred ? '100%' : 'auto',
                    }}
                  >
                    {isInferred && assignedCol && !isUserChosen && (
                      !isRoleConfirmed ? (
                        <PixelButton
                          size="sm"
                          font="content"
                          variant="primary"
                          disabled={isApproved}
                          onClick={() => onConfirmRole?.(spec.key)}
                          style={{
                            backgroundColor: 'var(--warn, #f59e0b)',
                            color: '#ffffff',
                            fontWeight: 'bold',
                            fontSize: '11px',
                            padding: '6px 12px',
                            width: '100%',
                            whiteSpace: 'nowrap',
                            flexShrink: 0,
                          }}
                        >
                          ĐÚNG, XÁC NHẬN
                        </PixelButton>
                      ) : (
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                          <span style={{ fontSize: '11px', color: 'var(--good, #10b981)', fontWeight: 600 }}>✓ Đã xác nhận</span>
                          <button
                            type="button"
                            disabled={isApproved}
                            onClick={() => onRevertRoleConfirm?.(spec.key)}
                            style={{
                              background: 'none',
                              border: 'none',
                              color: isApproved ? 'var(--ink-soft)' : '#b45309',
                              fontWeight: 600,
                              cursor: isApproved ? 'not-allowed' : 'pointer',
                              textDecoration: 'underline',
                              fontSize: '11px',
                              padding: '2px 4px',
                            }}
                          >
                            [Sửa lại]
                          </button>
                        </div>
                      )
                    )}

                    <select
                      disabled={isApproved}
                      aria-label={`Chọn cột cho vai trò ${spec.label}`}
                      value={assignedCol ? assignedCol.key : ''}
                      onChange={(e) => handleAssignRole(spec.key, e.target.value)}
                      style={{
                        padding: '4px 6px',
                        fontSize: '12px',
                        fontFamily: 'var(--font-content)',
                        borderRadius: '4px',
                        border: '1px solid #cbd5e1',
                        backgroundColor: isApproved ? '#f1f5f9' : '#fff',
                        maxWidth: isUnconfirmedInferred ? '100%' : '160px',
                        width: isUnconfirmedInferred ? '100%' : 'auto',
                        cursor: isApproved ? 'not-allowed' : 'pointer',
                      }}
                    >
                      <option value="">[Không dùng cột nào]</option>
                      {table.columns.map((c) => (
                        <option key={c.key} value={c.key}>
                          {c.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Top Banner (Status and "XÁC NHẬN TẤT CẢ" Button) */}
      {approvalLockReasons ? (
        approvalLockReasons.length === 0 ? (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              padding: '10px 14px',
              backgroundColor: '#f0fdf4',
              border: '1px solid var(--good, #10b981)',
              borderRadius: '4px',
              marginBottom: '12px',
              gap: '8px',
            }}
          >
            <span style={{ fontSize: '15px', color: 'var(--good, #10b981)' }}>✓</span>
            <span
              className="font-content"
              style={{ fontSize: '13px', fontWeight: 600, color: 'var(--good, #10b981)' }}
            >
              Đã xác nhận đủ. Bấm DUYỆT VÀ TIẾP TỤC ở thanh dưới.
            </span>
          </div>
        ) : (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '10px 14px',
              backgroundColor: '#fffbeb',
              border: '1px solid var(--warn, #f59e0b)',
              borderRadius: '4px',
              marginBottom: '12px',
              gap: '12px',
              flexWrap: 'wrap',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '16px' }}>⚠️</span>
              <span
                className="font-content"
                style={{ fontSize: '13px', fontWeight: 600, color: '#92400e' }}
              >
                Cần xác nhận thêm: {approvalLockReasons.join('; ')}
              </span>
            </div>

            {unconfirmedItems.length > 1 && !isApproved && (
              <PixelButton
                size="sm"
                font="content"
                variant="primary"
                onClick={handleConfirmAll}
                style={{
                  backgroundColor: 'var(--warn, #f59e0b)',
                  color: '#ffffff',
                  fontWeight: 'bold',
                  boxShadow: '0 2px 4px rgba(245, 158, 11, 0.3)',
                }}
              >
                XÁC NHẬN TẤT CẢ
              </PixelButton>
            )}
          </div>
        )
      ) : !isAllConfirmed ? (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '10px 14px',
            backgroundColor: '#fffbeb',
            border: '1px solid var(--warn, #f59e0b)',
            borderRadius: '4px',
            marginBottom: '12px',
            gap: '12px',
            flexWrap: 'wrap',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '16px' }}>⚠️</span>
            <span
              className="font-content"
              style={{ fontSize: '13px', fontWeight: 600, color: '#92400e' }}
            >
              Còn {unconfirmedItems.length} mục chưa xác nhận:{' '}
              {unconfirmedItems.map((i) => i.label).join(', ')}
            </span>
          </div>

          {unconfirmedItems.length > 1 && !isApproved && (
            <PixelButton
              size="sm"
              font="content"
              variant="primary"
              onClick={handleConfirmAll}
              style={{
                backgroundColor: 'var(--warn, #f59e0b)',
                color: '#ffffff',
                fontWeight: 'bold',
                boxShadow: '0 2px 4px rgba(245, 158, 11, 0.3)',
              }}
            >
              XÁC NHẬN TẤT CẢ
            </PixelButton>
          )}
        </div>
      ) : !isCollapsed ? (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            padding: '10px 14px',
            backgroundColor: '#f0fdf4',
            border: '1px solid var(--good, #10b981)',
            borderRadius: '4px',
            marginBottom: '12px',
            gap: '8px',
          }}
        >
          <span style={{ fontSize: '15px', color: 'var(--good, #10b981)' }}>✓</span>
          <span
            className="font-content"
            style={{ fontSize: '13px', fontWeight: 600, color: 'var(--good, #10b981)' }}
          >
            Đã xác nhận đủ. Bấm DUYỆT VÀ TIẾP TỤC ở thanh dưới.
          </span>
        </div>
      ) : null}

      {/* Undo Banner for "XÁC NHẬN TẤT CẢ" (Prompt 1C-2d C2 & 1D-2 0b.2) */}
      {undoConfirmAll && !isApproved && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '8px 14px',
            backgroundColor: '#eff6ff',
            border: '1px solid var(--blue, #3b82f6)',
            borderRadius: '4px',
            marginBottom: '12px',
            fontSize: '13px',
            fontFamily: 'var(--font-content)',
            color: '#1e40af',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '15px' }}>ℹ️</span>
            <span>Đã xác nhận {undoConfirmAll.count} mục.</span>
            <button
              type="button"
              onClick={handleUndoConfirmAll}
              style={{
                background: 'none',
                border: 'none',
                color: '#1d4ed8',
                fontWeight: 700,
                cursor: 'pointer',
                textDecoration: 'underline',
                padding: '2px 6px',
                fontSize: '13px',
              }}
            >
              [HOÀN TÁC]
            </button>
          </div>
        </div>
      )}

      {/* Notice when suspicious rows were skipped by "XÁC NHẬN TẤT CẢ" */}
      {skippedWarningNotice && unconfirmedItems.length > 0 && (
        <div
          style={{
            padding: '8px 12px',
            backgroundColor: '#fef2f2',
            border: '1px solid var(--bad, #ef4444)',
            borderRadius: '4px',
            marginBottom: '12px',
            color: 'var(--bad, #b91c1c)',
            fontSize: '12px',
            fontFamily: 'var(--font-content)',
            fontWeight: 600,
          }}
        >
          ⚠️ {skippedWarningNotice}
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {/* Money Columns Confirmation */}
        {moneyColumns.map((col) => {
          const currentUnit = col.userUnit || col.detectedUnit || 'đồng';
          const isConfirmed = Boolean(confirmedUnits[col.key]);
          const isSelectedNotConfirmed = Boolean(selectedNotConfirmedUnits[col.key]);

          // Prompt 1C-2b G2: Accurate source label
          let sourceText = 'mặc định';
          if (isConfirmed) {
            sourceText = 'người dùng xác nhận';
          } else if (isSelectedNotConfirmed) {
            sourceText = 'đã chọn, chưa xác nhận';
          } else if (col.unitSource === 'header') {
            sourceText = 'đọc từ tiêu đề cột';
          } else if (col.unitSource === 'người dùng xác nhận') {
            sourceText = 'người dùng xác nhận';
          }

          const isDongNoSuspicion = currentUnit === 'đồng' && !col.unit_suspicious;
          const needsConfirm = !isDongNoSuspicion;
          const isRowConfirmed = !needsConfirm || isConfirmed;

          // Prompt 1C-2d E4: In collapsed mode, hide unneeded "đồng" rows without suspicion
          if (isCollapsed && isDongNoSuspicion) {
            return null;
          }

          return (
            <div
              key={col.key}
              style={{
                border: needsConfirm
                  ? isRowConfirmed
                    ? '2px solid var(--good, #10b981)'
                    : '2px solid var(--warn, #f59e0b)'
                  : '1px solid var(--ink-soft, #cbd5e1)',
                backgroundColor: needsConfirm
                  ? isRowConfirmed
                    ? '#f0fdf4'
                    : '#fffbeb'
                  : 'var(--white)',
                borderRadius: '4px',
                padding: '12px 14px',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  alignItems: 'center',
                  gap: '10px',
                  fontFamily: 'var(--font-content)',
                  fontSize: '14px',
                  color: 'var(--ink)',
                }}
              >
                <span>
                  Cột <strong>"{col.label}"</strong> tính bằng <strong>{currentUnit}</strong>. Đúng không?
                </span>
                <span style={{ fontSize: '12px', color: 'var(--ink-soft)', fontStyle: 'italic' }}>
                  ({sourceText})
                </span>

                <div
                  style={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    alignItems: 'center',
                    gap: '6px',
                    marginLeft: 'auto',
                  }}
                >
                  {UNIT_OPTIONS.map((opt) => {
                    const isSelected = currentUnit === opt.label;
                    return (
                      <PixelButton
                        key={opt.label}
                        size="sm"
                        font="content"
                        variant={isSelected ? 'primary' : 'secondary'}
                        disabled={isApproved}
                        onClick={() => handleSelectUnit(col.key, opt.label, opt.mult)}
                      >
                        {opt.label}
                      </PixelButton>
                    );
                  })}

                  {/* Prompt C1 & G1 & 1C-2d C1: High contrast confirmation button + SỬA LẠI */}
                  {needsConfirm &&
                    (!isRowConfirmed ? (
                      <PixelButton
                        size="sm"
                        font="content"
                        variant="primary"
                        disabled={isApproved}
                        onClick={() => handleConfirmCurrentUnit(col.key)}
                        style={{
                          backgroundColor: 'var(--warn, #f59e0b)',
                          color: '#ffffff',
                          fontWeight: 'bold',
                          marginLeft: '8px',
                        }}
                      >
                        ĐÚNG, XÁC NHẬN
                      </PixelButton>
                    ) : (
                      <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', marginLeft: '8px' }}>
                        <button
                          type="button"
                          aria-disabled="true"
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            height: '28px',
                            padding: '0 10px',
                            backgroundColor: '#d1fae5',
                            color: '#065f46',
                            border: '1px solid #059669',
                            borderStyle: 'solid',
                            borderRadius: '4px',
                            fontWeight: 700,
                            fontSize: '12px',
                            fontFamily: 'var(--font-content)',
                            opacity: 1,
                            filter: 'none',
                            cursor: 'default',
                          }}
                        >
                          ✓ Đã xác nhận
                        </button>
                        <PixelButton
                          size="sm"
                          font="content"
                          variant="secondary"
                          disabled={isApproved}
                          onClick={() => handleUnconfirmUnit(col.key)}
                          style={{
                            height: '28px',
                            padding: '0 8px',
                            fontSize: '12px',
                            fontWeight: 600,
                            color: 'var(--ink)',
                          }}
                        >
                          SỬA LẠI
                        </PixelButton>
                      </div>
                    ))}
                </div>
              </div>

              {/* Suspicious Warning */}
              {col.unit_suspicious && col.suspiciousReason && (
                <div
                  style={{
                    marginTop: '8px',
                    padding: '8px 12px',
                    backgroundColor: '#fff',
                    border: '1px solid var(--warn)',
                    borderRadius: '2px',
                    color: '#92400e',
                    fontSize: '13px',
                    fontFamily: 'var(--font-content)',
                  }}
                >
                  ⚠️ {col.suspiciousReason}
                </div>
              )}
            </div>
          );
        })}

        {/* Ambiguous Separator Columns Confirmation */}
        {ambiguousColumns.map((col) => {
          const currentConv = col.userDecimalConvention || 'comma';
          const isSelectedThousand = currentConv === 'comma';
          const isSelectedDecimal = currentConv === 'dot';
          const sample = col.sampleAmbiguous || '1.250';
          const isConfirmed = Boolean(confirmedSeps[col.key]);
          const isSepSelectedNotConfirmed = Boolean(selectedNotConfirmedSeps[col.key]);

          // Prompt 1C-2b G2: Separator source text
          let sepSourceText = 'đọc từ dữ liệu';
          if (isConfirmed) {
            sepSourceText = 'người dùng xác nhận';
          } else if (isSepSelectedNotConfirmed) {
            sepSourceText = 'đã chọn, chưa xác nhận';
          }

          return (
            <div
              key={col.key}
              style={{
                border: isConfirmed ? '2px solid var(--good, #10b981)' : '2px solid var(--warn, #f59e0b)',
                backgroundColor: isConfirmed ? '#f0fdf4' : '#fffbeb',
                borderRadius: '4px',
                padding: '12px 14px',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  alignItems: 'center',
                  gap: '10px',
                  fontFamily: 'var(--font-content)',
                  fontSize: '14px',
                  color: 'var(--ink)',
                }}
              >
                <span>
                  Cột <strong>"{col.label}"</strong> có số dạng <strong>{sample}</strong> — dấu chấm là phân cách nghìn
                  hay thập phân?
                </span>
                <span style={{ fontSize: '12px', color: 'var(--ink-soft)', fontStyle: 'italic' }}>
                  ({sepSourceText})
                </span>

                <div
                  style={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    alignItems: 'center',
                    gap: '6px',
                    marginLeft: 'auto',
                  }}
                >
                  <PixelButton
                    size="sm"
                    font="content"
                    variant={isSelectedThousand ? 'primary' : 'secondary'}
                    disabled={isApproved}
                    onClick={() => handleSelectDecimalConvention(col.key, 'comma')}
                  >
                    Dấu chấm là phân cách nghìn
                  </PixelButton>
                  <PixelButton
                    size="sm"
                    font="content"
                    variant={isSelectedDecimal ? 'primary' : 'secondary'}
                    disabled={isApproved}
                    onClick={() => handleSelectDecimalConvention(col.key, 'dot')}
                  >
                    Dấu chấm là thập phân
                  </PixelButton>

                  {/* Prompt C1 & G1 & 1C-2d C1: High contrast confirmation button + SỬA LẠI */}
                  {!isConfirmed ? (
                    <PixelButton
                      size="sm"
                      font="content"
                      variant="primary"
                      disabled={isApproved}
                      onClick={() => handleConfirmCurrentSep(col.key)}
                      style={{
                        backgroundColor: 'var(--warn, #f59e0b)',
                        color: '#ffffff',
                        fontWeight: 'bold',
                        marginLeft: '8px',
                      }}
                    >
                      ĐÚNG, XÁC NHẬN
                    </PixelButton>
                  ) : (
                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', marginLeft: '8px' }}>
                      <button
                        type="button"
                        aria-disabled="true"
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          height: '28px',
                          padding: '0 10px',
                          backgroundColor: '#d1fae5',
                          color: '#065f46',
                          border: '1px solid #059669',
                          borderStyle: 'solid',
                          borderRadius: '4px',
                          fontWeight: 700,
                          fontSize: '12px',
                          fontFamily: 'var(--font-content)',
                          opacity: 1,
                          filter: 'none',
                          cursor: 'default',
                        }}
                      >
                        ✓ Đã xác nhận
                      </button>
                      <PixelButton
                        size="sm"
                        font="content"
                        variant="secondary"
                        disabled={isApproved}
                        onClick={() => handleUnconfirmSep(col.key)}
                        style={{
                          height: '28px',
                          padding: '0 8px',
                          fontSize: '12px',
                          fontWeight: 600,
                          color: 'var(--ink)',
                        }}
                      >
                        SỬA LẠI
                      </PixelButton>
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
