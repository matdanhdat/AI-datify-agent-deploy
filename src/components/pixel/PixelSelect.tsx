import React from 'react';

export interface SelectOption {
  value: string;
  label: string;
}

export interface PixelSelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  hint?: string;
  error?: string;
  options: SelectOption[];
}

export const PixelSelect = React.forwardRef<HTMLSelectElement, PixelSelectProps>(
  ({ label, hint, error, id, options, disabled, className = '', style = {}, ...rest }, ref) => {
    const selectId = id || (label ? `px-sel-${label.toLowerCase().replace(/\s+/g, '-')}` : undefined);

    return (
      <div className={`px-select-group ${className}`} style={{ marginBottom: 'var(--space-3)', ...style }}>
        {label && (
          <label
            htmlFor={selectId}
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
          <select
            {...rest}
            ref={ref}
            id={selectId}
            disabled={disabled}
            className="font-content"
            style={{
              width: '100%',
              padding: '6px 10px',
              backgroundColor: disabled ? 'var(--panel)' : 'var(--white)',
              color: 'var(--ink)',
              border: error ? '2px solid var(--bad)' : 'none',
              outline: 'none',
              fontSize: '14px',
              cursor: disabled ? 'not-allowed' : 'pointer',
              clipPath: 'polygon(2px 0, calc(100% - 2px) 0, 100% 2px, 100% calc(100% - 2px), calc(100% - 2px) 100%, 2px 100%, 0 calc(100% - 2px), 0 2px)',
            }}
          >
            {options.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
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

PixelSelect.displayName = 'PixelSelect';

