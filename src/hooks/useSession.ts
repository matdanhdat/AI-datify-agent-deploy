import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import { buildSessionView } from '../core/state';
import type { Session } from '../types/contract';
import { createSession, getSession } from '../services/sessionService';
import { sessionStore } from '../services/sessionStore';

export function useSession() {
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Subscribe to store snapshots
  const storeMap = useSyncExternalStore(
    sessionStore.subscribe,
    () => sessionStore.getSnapshot(),
    () => new Map()
  );

  const activeId = sessionStore.getActiveSessionId();
  const currentRecord = activeId ? storeMap.get(activeId) : undefined;
  const session: Session | null = currentRecord ? buildSessionView(currentRecord) : null;

  const createNewSession = useCallback(async (name?: string): Promise<Session> => {
    setLoading(true);
    try {
      const created = createSession(name);
      setError(null);
      return created;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Không thể tạo phiên mới.';
      setError(msg);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const initSession = useCallback(() => {
    setLoading(true);
    if (!sessionStore.getActiveSessionId()) {
      const existing = sessionStore.getAllRecords();
      if (existing.length > 0) {
        sessionStore.setActiveSessionId(existing[0].id);
      } else {
        createSession();
      }
    }

    if (typeof window !== 'undefined') {
      const searchParams = new URLSearchParams(window.location.search);
      const fs = searchParams.get('forceState');
      if (fs) {
        const id = sessionStore.getActiveSessionId();
        if (id) {
          const rec = sessionStore.getRecord(id);
          if (rec && rec.state !== fs) {
            rec.state = fs as any;
            if (fs !== 'created' && !rec.meta.dataset) {
              rec.meta.dataset = {
                filename: 'file-mau-chuan.xlsx',
                rows: 750,
                symbols: ['TMA', 'TMB', 'TMC'],
                date_from: '2025-01-02',
                date_to: '2025-12-31',
                sha256: '9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08',
              };
            }
            sessionStore.setRecord(rec);
          }
        }
      }

      if (searchParams.get('demoContext') === '1') {
        const id = sessionStore.getActiveSessionId();
        if (id) {
          const rec = sessionStore.getRecord(id);
          if (rec) {
            rec.meta.business_context = {
              company_name: 'CTCP Bán Lẻ Thời Trang ABC',
              role: 'Giám đốc Vận hành (COO)',
              extra_info: 'Ưu tiên tối ưu chi phí giá vốn và so sánh doanh thu giữa các kênh bán.',
              analysis_questions: [
                'Kênh bán nào mang lại tỷ suất lợi nhuận gộp cao nhất?',
                'Chi phí giá vốn biến động như thế nào qua các tháng?',
                'Sản phẩm chủ lực nào đóng góp trên 50% doanh thu?',
              ],
            };
            rec.meta.context_hash = 'a1b2c3d4e5f60718293a4b5c6d7e8f90123456789abcdef0123456789abcdef0';
            sessionStore.setRecord(rec);
          }
        }
      }

      if (searchParams.get('demoBusiness') === '1') {
        const id = sessionStore.getActiveSessionId();
        if (id) {
          const rec = sessionStore.getRecord(id);
          if (rec) {
            rec.meta.dataset = {
              filename: 'du-lieu-test-ban-le.csv',
              rows: 50,
              symbols: [],
              date_from: '2025-01-02',
              date_to: '2025-02-28',
              kind: 'business',
              columns_roles: [
                { file_header: 'Mã đơn', key: 'col_0_id', role: 'id' },
                { file_header: 'Ngày đặt', key: 'col_1_time', role: 'time' },
                { file_header: 'Khách hàng', key: 'col_2_dim', role: 'dimension' },
                { file_header: 'Kênh bán', key: 'col_3_dim', role: 'dimension' },
                { file_header: 'Sản phẩm', key: 'col_4_dim', role: 'dimension' },
                { file_header: 'Khu vực', key: 'col_5_dim', role: 'dimension' },
                { file_header: 'Số lượng', key: 'col_6_measure', role: 'measure' },
                { file_header: 'Đơn giá', key: 'col_7_measure', role: 'measure' },
                { file_header: 'Doanh thu (VND)', key: 'col_8_measure', role: 'measure', unit: 'VND' },
                { file_header: 'Chi phí giá vốn (VND)', key: 'col_9_measure', role: 'measure', unit: 'VND' },
                { file_header: 'Lợi nhuận gộp (VND)', key: 'col_10_measure', role: 'measure', unit: 'VND' },
              ],
              n_columns: 11,
              sha256: '88a31e84d2b2fe8e9065a3d7b7e289df713b1853f191b75c805ebdf5f1d07c08',
            };
            sessionStore.setRecord(rec);
          }
        }
      }
    }

    setLoading(false);
  }, []);

  useEffect(() => {
    initSession();
  }, [initSession]);

  const refreshSession = useCallback(async () => {
    const currentId = sessionStore.getActiveSessionId();
    if (currentId) {
      try {
        getSession(currentId);
      } catch (_e) {
        createSession();
      }
    }
  }, []);

  const isPageUnlocked = useCallback(
    (pageKey: string): boolean => {
      if (!session) return pageKey === 'home' || pageKey === 'config' || pageKey === 'thu-vien-giao-dien';
      return session.unlocked_pages.includes(pageKey) || pageKey === 'thu-vien-giao-dien';
    },
    [session]
  );

  return {
    session,
    loading,
    error,
    refreshSession,
    createNewSession,
    isPageUnlocked,
  };
}
