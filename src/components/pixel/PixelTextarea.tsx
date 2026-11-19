import React from 'react';

export interface PixelTextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  hint?: string;
  error?: string;
}

export const PixelTextarea = React.forwardRef<HTMLTextAreaElement, PixelTextareaProps>(
  ({ label, hint, error, id, disabled, rows = 3, className = '', style = {}, ...rest }, ref) => {
    const inputId = id || (label ? `px-txt-${label.toLowerCase().replace(/\s+/g, '-')}` : undefined);

    return (
      <div className={`px-input-group ${className}`} style={{ marginBottom: 'var(--space-3)', ...style }}>
        {label && (
          <label
            htmlFor={inputId}
            className="font-content"
            style={{
              display: 'block',
              fontSize: '13px',
              fontWeight: 600,
              color: 'var(--ink)',
              marginBottom: '4px',
            }}
          >
            {label}
          </label>
        )}
        <div className={`px-outer-sm ${disabled ? 'px-dither' : ''}`}>
          <textarea
            {...rest}
            ref={ref}
            id={inputId}
            rows={rows}
            disabled={disabled}
            className="font-content"
            style={{
              width: '100%',
              padding: '8px 10px',
              backgroundColor: disabled ? 'var(--panel)' : 'var(--white)',
              color: 'var(--ink)',
              border: error ? '2px solid var(--bad)' : 'none',
              outline: 'none',
              fontSize: '14px',
              resize: 'vertical',
              clipPath: 'polygon(2px 0, calc(100% - 2px) 0, 100% 2px, 100% calc(100% - 2px), calc(100% - 2px) 100%, 2px 100%, 0 calc(100% - 2px), 0 2px)',
            }}
          />
        </div>
        {error && (
          <div style={{ color: 'var(--bad)', fontSize: '12px', marginTop: '2px', fontWeight: 600 }}>
            {error}
          </div>
        )}
        {hint && !error && (
          <div style={{ color: 'var(--ink-soft)', fontSize: '12px', marginTop: '2px' }}>
            {hint}
          </div>
        )}
      </div>
    );
  }
);

PixelTextarea.displayName = 'PixelTextarea';

