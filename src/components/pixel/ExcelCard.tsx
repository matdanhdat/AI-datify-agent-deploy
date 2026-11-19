import React from 'react';
import { PixelIcon } from './PixelIcon';

export interface ExcelCardProps {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  onViewTable?: () => void;
  onDownloadPng?: () => void;
  className?: string;
  style?: React.CSSProperties;
}

export const ExcelCard: React.FC<ExcelCardProps> = ({
  title,
  subtitle,
  children,
  onViewTable,
  onDownloadPng,
  className = '',
  style = {},
}) => {
  return (
    <div
      className={`excel-card-wrapper ${className}`}
      style={{
        backgroundColor: 'var(--ink)',
        padding: '2px',
        clipPath:
          'polygon(2px 0, calc(100% - 2px) 0, 100% 2px, 100% calc(100% - 2px), calc(100% - 2px) 100%, 2px 100%, 0 calc(100% - 2px), 0 2px)',
        marginBottom: 'var(--space-6)',
        ...style,
      }}
    >
      <div
        className="font-excel"
        style={{
          backgroundColor: 'var(--chart-bg)',
          border: '1px solid var(--chart-grid)',
          color: 'var(--chart-text)',
          padding: '12px 16px',
        }}
      >
        {/* Excel Header Bar */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            borderBottom: '1px solid var(--chart-grid)',
            paddingBottom: '8px',
            marginBottom: '12px',
          }}
        >
          <div>
            <h4
              style={{
                fontFamily: 'Calibri, Arial, sans-serif',
                fontSize: '16px',
                fontWeight: 'bold',
                color: 'var(--ink)',
                margin: 0,
              }}
            >
              {title}
            </h4>
            {subtitle && (
              <span style={{ fontSize: '12px', color: 'var(--chart-text)' }}>
                {subtitle}
              </span>
            )}
          </div>

          {/* Action buttons (View Table, Download PNG) */}
          <div style={{ display: 'flex', gap: '6px' }}>
            {onViewTable && (
              <button
                onClick={onViewTable}
                title="Xem bảng số liệu thô"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px',
                  padding: '2px 8px',
                  fontSize: '12px',
                  border: '1px solid var(--chart-grid)',
                  backgroundColor: 'var(--panel)',
                  color: 'var(--ink)',
                  cursor: 'pointer',
                  borderRadius: 0,
                }}
              >
                <PixelIcon name="file" size={12} />
                <span>Bảng số liệu</span>
              </button>
            )}
            {onDownloadPng && (
              <button
                onClick={onDownloadPng}
                title="Tải ảnh PNG"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px',
                  padding: '2px 8px',
                  fontSize: '12px',
                  border: '1px solid var(--chart-grid)',
                  backgroundColor: 'var(--panel)',
                  color: 'var(--ink)',
                  cursor: 'pointer',
                  borderRadius: 0,
                }}
              >
                <PixelIcon name="download" size={12} />
                <span>Tải ảnh</span>
              </button>
            )}
          </div>
        </div>

        {/* Excel Content Body */}
        <div style={{ minHeight: '120px' }}>
          {children}
        </div>
      </div>
    </div>
  );
};

