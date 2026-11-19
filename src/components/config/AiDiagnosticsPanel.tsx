/**
 * AI Diagnostics Panel (Prompt P6 Section 9.4).
 * Executes 5 lightweight probe tasks: ping, explain_cleaning, write_report, chat_explain, plan_custom.
 * Validates output schemas and provides actionable recommendations for non-programmers.
 * Zero secrets exposed. Strictly rate-limited to 1 run per 30 seconds.
 */

import React, { useState } from 'react';
import { PixelPanel } from '../pixel/PixelPanel';
import { PixelButton } from '../pixel/PixelButton';
import { PixelBadge } from '../pixel/PixelBadge';
import { callAi, isAiAvailable } from '../../services/aiClient';
import { formatAiError } from '../../core/aiErrors';
import { useToast } from '../pixel/PixelToast';

export interface DiagnosticItemResult {
  task: 'ping' | 'explain_cleaning' | 'write_report' | 'chat_explain' | 'plan_custom';
  name_vi: string;
  status: 'pending' | 'success' | 'error';
  latency_ms?: number;
  model_used?: string;
  thinking_level?: string;
  thoughts_tokens?: number;
  error_code?: string;
  error_message?: string;
  recommendation_vi: string;
}

const DIAGNOSTIC_TASKS: Array<{ task: DiagnosticItemResult['task']; name_vi: string; payload: any }> = [
  {
    task: 'ping',
    name_vi: 'Kiểm tra kết nối cổng (ping)',
    payload: {
      timestamp: Date.now(),
    },
  },
  {
    task: 'explain_cleaning',
    name_vi: 'Giải thích làm sạch (explain_cleaning)',
    payload: {
      total_rows: 750,
      total_symbols: 3,
      date_from: '2025-01-02',
      date_to: '2025-12-31',
      proposals: [
        {
          id: 'prop_fill_vol_1',
          op: 'fill_missing_volume_zero',
          rows_affected: 3,
          affected_symbols: ['TMA'],
          severity: 'info',
          default_enabled: true,
        },
      ],
    },
  },
  {
    task: 'write_report',
    name_vi: 'Viết nhận định kiểm chứng (write_report)',
    payload: {
      config: {
        symbols: ['TMA'],
        date_from: '2025-01-02',
        date_to: '2025-12-31',
        sessions: 250,
      },
      metrics: [
        {
          key: 'm:period_return:TMA',
          id: 'period_return',
          label_vi: 'Lợi suất cả kỳ',
          symbol: 'TMA',
          unit: 'ratio',
          value: 0.154,
          display: '15,40%',
          polarity: 'positive',
        },
      ],
      insufficient: [],
      charts: [],
      assumptions: {
        trading_days: 252,
        risk_free_rate: 0,
        ma_windows: [20, 50],
        rsi_window: 14,
        volume_spike_rule: 'volume > mean20 + 2*std20',
      },
      data_notes: {
        raw_rows: 250,
        clean_rows: 250,
        dropped_rows: 0,
        operations_enabled: 6,
        flagged_outliers: 0,
        warnings_count: 0,
      },
      only_section: 'overview',
      style: 'concise',
    },
  },
  {
    task: 'chat_explain',
    name_vi: 'Trợ lý giải thích (chat_explain)',
    payload: {
      question: 'Chỉ số RSI là gì?',
      page: '/cau-hinh',
      state: 'analyzed',
      history: [],
      context: {
        data_summary: {
          filename: 'file-mau-chuan.csv',
          rows: 750,
          symbols: ['TMA', 'TMB', 'TMC'],
          date_from: '2025-01-02',
          date_to: '2025-12-31',
        },
      },
    },
  },
  {
    task: 'plan_custom',
    name_vi: 'Lập kế hoạch phân tích riêng (plan_custom)',
    payload: {
      request: 'Xếp hạng top mã theo lợi suất',
      data_profile: {
        symbols: ['TMA', 'TMB'],
        date_from: '2025-01-02',
        date_to: '2025-12-31',
        date_range: { from: '2025-01-02', to: '2025-12-31' },
        bar_count: 500,
        columns: ['open', 'high', 'low', 'close', 'volume'],
      },
    },
  },
];

