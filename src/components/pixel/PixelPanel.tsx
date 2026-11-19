import React from 'react';

export type PanelVariant = 'default' | 'raised' | 'inset' | 'warning' | 'danger' | 'success';

export interface PixelPanelProps {
  variant?: PanelVariant;
  title?: string;
  headerAction?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
  borderColor?: string;
}

export const PixelPanel: React.FC<PixelPanelProps> = ({
  variant = 'default',
  title,
  headerAction,
  children,
  className = '',
  style = {},
  borderColor,
}) => {
  // Shadow class
  const shadowClass =
    variant === 'raised'
      ? 'px-shadow-lg'
      : variant === 'inset'
      ? 'px-shadow-none'
      : 'px-shadow';

  // Inner background style depending on variant
  const getInnerBg = () => {
    switch (variant) {
      case 'inset':
        return 'var(--white)';
      case 'warning':
        return '#FFF8E7';
      case 'danger':
        return '#FDF0ED';
      case 'success':
        return '#EDF9F1';
      default:
        return 'var(--panel)';
    }
  };

  return (
    <div className={`px-panel-wrapper ${shadowClass} ${className}`} style={{ marginBottom: 'var(--space-6)', ...style }}>
      <div className="px-outer" style={{ borderColor: borderColor || (variant === 'danger' ? 'var(--bad)' : 'var(--ink)') }}>
        <div
          className="px-inner"
          style={{
            backgroundColor: getInnerBg(),
            border: variant === 'inset' ? '2px dashed var(--ink-soft)' : undefined,
          }}
        >
          {title && (
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: 'var(--space-2) var(--space-4)',
                backgroundColor: 'var(--ink)',
                color: 'var(--white)',
                borderBottom: '2px solid var(--ink)',
              }}
            >
              <h3 className="font-pixel" style={{ fontSize: '18px', fontWeight: 'normal', margin: 0 }}>
                {title}
              </h3>
              {headerAction && <div>{headerAction}</div>}
            </div>
          )}
          <div style={{ padding: 'var(--space-4)' }}>
            {children}
          </div>
        </div>
      </div>
    </div>
  );
};

