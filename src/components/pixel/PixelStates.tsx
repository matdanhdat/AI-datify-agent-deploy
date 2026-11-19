import React from 'react';
import { PixelButton } from './PixelButton';
import { PixelProgress } from './PixelProgressAndTabs';
import { PixelSprite } from './PixelSprite';

export interface EmptyStateProps {
  title?: string;
  message: string;
  actionLabel?: string;
  onAction?: () => void;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  title = 'Không có dữ liệu',
  message,
  actionLabel,
  onAction,
}) => {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 'var(--space-8)',
        textAlign: 'center',
        backgroundColor: 'var(--panel)',
        border: '2px dashed var(--ink-soft)',
      }}
    >
      <PixelSprite mood="search" size={64} />
      <h3 className="font-pixel" style={{ fontSize: '22px', marginTop: 'var(--space-3)', color: 'var(--ink)' }}>
        {title}
      </h3>
      <p className="font-content" style={{ color: 'var(--ink-soft)', maxWidth: '400px', marginTop: 'var(--space-2)' }}>
        {message}
      </p>
      {actionLabel && onAction && (
        <PixelButton variant="primary" onClick={onAction} style={{ marginTop: 'var(--space-4)' }}>
          {actionLabel}
        </PixelButton>
      )}
    </div>
  );
};

export interface LoadingStateProps {
  message?: string;
}

export const LoadingState: React.FC<LoadingStateProps> = ({
  message = 'Đang tải dữ liệu...',
}) => {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 'var(--space-8)',
        textAlign: 'center',
      }}
    >
      <PixelSprite mood="working" size={72} />
      <div style={{ width: '220px', marginTop: 'var(--space-4)' }}>
        <PixelProgress />
      </div>
      <p className="font-pixel" style={{ fontSize: '18px', color: 'var(--ink)', marginTop: 'var(--space-3)' }}>
        {message}
      </p>
    </div>
  );
};

export interface ErrorStateProps {
  title?: string;
  message: string;
  retryLabel?: string;
  onRetry?: () => void;
}

export const ErrorState: React.FC<ErrorStateProps> = ({
  title = 'Đã xảy ra sự cố',
  message,
  retryLabel = 'Thử lại',
  onRetry,
}) => {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 'var(--space-8)',
        textAlign: 'center',
        backgroundColor: '#FDF0ED',
        border: '2px solid var(--bad)',
      }}
    >
      <PixelSprite mood="error" size={64} />
      <h3 className="font-pixel" style={{ fontSize: '22px', marginTop: 'var(--space-3)', color: 'var(--bad)' }}>
        {title}
      </h3>
      <p className="font-content" style={{ color: 'var(--ink)', maxWidth: '460px', marginTop: 'var(--space-2)' }}>
        {message}
      </p>
      {onRetry && (
        <PixelButton variant="danger" onClick={onRetry} icon="refresh" style={{ marginTop: 'var(--space-4)' }}>
          {retryLabel}
        </PixelButton>
      )}
    </div>
  );
};

export interface SuccessStateProps {
  title?: string;
  message: string;
  actionLabel?: string;
  onAction?: () => void;
}

export const SuccessState: React.FC<SuccessStateProps> = ({
  title = 'Thành công',
  message,
  actionLabel,
  onAction,
}) => {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 'var(--space-8)',
        textAlign: 'center',
        backgroundColor: '#EDF9F1',
        border: '2px solid var(--good)',
      }}
    >
      <PixelSprite mood="success" size={64} />
      <h3 className="font-pixel" style={{ fontSize: '22px', marginTop: 'var(--space-3)', color: 'var(--good)' }}>
        {title}
      </h3>
      <p className="font-content" style={{ color: 'var(--ink)', maxWidth: '400px', marginTop: 'var(--space-2)' }}>
        {message}
      </p>
      {actionLabel && onAction && (
        <PixelButton variant="primary" onClick={onAction} style={{ marginTop: 'var(--space-4)' }}>
          {actionLabel}
        </PixelButton>
      )}
    </div>
  );
};

export interface UnderConstructionProps {
  title: string;
  stepName: string;
  description: string;
}

export const UnderConstruction: React.FC<UnderConstructionProps> = ({
  title,
  stepName,
  description,
}) => {
  return (
    <div
      className="px-shadow"
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        textAlign: 'center',
        padding: 'var(--space-8)',
        backgroundColor: 'var(--panel)',
        border: '2px solid var(--ink)',
        clipPath: 'polygon(4px 0, calc(100% - 4px) 0, 100% 4px, 100% calc(100% - 4px), calc(100% - 4px) 100%, 4px 100%, 0 calc(100% - 4px), 0 4px)',
      }}
    >
      <PixelSprite mood="working" size={80} />
      <h2 className="font-pixel" style={{ fontSize: '26px', marginTop: 'var(--space-3)', color: 'var(--ink)' }}>
        {title}
      </h2>
      <div
        className="font-pixel"
        style={{
          fontSize: '18px',
          color: 'var(--accent-d)',
          backgroundColor: 'var(--white)',
          padding: '4px 12px',
          border: '1px solid var(--ink)',
          marginTop: 'var(--space-2)',
        }}
      >
        Phần này sẽ được xây ở bước tiếp theo ({stepName})
      </div>
      <p
        className="font-content"
        style={{
          color: 'var(--ink-soft)',
          maxWidth: '560px',
          marginTop: 'var(--space-3)',
          fontSize: '14px',
          lineHeight: 1.6,
        }}
      >
        {description}
      </p>
    </div>
  );
};