export const AiDiagnosticsPanel: React.FC = () => {
  const { showToast } = useToast();
  const [isRunning, setIsRunning] = useState<boolean>(false);
  const [results, setResults] = useState<DiagnosticItemResult[] | null>(null);
  const [lastRunTime, setLastRunTime] = useState<number>(0);
  const [copied, setCopied] = useState<boolean>(false);

  React.useEffect(() => {
    if (typeof window !== 'undefined') {
      const search = new URLSearchParams(window.location.search);
      if (search.get('demoDiag') === '1') {
        setResults([
          {
            task: 'ping',
            name_vi: 'Kiểm tra kết nối cổng (ping)',
            status: 'success',
            latency_ms: 45,
            model_used: 'gemini-3.5-flash-lite',
            thinking_level: 'minimal',
            thoughts_tokens: 0,
            recommendation_vi: 'Cổng AI hoạt động ổn định.',
          },
          {
            task: 'explain_cleaning',
            name_vi: 'Giải thích làm sạch (explain_cleaning)',
            status: 'success',
            latency_ms: 120,
            model_used: 'gemini-3.5-flash-lite',
            thinking_level: 'minimal',
            thoughts_tokens: 0,
            recommendation_vi: 'Giải thích làm sạch phản hồi tốt.',
          },
          {
            task: 'write_report',
            name_vi: 'Viết nhận định kiểm chứng (write_report)',
            status: 'success',
            latency_ms: 210,
            model_used: 'gemini-3.5-flash-lite',
            thinking_level: 'low',
            thoughts_tokens: 38,
            recommendation_vi: 'Nhận định số liệu vượt qua bộ kiểm chứng.',
          },
          {
            task: 'chat_explain',
            name_vi: 'Trợ lý giải thích (chat_explain)',
            status: 'success',
            latency_ms: 95,
            model_used: 'gemini-3.5-flash-lite',
            thinking_level: 'minimal',
            thoughts_tokens: 0,
            recommendation_vi: 'Trợ lý phản hồi chính xác với dẫn chứng.',
          },
          {
            task: 'plan_custom',
            name_vi: 'Lập kế hoạch quy trình (plan_custom)',
            status: 'success',
            latency_ms: 150,
            model_used: 'gemini-3.5-flash-lite',
            thinking_level: 'minimal',
            thoughts_tokens: 0,
            recommendation_vi: 'Kế hoạch tuân thủ danh mục 13 thao tác cho phép.',
          },
        ]);
      }
    }
  }, []);

  const getRecommendation = (code?: string, isSuccess?: boolean): string => {
    if (isSuccess) {
      return 'Hoạt động bình thường. Phản hồi hợp lệ và đúng quy chuẩn.';
    }
    switch (code) {
      case 'LLM_NOT_CONFIGURED':
        return 'Chưa cấu hình khóa API trên Vercel. Hãy thêm khóa trong Settings > Environment Variables của Vercel.';
      case 'LLM_RATE_LIMITED':
        return 'Hạn mức API của khóa chính đã hết hoặc vượt ngưỡng gọi/phút. Hãy thêm khóa dự phòng thứ hai thuộc project Google Cloud khác.';
      case 'LLM_MODEL_UNAVAILABLE':
        return 'Mô hình AI hiện tại không khả dụng hoặc bị gián đoạn từ Google. Kiểm tra lại tên mô hình.';
      case 'LLM_TIMEOUT':
        return 'Thời gian phản hồi vượt quá 50 giây. Kiểm tra lại đường truyền mạng hoặc thử lại sau.';
      case 'LLM_BAD_OUTPUT':
        return 'Đầu ra AI không khớp định dạng yêu cầu hoặc sai lệch kiểm chứng. Hệ thống tự động chuyển sang chế độ an toàn.';
      default:
        return 'Lỗi không xác định khi kết nối cổng AI. Hãy kiểm tra kết nối internet hoặc nhật ký Vercel Function.';
    }
  };

  const handleRunDiagnostics = async () => {
    const now = Date.now();
    if (now - lastRunTime < 30000) {
      const waitSeconds = Math.ceil((30000 - (now - lastRunTime)) / 1000);
      showToast({
        type: 'warn',
        title: 'Giới hạn tần suất',
        message: `Vui lòng đợi ${waitSeconds} giây trước khi chạy lại chẩn đoán để bảo vệ hạn mức API.`,
      });
      return;
    }

    setIsRunning(true);
    setCopied(false);

    // Initial placeholder state
    const initialList: DiagnosticItemResult[] = DIAGNOSTIC_TASKS.map((t) => ({
      task: t.task,
      name_vi: t.name_vi,
      status: 'pending',
      recommendation_vi: 'Đang kiểm tra...',
    }));
    setResults(initialList);

    // Check if AI is configured first
    const hasKeys = await isAiAvailable();
    if (!hasKeys) {
      const formatted = formatAiError({ code: 'LLM_NOT_CONFIGURED', message: 'Hệ thống đang chạy chế độ dự phòng (chưa có khóa API).' });
      const notConfiguredResults: DiagnosticItemResult[] = DIAGNOSTIC_TASKS.map((t) => ({
        task: t.task,
        name_vi: t.name_vi,
        status: 'error',
        error_code: 'LLM_NOT_CONFIGURED',
        error_message: formatted.user_display,
        recommendation_vi: formatted.hint_vi,
      }));
      setResults(notConfiguredResults);
      setIsRunning(false);
      setLastRunTime(Date.now());
      showToast({
        type: 'info',
        title: 'Chế độ dự phòng',
        message: 'Chưa gắn khóa AI. Ứng dụng đang dùng 100% tài liệu và mẫu câu dự phòng.',
      });
      return;
    }

    // Run probes sequentially
    const currentList: DiagnosticItemResult[] = [...initialList];

    for (let i = 0; i < DIAGNOSTIC_TASKS.length; i++) {
      const item = DIAGNOSTIC_TASKS[i];
      try {
        const res = await callAi<any>(item.task, item.payload);
        currentList[i] = {
          task: item.task,
          name_vi: item.name_vi,
          status: 'success',
          latency_ms: res.latency_ms,
          model_used: res.model,
          thinking_level: res.thinking_level,
          thoughts_tokens: res.thoughts_tokens,
          recommendation_vi: getRecommendation(undefined, true),
        };
      } catch (err: any) {
        const formatted = formatAiError(err);
        currentList[i] = {
          task: item.task,
          name_vi: item.name_vi,
          status: 'error',
          error_code: formatted.code,
          error_message: formatted.user_display,
          recommendation_vi: formatted.hint_vi + (formatted.invalid_fields.length > 0 ? ` (Trường sai: ${formatted.invalid_fields.join(', ')})` : ''),
        };
      }
      setResults([...currentList]);
    }

    setIsRunning(false);
    setLastRunTime(Date.now());
    showToast({
      type: 'success',
      title: 'Hoàn tất chẩn đoán AI',
      message: 'Đã hoàn tất kiểm tra 5 tác vụ AI.',
    });
  };

  const handleCopyReport = () => {
    if (!results) return;

    const reportText = [
      '=== KẾT QUẢ CHẨN ĐOÁN AI (DATIFY AI AGENT) ===',
      `Thời điểm kiểm tra: ${new Date().toLocaleString('vi-VN')} (Giờ VN)`,
      '--------------------------------------------------',
      ...results.map((r, idx) => {
        return [
          `[${idx + 1}] ${r.name_vi}`,
          `    Trạng thái: ${r.status === 'success' ? 'THÀNH CÔNG' : 'LỖI'}`,
          r.thinking_level ? `    Mức suy nghĩ: ${r.thinking_level}` : null,
          r.thoughts_tokens !== undefined ? `    Token suy nghĩ: ${r.thoughts_tokens}` : null,
          r.latency_ms ? `    Độ trễ: ${r.latency_ms} ms` : null,
          r.model_used ? `    Mô hình: ${r.model_used}` : null,
          r.error_code ? `    Mã lỗi: ${r.error_code}` : null,
          r.error_message ? `    Chi tiết lỗi: ${r.error_message}` : null,
          `    Khuyến nghị: ${r.recommendation_vi}`,
        ]
          .filter(Boolean)
          .join('\n');
      }),
      '--------------------------------------------------',
      '* Báo cáo chẩn đoán này hoàn toàn không chứa khóa bí mật API.',
    ].join('\n');

    navigator.clipboard.writeText(reportText).then(() => {
      setCopied(true);
      showToast({
        type: 'success',
        title: 'Đã sao chép kết quả',
        message: 'Nội dung chẩn đoán (không chứa khóa) đã được lưu vào clipboard.',
      });
      setTimeout(() => setCopied(false), 3000);
    });
  };

  return (
    <div style={{ marginTop: 'var(--space-6)' }}>
      <PixelPanel
        title="CHẨN ĐOÁN CỔNG AI 5 TÁC VỤ (AI DIAGNOSTICS)"
        headerAction={
          <div style={{ display: 'flex', gap: '8px' }}>
            {results && (
              <PixelButton
                variant="secondary"
                size="sm"
                icon={copied ? 'check' : undefined}
                onClick={handleCopyReport}
              >
                {copied ? 'Đã sao chép' : 'Sao chép kết quả chẩn đoán'}
              </PixelButton>
            )}
            <PixelButton
              variant="primary"
              size="sm"
              icon="pulse"
              onClick={handleRunDiagnostics}
              loading={isRunning}
            >
              Chạy chẩn đoán AI
            </PixelButton>
          </div>
        }
      >
        <div style={{ padding: 'var(--space-4)' }}>
          <p style={{ margin: '0 0 var(--space-3)', fontSize: '13px', color: 'var(--ink-soft)' }}>
            Công cụ hỗ trợ người dùng kiểm tra toàn diện cả 5 tác vụ AI bằng các mẫu dữ liệu nhỏ độc lập (không gửi dữ liệu giao dịch người dùng).
            Giúp xác nhận tính sẵn sàng của khóa API, kiểm tra cơ chế tự chuyển mô hình dự phòng và đưa ra hướng dẫn khắc phục cụ thể nếu có sự cố.
          </p>

          {!results && (
            <div style={{ textAlign: 'center', padding: 'var(--space-6)', color: 'var(--ink-soft)', fontSize: '13px' }}>
              Bấm nút <strong>"Chạy chẩn đoán AI"</strong> ở góc trên bên phải để bắt đầu kiểm tra lần lượt 5 tác vụ.
            </div>
          )}

          {results && (
            <div style={{ overflowX: 'auto', border: '1px solid var(--chart-grid)' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px', fontFamily: 'var(--font-excel)' }}>
                <thead>
                  <tr style={{ backgroundColor: 'var(--ink)', color: 'var(--white)' }}>
                    <th style={{ padding: '8px 10px', textAlign: 'left', border: '1px solid var(--chart-grid)', width: '20%' }}>
                      Tác vụ kiểm tra
                    </th>
                    <th style={{ padding: '8px 10px', textAlign: 'center', border: '1px solid var(--chart-grid)', width: '10%' }}>
                      Trạng thái
                    </th>
                    <th style={{ padding: '8px 10px', textAlign: 'center', border: '1px solid var(--chart-grid)', width: '11%' }}>
                      Mức suy nghĩ
                    </th>
                    <th style={{ padding: '8px 10px', textAlign: 'center', border: '1px solid var(--chart-grid)', width: '11%' }}>
                      Token suy nghĩ
                    </th>
                    <th style={{ padding: '8px 10px', textAlign: 'center', border: '1px solid var(--chart-grid)', width: '10%' }}>
                      Độ trễ (ms)
                    </th>
                    <th style={{ padding: '8px 10px', textAlign: 'center', border: '1px solid var(--chart-grid)', width: '14%' }}>
                      Mô hình sử dụng
                    </th>
                    <th style={{ padding: '8px 10px', textAlign: 'left', border: '1px solid var(--chart-grid)', width: '24%' }}>
                      Khuyến nghị xử lý
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {results.map((r, idx) => (
                    <tr
                      key={r.task}
                      style={{
                        backgroundColor: idx % 2 === 0 ? 'var(--chart-bg)' : 'var(--panel)',
                      }}
                    >
                      <td style={{ padding: '8px 10px', border: '1px solid var(--chart-grid)', fontWeight: 'bold' }}>
                        {r.name_vi}
                      </td>
                      <td style={{ padding: '8px 10px', textAlign: 'center', border: '1px solid var(--chart-grid)' }}>
                        {r.status === 'pending' ? (
                          <PixelBadge variant="neutral" size="sm">Đang thử...</PixelBadge>
                        ) : r.status === 'success' ? (
                          <PixelBadge variant="success" size="sm">Thành công</PixelBadge>
                        ) : (
                          <PixelBadge variant="danger" size="sm">
                            {r.error_code || 'Lỗi'}
                          </PixelBadge>
                        )}
                      </td>
                      <td style={{ padding: '8px 10px', textAlign: 'center', border: '1px solid var(--chart-grid)' }}>
                        {r.thinking_level ? (
                          <code style={{ fontSize: '11px', background: 'var(--white)', padding: '2px 4px', border: '1px solid var(--chart-grid)' }}>
                            {r.thinking_level}
                          </code>
                        ) : (
                          '-'
                        )}
                      </td>
                      <td style={{ padding: '8px 10px', textAlign: 'center', border: '1px solid var(--chart-grid)' }}>
                        {r.thoughts_tokens !== undefined ? (
                          <span>{r.thoughts_tokens.toLocaleString('vi-VN')}</span>
                        ) : (
                          '-'
                        )}
                      </td>
                      <td style={{ padding: '8px 10px', textAlign: 'center', border: '1px solid var(--chart-grid)' }}>
                        {r.latency_ms !== undefined ? `${r.latency_ms} ms` : '-'}
                      </td>
                      <td style={{ padding: '8px 10px', textAlign: 'center', border: '1px solid var(--chart-grid)' }}>
                        {r.model_used ? (
                          <code style={{ fontSize: '11px', background: 'var(--white)', padding: '2px 4px', border: '1px solid var(--chart-grid)' }}>
                            {r.model_used}
                          </code>
                        ) : (
                          '-'
                        )}
                      </td>
                      <td style={{ padding: '8px 10px', border: '1px solid var(--chart-grid)', color: r.status === 'error' ? 'var(--red)' : 'var(--ink-soft)' }}>
                        {r.status === 'error' && r.error_message && (
                          <div style={{ fontWeight: 'bold', marginBottom: '4px' }}>
                            {r.error_message}
                          </div>
                        )}
                        <div>{r.recommendation_vi}</div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </PixelPanel>
    </div>
  );
};
