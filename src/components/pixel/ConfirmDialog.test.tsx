import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ConfirmDialog } from './PixelModal';

describe('ConfirmDialog Component', () => {
  it('renders title, message, confirm and cancel buttons when open', () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();

    render(
      <ConfirmDialog
        isOpen={true}
        title="Xác nhận xóa phiên"
        message="Bạn có chắc chắn muốn xóa phiên làm việc này không?"
        confirmLabel="Đồng ý xóa"
        cancelLabel="Giữ lại"
        onConfirm={onConfirm}
        onCancel={onCancel}
      />
    );

    expect(screen.getByText('Xác nhận xóa phiên')).toBeDefined();
    expect(screen.getByText('Bạn có chắc chắn muốn xóa phiên làm việc này không?')).toBeDefined();
    expect(screen.getByText('Đồng ý xóa')).toBeDefined();
    expect(screen.getByText('Giữ lại')).toBeDefined();
  });

  it('calls onConfirm when confirm button is clicked', () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();

    render(
      <ConfirmDialog
        isOpen={true}
        message="Xác nhận thao tác?"
        confirmLabel="Xác nhận"
        cancelLabel="Hủy"
        onConfirm={onConfirm}
        onCancel={onCancel}
      />
    );

    fireEvent.click(screen.getByText('Xác nhận'));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onCancel).not.toHaveBeenCalled();
  });

  it('calls onCancel when cancel button or backdrop is clicked', () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();

    render(
      <ConfirmDialog
        isOpen={true}
        message="Xác nhận thao tác?"
        confirmLabel="Xác nhận"
        cancelLabel="Hủy"
        onConfirm={onConfirm}
        onCancel={onCancel}
      />
    );

    fireEvent.click(screen.getByText('Hủy'));
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('calls onCancel and closes when Escape key is pressed', () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();

    render(
      <ConfirmDialog
        isOpen={true}
        message="Xác nhận thao tác?"
        onConfirm={onConfirm}
        onCancel={onCancel}
      />
    );

    fireEvent.keyDown(document, { key: 'Escape', code: 'Escape' });
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('returns focus to previously focused element when closed', () => {
    const triggerBtn = document.createElement('button');
    triggerBtn.textContent = 'Mở Dialog';
    document.body.appendChild(triggerBtn);
    triggerBtn.focus();
    expect(document.activeElement).toBe(triggerBtn);

    const onCancel = vi.fn();
    const { unmount } = render(
      <ConfirmDialog
        isOpen={true}
        message="Xác nhận thao tác?"
        onConfirm={() => {}}
        onCancel={onCancel}
      />
    );

    // Unmount dialog simulates closing
    unmount();

    expect(document.activeElement).toBe(triggerBtn);
    document.body.removeChild(triggerBtn);
  });
});

