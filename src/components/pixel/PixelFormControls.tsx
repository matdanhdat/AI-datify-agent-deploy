import React from 'react';
import { PixelIcon } from './PixelIcon';

export interface PixelSwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label?: string;
  disabled?: boolean;
}

export const PixelSwitch: React.FC<PixelSwitchProps> = ({
  checked,
  onChange,
  label,
  disabled = false,
}) => {
  return (
    <label
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '8px',
        cursor: disabled ? 'not-allowed' : 'pointer',
        userSelect: 'none',
      }}
    >
      <div
        onClick={() => !disabled && onChange(!checked)}
        className={`px-shadow-sm ${disabled ? 'px-dither' : ''}`}
        style={{
          width: '38px',
          height: '22px',
          backgroundColor: checked ? 'var(--good)' : 'var(--panel)',
          border: '2px solid var(--ink)',
          position: 'relative',
          padding: '2px',
        }}
      >
        <div
          style={{
            width: '14px',
            height: '14px',
            backgroundColor: checked ? 'var(--white)' : 'var(--ink)',
            transform: checked ? 'translateX(16px)' : 'translateX(0)',
            transition: 'none',
          }}
        />
      </div>
      {label && <span className="font-content" style={{ fontSize: '13px', fontWeight: 500 }}>{label}</span>}
    </label>
  );
};

export interface PixelCheckboxProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label?: string;
  disabled?: boolean;
}

export const PixelCheckbox: React.FC<PixelCheckboxProps> = ({
  checked,
  onChange,
  label,
  disabled = false,
}) => {
  return (
    <label
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '8px',
        cursor: disabled ? 'not-allowed' : 'pointer',
        userSelect: 'none',
      }}
    >
      <div
        onClick={() => !disabled && onChange(!checked)}
        className={`px-shadow-sm ${disabled ? 'px-dither' : ''}`}
        style={{
          width: '20px',
          height: '20px',
          backgroundColor: checked ? 'var(--blue)' : 'var(--white)',
          border: '2px solid var(--ink)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {checked && <PixelIcon name="check" size={14} color="#FFFFFF" />}
      </div>
      {label && <span className="font-content" style={{ fontSize: '13px', fontWeight: 500 }}>{label}</span>}
    </label>
  );
};

export interface PixelRadioProps {
  checked: boolean;
  onChange: () => void;
  label?: string;
  disabled?: boolean;
}

export const PixelRadio: React.FC<PixelRadioProps> = ({
  checked,
  onChange,
  label,
  disabled = false,
}) => {
  return (
    <label
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '8px',
        cursor: disabled ? 'not-allowed' : 'pointer',
        userSelect: 'none',
      }}
    >
      <div
        onClick={() => !disabled && onChange()}
        className={`px-shadow-sm ${disabled ? 'px-dither' : ''}`}
        style={{
          width: '20px',
          height: '20px',
          backgroundColor: 'var(--white)',
          border: '2px solid var(--ink)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {checked && (
          <div
            style={{
              width: '8px',
              height: '8px',
              backgroundColor: 'var(--accent)',
            }}
          />
        )}
      </div>
      {label && <span className="font-content" style={{ fontSize: '13px', fontWeight: 500 }}>{label}</span>}
    </label>
  );
};

