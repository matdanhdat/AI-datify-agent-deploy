import React, { Component, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PixelButton } from '../pixel/PixelButton';
import { PixelIcon } from '../pixel/PixelIcon';
import { PixelSprite } from '../pixel/PixelSprite';
import { useToast } from '../pixel/PixelToast';
import { apiGet } from '../../api/client';

export const OfflineBanner: React.FC = () => {
  const [isOffline, setIsOffline] = useState(() => typeof window !== 'undefined' && window.location.search.includes('offline=1'));
  const [checking, setChecking] = useState(false);
  const { showToast } = useToast();

  const checkConnection = async () => {
    setChecking(true);
    try {
      await apiGet('/api/health');
      if (isOffline) {
        setIsOffline(false);
        showToast({
          type: 'success',
          title: 'Đã kết nối lại',
          message: 'Kết nối tới máy chủ đã được khôi phục thành công!',
        });
      }
    } catch (_err) {
      setIsOffline(true);
    } finally {
      setChecking(false);
    }
  };

  useEffect(() => {
    // Initial probe
    checkConnection();

    // Auto-probe every 5 seconds if offline, or every 20 seconds normally
    const interval = setInterval(() => {
      checkConnection();
    }, isOffline ? 5000 : 20000);

    return () => clearInterval(interval);
  }, [isOffline]);

  if (!isOffline) return null;

  return (
    <div
      role="alert"
      style={{
        position: 'sticky',
        top: 0,
        zIndex: 9999,
        backgroundColor: 'var(--bad)',
        color: 'var(--white)',
        borderBottom: '3px solid var(--ink)',
        padding: '8px 16px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '12px',
      }}
    >
      <PixelIcon name="warning" size={18} color="#FFFFFF" />
      <span className="font-pixel" style={{ fontSize: '18px' }}>
        MẤT KẾT NỐI MÁY CHỦ! Vui lòng kiểm tra backend hoặc kết nối mạng.
      </span>
      <PixelButton
        variant="secondary"
        size="sm"
        loading={checking}
        onClick={() => checkConnection()}
      >
        Thử lại
      </PixelButton>
    </div>
  );
};

interface ErrorBoundaryProps {
  children: React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error?: Error;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('ErrorBoundary caught error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div
          style={{
            minHeight: '100vh',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: 'var(--bg)',
            padding: 'var(--space-6)',
          }}
        >
          <div
            className="px-shadow-lg"
            style={{
              maxWidth: '500px',
              width: '100%',
              backgroundColor: 'var(--panel)',
              border: '3px solid var(--ink)',
              padding: 'var(--space-8)',
              textAlign: 'center',
            }}
          >
            <PixelSprite mood="error" size={80} />
            <h1 className="font-pixel" style={{ fontSize: '28px', color: 'var(--bad)', marginTop: 'var(--space-3)' }}>
              ĐÃ XẢY RA LỖI GIAO DIỆN!
            </h1>
            <p className="font-content" style={{ color: 'var(--ink)', marginTop: 'var(--space-2)', fontSize: '14px' }}>
              Một sự cố hiển thị không lường trước đã xảy ra. Ứng dụng đã ngăn chặn màn hình trắng.
            </p>
            {this.state.error?.message && (
              <div
                style={{
                  marginTop: 'var(--space-4)',
                  padding: '8px 12px',
                  backgroundColor: 'var(--white)',
                  border: '1px solid var(--bad)',
                  fontSize: '12px',
                  fontFamily: 'monospace',
                  color: 'var(--bad)',
                  wordBreak: 'break-all',
                  textAlign: 'left',
                }}
              >
                {this.state.error.message}
              </div>
            )}
            <div style={{ marginTop: 'var(--space-6)', display: 'flex', justifyContent: 'center', gap: 'var(--space-2)' }}>
              <PixelButton
                variant="primary"
                onClick={() => {
                  try {
                    window.sessionStorage.clear();
                  } catch {}
                  window.location.href = window.location.origin + '/?refresh=' + Date.now();
                }}
                icon="refresh"
              >
                Tải lại ứng dụng
              </PixelButton>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export const NotFoundPage: React.FC = () => {
  const navigate = useNavigate();

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '60px 20px',
        textAlign: 'center',
      }}
    >
      <PixelSprite mood="search" size={96} />
      <h1 className="font-pixel" style={{ fontSize: '38px', color: 'var(--ink)', marginTop: '16px' }}>
        404 - KHÔNG TÌM THẤY TRANG
      </h1>
      <p className="font-content" style={{ color: 'var(--ink-soft)', maxWidth: '420px', marginTop: '8px' }}>
        Địa chỉ trang web bạn yêu cầu không tồn tại hoặc đã được chuyển sang địa chỉ khác trong lộ trình.
      </p>
      <PixelButton variant="primary" onClick={() => navigate('/')} icon="home" style={{ marginTop: '20px' }}>
        Về trang chủ
      </PixelButton>
    </div>
  );
};
