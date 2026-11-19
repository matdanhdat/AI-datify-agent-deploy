import React from 'react';

export interface PixelProgressProps {
  value?: number; // 0 to 100, if omitted -> indeterminate mode
  totalBlocks?: number; // default 15
  color?: string; // default --good or --accent
  className?: string;
  style?: React.CSSProperties;
}

export const PixelProgress: React.FC<PixelProgressProps> = ({
  value,
  totalBlocks = 15,
  color = 'var(--accent)',
  className = '',
  style = {},
}) => {
  const isIndeterminate = value === undefined;
  const filledCount = isIndeterminate ? 0 : Math.round(((value || 0) / 100) * totalBlocks);

  return (
    <div
      className={`pixel-progress ${className}`}
      role="progressbar"
      aria-valuenow={value}
      aria-valuemin={0}
      aria-valuemax={100}
      style={{
        display: 'flex',
        gap: '4px',
        padding: '3px',
        backgroundColor: 'var(--panel)',
        border: '2px solid var(--ink)',
        ...style,
      }}
    >
      {Array.from({ length: totalBlocks }).map((_, i) => {
        const isFilled = !isIndeterminate && i < filledCount;
        return (
          <div
            key={i}
            style={{
              flex: 1,
              height: '14px',
              backgroundColor: isFilled ? color : 'var(--white)',
              border: '1px solid var(--ink-soft)',
              animation: isIndeterminate
                ? `px-pulse-step 1s steps(2) infinite ${(i * 0.08).toFixed(2)}s`
                : undefined,
            }}
          />
        );
      })}
    </div>
  );
};

export interface TabItem {
  id: string;
  label: string;
  icon?: React.ReactNode;
}

export interface PixelTabsProps {
  tabs: TabItem[];
  activeTab: string;
  onChange: (tabId: string) => void;
  className?: string;
  style?: React.CSSProperties;
}

export const PixelTabs: React.FC<PixelTabsProps> = ({
  tabs,
  activeTab,
  onChange,
  className = '',
  style = {},
}) => {
  return (
    <div
      className={`pixel-tabs ${className}`}
      role="tablist"
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: '4px',
        borderBottom: '2px solid var(--ink)',
        marginBottom: 'var(--space-4)',
        ...style,
      }}
    >
      {tabs.map((tab, idx) => {
        const isActive = tab.id === activeTab;
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={isActive}
            onClick={() => onChange(tab.id)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowRight') {
                e.preventDefault();
                const next = tabs[(idx + 1) % tabs.length];
                onChange(next.id);
              } else if (e.key === 'ArrowLeft') {
                e.preventDefault();
                const prev = tabs[(idx - 1 + tabs.length) % tabs.length];
                onChange(prev.id);
              }
            }}
            className="font-pixel"
            style={{
              padding: '6px 16px',
              fontSize: '18px',
              fontWeight: 400,
              backgroundColor: isActive ? 'var(--ink)' : 'var(--panel)',
              color: isActive ? 'var(--white)' : 'var(--ink)',
              border: '2px solid var(--ink)',
              borderBottom: 'none',
              cursor: 'pointer',
              marginBottom: '-2px',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              clipPath:
                'polygon(3px 0, calc(100% - 3px) 0, 100% 3px, 100% 100%, 0 100%, 0 3px)',
            }}
          >
            {tab.icon}
            <span>{tab.label}</span>
          </button>
        );
      })}
    </div>
  );
};

