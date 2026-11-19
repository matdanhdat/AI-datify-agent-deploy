import React, { useEffect, useRef } from 'react';
import { PixelButton } from './PixelButton';
import { PixelIcon } from './PixelIcon';

export interface PixelModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  actions?: React.ReactNode;
  closeOnBackdrop?: boolean;
  maxWidth?: string;
}

export const PixelModal: React.FC<PixelModalProps> = ({
  isOpen,
  onClose,
  title,
  children,
  actions,
  closeOnBackdrop = true,
  maxWidth = '520px',
}) => {
  const modalRef = useRef<HTMLDivElement>(null);
  const previouslyFocusedElement = useRef<HTMLElement | null>(null);

  // Focus trap and Escape key listener
  useEffect(() => {
    if (!isOpen) return;

    previouslyFocusedElement.current = document.activeElement as HTMLElement;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
        return;
      }

      if (e.key === 'Tab' && modalRef.current) {
        const focusableElements = modalRef.current.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        if (focusableElements.length === 0) return;

        const first = focusableElements[0];
        const last = focusableElements[focusableElements.length - 1];

        if (e.shiftKey && document.activeElement === first) {
          last.focus();
          e.preventDefault();
        } else if (!e.shiftKey && document.activeElement === last) {
          first.focus();
          e.preventDefault();
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);

    // Initial focus on first element or modal container
    setTimeout(() => {
      if (modalRef.current) {
        const focusable = modalRef.current.querySelector<HTMLElement>('button, [href], input');
        if (focusable) {
          focusable.focus();
        } else {
          modalRef.current.focus();
        }
      }
    }, 50);

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      if (previouslyFocusedElement.current) {
        previouslyFocusedElement.current.focus();
      }
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="pixel-modal-title"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 'var(--z-modal, 10000)' as any,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(20, 33, 77, 0.65)',
        padding: 'var(--space-4)',
      }}
      onClick={(e) => {
        if (closeOnBackdrop && e.target === e.currentTarget) {
          onClose();
        }
      }}
    >
      <div
        ref={modalRef}
        tabIndex={-1}
        className="px-shadow-lg"
        style={{
          width: '100%',
          maxWidth,
          backgroundColor: 'var(--ink)',
          padding: '3px',
          outline: 'none',
          clipPath:
            'polygon(4px 0, calc(100% - 4px) 0, 100% 4px, 100% calc(100% - 4px), calc(100% - 4px) 100%, 4px 100%, 0 calc(100% - 4px), 0 4px)',
        }}
      >
        <div
          className="px-inner"
          style={{
            backgroundColor: 'var(--panel)',
            padding: 0,
            overflow: 'hidden',
          }}
        >
          {/* Header */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              backgroundColor: 'var(--ink)',
              color: 'var(--white)',
              padding: '8px 14px',
            }}
          >
            <h3 id="pixel-modal-title" className="font-pixel" style={{ fontSize: '20px', margin: 0 }}>
              {title}
            </h3>
            <button
              onClick={onClose}
              aria-label="Đóng cửa sổ"
              className="font-pixel"
              style={{
                background: 'var(--bad)',
                color: 'var(--white)',
                border: '1px solid var(--white)',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '4px 6px',
                cursor: 'pointer',
              }}
            >
              <PixelIcon name="cross" size={12} />
            </button>
          </div>

          {/* Body Content */}
          <div style={{ padding: 'var(--space-6)', maxHeight: '75vh', overflowY: 'auto' }}>
            {children}
          </div>

          {/* Footer Actions */}
          {actions && (
            <div
              style={{
                display: 'flex',
                justifyContent: 'flex-end',
                gap: 'var(--space-3)',
                padding: 'var(--space-3) var(--space-6)',
                backgroundColor: 'rgba(20, 33, 77, 0.04)',
                borderTop: '2px solid var(--ink)',
              }}
            >
              {actions}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export interface ConfirmDialogProps {
  isOpen: boolean;
  title?: string;
  message: string;
  confirmLabel?: string;
  confirmText?: string;
  cancelLabel?: string;
  cancelText?: string;
  onConfirm: () => void;
  onCancel: () => void;
  loading?: boolean;
  danger?: boolean;
}

export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  isOpen,
  title = 'Xác nhận hành động',
  message,
  confirmLabel,
  confirmText,
  cancelLabel,
  cancelText,
  onConfirm,
  onCancel,
  loading = false,
  danger = true,
}) => {
  const resolvedConfirm = confirmLabel || confirmText || 'Xác nhận';
  const resolvedCancel = cancelLabel || cancelText || 'Hủy bỏ';

  return (
    <PixelModal
      isOpen={isOpen}
      onClose={onCancel}
      title={title}
      actions={
        <>
          <PixelButton variant="secondary" onClick={onCancel} disabled={loading}>
            {resolvedCancel}
          </PixelButton>
          <PixelButton
            variant={danger ? 'danger' : 'primary'}
            onClick={onConfirm}
            loading={loading}
            icon={danger ? 'warning' : 'check'}
          >
            {resolvedConfirm}
          </PixelButton>
        </>
      }
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 'var(--space-4)' }}>
        <PixelIcon name={danger ? 'warning' : 'info'} size={32} />
        <div className="font-content" style={{ fontSize: '14px', lineHeight: 1.6, color: 'var(--ink)' }}>
          {message}
        </div>
      </div>
    </PixelModal>
  );
};

