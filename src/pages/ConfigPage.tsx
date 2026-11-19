import React, { useCallback, useEffect, useState } from 'react';
import { PixelBadge } from '../components/pixel/PixelBadge';
import { PixelButton } from '../components/pixel/PixelButton';
import { PixelIcon } from '../components/pixel/PixelIcon';
import { PixelPanel } from '../components/pixel/PixelPanel';
import { LoadingState } from '../components/pixel/PixelStates';
import { useToast } from '../components/pixel/PixelToast';
import { pingAi } from '../services/aiClient';
import { formatAiError } from '../core/aiErrors';
import { AppError } from '../core/errors';
import { getAppConfig } from '../services/sessionService';
import type { AppConfig } from '../types/contract';
import { AiDiagnosticsPanel } from '../components/config/AiDiagnosticsPanel';
import { getGuideText } from '../services/readers';

export const ConfigPage: React.FC = () => {
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [pingLoading, setPingLoading] = useState(false);
  const [pingResult, setPingResult] = useState<{
    success: boolean;
    message: string;
    latency_ms?: number;
    model_used?: string;
    thinking_level?: string;
    thoughts_tokens?: number;
  } | null>(null);
  const [lastPingTime, setLastPingTime] = useState(0);

  const { showToast } = useToast();

  const fetchConfig = useCallback(async () => {
    setLoading(true);
    try {
      const cfg = await getAppConfig();
      setConfig(cfg);
    } catch (err: any) {
      showToast({
        type: 'error',
        title: 'Lỗi nạp cấu hình',
        message: err.message || 'Không thể lấy thông tin cấu hình.',
      });
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    fetchConfig();

    if (typeof window !== 'undefined') {
      const search = new URLSearchParams(window.location.search);
      if (search.get('demoPingError') === '1') {
        const formatted = formatAiError(
          new AppError('LLM_BAD_INPUT', 'Tham số yêu cầu gửi tới dịch vụ AI không đúng cấu trúc quy định.', {
            invalid_fields: ['generation_config.thinking_config'],
            field_paths: ['generation_config.thinking_config'],
          })
        );
        setPingResult({
          success: false,
          message: formatted.user_display,
        });
      } else if (search.get('demoPingSuccess') === '1') {
        setPingResult({
          success: true,
          message: 'Xin chào! Cổng AI Datify AI Agent đã sẵn sàng hoạt động.',
          latency_ms: 120,
          model_used: 'gemini-3.5-flash-lite',
          thinking_level: 'minimal',
          thoughts_tokens: 0,
        });
      }
    }
  }, [fetchConfig]);

  const handlePingAi = async () => {
    const now = Date.now();
    if (now - lastPingTime < 5000) {
      showToast({
        type: 'warn',
        title: 'Thao tác quá nhanh',
        message: 'Vui lòng chờ ít nhất 5 giây giữa các lần kiểm tra kết nối AI.',
      });
      return;
    }

    setPingLoading(true);
    setPingResult(null);

    try {
      const result = await pingAi();
      setLastPingTime(Date.now());
      setPingResult({
        success: true,
        message: result.message || 'Kết nối tới cổng AI thành công!',
        latency_ms: result.latency_ms,
        model_used: result.model_used,
        thinking_level: result.thinking_level,
        thoughts_tokens: result.thoughts_tokens,
      });
      showToast({
        type: 'success',
        title: 'Kết nối AI thành công',
        message: `Phản hồi sau ${result.latency_ms}ms`,
      });
    } catch (err: any) {
      setLastPingTime(Date.now());
      const formatted = formatAiError(err);
      setPingResult({
        success: false,
        message: formatted.user_display,
      });
      showToast({
        type: 'error',
        title: `Kết nối AI thất bại (${formatted.code})`,
        message: formatted.message_vi,
      });
    } finally {
      setPingLoading(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
      {/* Title Bar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h2 className="font-pixel" style={{ fontSize: '28px', color: 'var(--ink)' }}>
            CẤU HÌNH & THÔNG TIN HỆ THỐNG
          </h2>
          <p className="font-content" style={{ color: 'var(--ink-soft)', marginTop: '4px' }}>
            Thông số hoạt động, giới hạn an toàn và kiểm tra kết nối cổng AI Serverless.
          </p>
        </div>

        <PixelButton
          variant="secondary"
          icon="refresh"
          onClick={() => {
            fetchConfig();
            showToast({ type: 'info', message: 'Đã làm mới thông số cấu hình.' });
          }}
          disabled={loading}
        >
          Làm mới
        </PixelButton>
      </div>

      {loading || !config ? (
        <LoadingState message="Đang nạp thông số hệ thống..." />
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: 'var(--space-6)' }}>
          {/* AI Gateway Connection Card */}
          <PixelPanel title="CỔNG AI GOOGLE GEMINI (SERVERLESS)">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span className="font-content" style={{ fontWeight: 600 }}>Chế độ hoạt động:</span>
                <PixelBadge variant={config.ai_mode === 'ai' ? 'success' : 'warn'} size="md">
                  {config.ai_mode === 'ai' ? 'AI: Gemini Kích hoạt' : 'Chế độ dự phòng'}
                </PixelBadge>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span className="font-content" style={{ fontWeight: 600 }}>Số khóa API đã nạp:</span>
                <PixelBadge variant={config.llm_key_slots > 0 ? 'success' : 'warn'} size="sm">
                  {config.llm_key_slots} / 2 khóa đã cấu hình
                </PixelBadge>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span className="font-content" style={{ fontWeight: 600 }}>Mô hình chính:</span>
                <code style={{ padding: '2px 6px', background: 'var(--white)', border: '1px solid var(--ink)' }}>
                  {config.llm_model || 'gemini-3.5-flash-lite'}
                </code>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span className="font-content" style={{ fontWeight: 600 }}>Mô hình dự phòng:</span>
                <code style={{ padding: '2px 6px', background: 'var(--white)', border: '1px solid var(--ink)' }}>
                  {config.llm_model_fallback || 'gemini-3.8-flash'}
                </code>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span className="font-content" style={{ fontWeight: 600 }}>Cơ chế an toàn khóa:</span>
                <span style={{ fontSize: '13px', color: 'var(--good)', fontWeight: 'bold', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                  <PixelIcon name="shield-check" size={14} />
                  <span>Khóa chỉ nằm ở máy chủ Vercel</span>
                </span>
              </div>

              {/* Ping Diagnostic Section */}
              <div style={{ marginTop: 'var(--space-3)', borderTop: '2px dashed var(--ink-soft)', paddingTop: 'var(--space-3)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '13px', color: 'var(--ink-soft)' }}>
                    Kiểm tra đường truyền tới cổng AI:
                  </span>
                  <PixelButton
                    variant="primary"
                    size="sm"
                    icon="pulse"
                    onClick={handlePingAi}
                    loading={pingLoading}
                  >
                    Kiểm tra kết nối AI
                  </PixelButton>
                </div>

                {pingResult && (
                  <div
                    style={{
                      marginTop: 'var(--space-3)',
                      padding: '10px 14px',
                      backgroundColor: pingResult.success ? 'var(--white)' : 'var(--panel)',
                      border: `2px solid ${pingResult.success ? 'var(--good)' : 'var(--bad)'}`,
                      fontSize: '13px',
                    }}
                  >
                    <div style={{ fontWeight: 'bold', color: pingResult.success ? 'var(--good)' : 'var(--bad)', display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                      <PixelIcon name={pingResult.success ? 'check' : 'cross'} size={14} />
                      <span>{pingResult.success ? 'Phản hồi từ AI thành công' : 'Kết nối AI thất bại'}</span>
                      {pingResult.latency_ms !== undefined && ` (${pingResult.latency_ms} ms)`}
                    </div>
                    <div style={{ marginTop: '4px', color: 'var(--ink)', whiteSpace: 'pre-line' }}>
                      {pingResult.message}
                    </div>
                    {pingResult.model_used && (
                      <div style={{ marginTop: '6px', fontSize: '12px', color: 'var(--ink-soft)' }}>
                        Mô hình phản hồi: <strong>{pingResult.model_used}</strong>
                        {pingResult.thinking_level && (
                          <span> | Mức suy nghĩ: <strong>{pingResult.thinking_level}</strong></span>
                        )}
                        {pingResult.thoughts_tokens !== undefined && (
                          <span> ({pingResult.thoughts_tokens} tokens suy nghĩ)</span>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </PixelPanel>

          {/* Browser Compute Limits Card */}
          <PixelPanel title="GIỚI HẠN AN TOÀN TRÌNH DUYỆT (BROWSER LIMITS)">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span className="font-content" style={{ fontWeight: 600 }}>Dung lượng tệp tối đa:</span>
                <span className="font-pixel" style={{ fontSize: '18px' }}>{config.max_file_mb} MB</span>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span className="font-content" style={{ fontWeight: 600 }}>Số dòng dữ liệu tối đa:</span>
                <span className="font-pixel" style={{ fontSize: '18px' }}>{config.max_rows.toLocaleString('vi-VN')} dòng</span>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span className="font-content" style={{ fontWeight: 600 }}>Số mã cổ phiếu tối đa:</span>
                <span className="font-pixel" style={{ fontSize: '18px' }}>{config.max_symbols} mã</span>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span className="font-content" style={{ fontWeight: 600 }}>Số phiên giao dịch tối thiểu:</span>
                <span className="font-pixel" style={{ fontSize: '18px' }}>{config.min_sessions} phiên</span>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span className="font-content" style={{ fontWeight: 600 }}>Chu kỳ năm chuẩn hóa:</span>
                <span className="font-pixel" style={{ fontSize: '18px' }}>{config.trading_days} ngày</span>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span className="font-content" style={{ fontWeight: 600 }}>Chế độ nghiêm ngặt:</span>
                <PixelBadge variant={config.strict_mode ? 'success' : 'neutral'} size="sm">
                  {config.strict_mode ? 'BẬT (Khuyên dùng)' : 'TẮT'}
                </PixelBadge>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span className="font-content" style={{ fontWeight: 600 }}>Phiên bản ứng dụng:</span>
                <span className="font-pixel" style={{ fontSize: '16px', color: 'var(--ink)' }}>v1.0.0 (Bản phát hành)</span>
              </div>
            </div>
          </PixelPanel>
        </div>
      )}

      {/* AI Diagnostics 5-Task Tool (Prompt P6 Section 9.4) */}
      <AiDiagnosticsPanel />

      {/* Quick App Guide Section (Prompt P7 Section B.3) */}
      <PixelPanel title="HƯỚNG DẪN SỬ DỤNG NHANH (TÓM TẮT TỪ APP GUIDE)">
        <div style={{ padding: 'var(--space-2)' }}>
          <p style={{ fontSize: '13px', color: 'var(--ink-soft)', marginBottom: 'var(--space-3)' }}>
            Tóm lược quy chuẩn vận hành, giới hạn an toàn và các điểm dừng bắt buộc của hệ thống Datify AI Agent:
          </p>
          <div
            style={{
              padding: '12px 16px',
              backgroundColor: 'var(--panel)',
              border: '1px solid var(--chart-grid)',
              fontSize: '12px',
              lineHeight: 1.6,
              color: 'var(--ink)',
              whiteSpace: 'pre-wrap',
              maxHeight: '260px',
              overflowY: 'auto',
              fontFamily: 'monospace',
            }}
          >
            {getGuideText()}
          </div>
        </div>
      </PixelPanel>
    </div>
  );
};
