import React from 'react';
import { useNavigate } from 'react-router-dom';
import { PixelIcon } from '../pixel/PixelIcon';
import type { Session, StepInfo } from '../../types/contract';
import { getStepPath } from '../../utils/navigation';

interface StepperBarProps {
  session: Session | null;
  onLockedStepClick: (step: StepInfo) => void;
}

export const StepperBar: React.FC<StepperBarProps> = ({
  session,
  onLockedStepClick,
}) => {
  const navigate = useNavigate();

  if (!session || !session.steps) return null;

  return (
    <nav
      aria-label="Tiến trình quy trình 5 bước"
      style={{
        backgroundColor: 'var(--panel)',
        borderBottom: '2px solid var(--ink)',
        padding: '10px var(--space-6)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '8px',
        position: 'sticky',
        top: '72px',
        zIndex: 15,
        userSelect: 'none',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          maxWidth: '900px',
          width: '100%',
          justifyContent: 'space-between',
        }}
      >
        {session.steps.map((step, idx) => {
          const isDone = step.status === 'done';
          const isCurrent = step.status === 'current';
          const isLocked = step.status === 'locked';

          const handleClick = () => {
            if (isLocked) {
              onLockedStepClick(step);
            } else {
              navigate(getStepPath(step.key));
            }
          };

          return (
            <React.Fragment key={step.key}>
              {/* Step item button */}
              <button
                onClick={handleClick}
                title={isLocked ? `Bước ${step.label_vi} đang bị khóa` : `Đến bước ${step.label_vi}`}
                className={`stepper-step ${isCurrent ? 'current-step' : ''}`}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  backgroundColor: isDone ? 'var(--good)' : (isCurrent ? 'var(--accent)' : 'var(--white)'),
                  color: isDone ? 'var(--white)' : (isCurrent ? 'var(--accent-text)' : 'var(--ink-soft)'),
                  border: '2px solid var(--ink)',
                  padding: '6px 12px',
                  cursor: isLocked ? 'not-allowed' : 'pointer',
                  opacity: isLocked ? 0.6 : 1,
                  clipPath:
                    'polygon(3px 0, calc(100% - 3px) 0, 100% 3px, 100% calc(100% - 3px), calc(100% - 3px) 100%, 3px 100%, 0 calc(100% - 3px), 0 3px)',
                  animation: isCurrent ? 'px-pulse-step 1.2s steps(2) infinite' : undefined,
                }}
              >
                {/* Step indicator box */}
                <span
                  style={{
                    width: '20px',
                    height: '20px',
                    backgroundColor: isDone ? 'rgba(0,0,0,0.2)' : 'var(--white)',
                    color: isDone ? 'var(--white)' : 'var(--ink)',
                    border: '1px solid var(--ink)',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '12px',
                    fontWeight: 'bold',
                  }}
                >
                  {isDone ? (
                    <PixelIcon name="check" size={14} color="#FFFFFF" />
                  ) : isLocked ? (
                    <PixelIcon name="lock" size={12} color="var(--ink-soft)" />
                  ) : (
                    idx + 1
                  )}
                </span>

                {/* Step Label */}
                <span className="font-pixel" style={{ fontSize: '16px' }}>
                  {step.label_vi}
                </span>
              </button>

              {/* Connecting square dots chain */}
              {idx < session.steps.length - 1 && (
                <div style={{ display: 'flex', gap: '3px', alignItems: 'center', flex: 1, justifyContent: 'center' }}>
                  <span style={{ width: '4px', height: '4px', backgroundColor: isDone ? 'var(--good)' : 'var(--ink)' }} />
                  <span style={{ width: '4px', height: '4px', backgroundColor: isDone ? 'var(--good)' : 'var(--ink)' }} />
                  <span style={{ width: '4px', height: '4px', backgroundColor: isDone ? 'var(--good)' : 'var(--ink)' }} />
                </div>
              )}
            </React.Fragment>
          );
        })}
      </div>
    </nav>
  );
};

