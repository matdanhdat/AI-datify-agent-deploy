import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ConfirmDialog, PixelModal } from './PixelModal';

describe('PixelModal & ConfirmDialog Components', () => {
  it('renders modal when isOpen is true and traps focus', () => {
    const handleClose = vi.fn();
    render(
      <PixelModal isOpen={true} onClose={handleClose} title="Hộp thoại kiểm thử">
        <p>Nội dung bên trong hộp thoại</p>
        <button>Nút hành động</button>
      </PixelModal>
    );

    expect(screen.getByText('Hộp thoại kiểm thử')).toBeTruthy();
    expect(screen.getByText('Nội dung bên trong hộp thoại')).toBeTruthy();
  });

  it('calls onClose when Escape key is pressed', () => {
    const handleClose = vi.fn();
    render(
      <PixelModal isOpen={true} onClose={handleClose} title="Tiêu đề Esc">
        <p>Bấm Esc để đóng</p>
      </PixelModal>
    );

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(handleClose).toHaveBeenCalledTimes(1);
  });

  it('traps keyboard focus within modal on Tab and Shift+Tab', () => {
    render(
      <PixelModal isOpen={true} onClose={() => {}} title="Bẫy Focus">
        <input data-testid="input-first" placeholder="Nhập liệu" />
        <button data-testid="btn-last">Nút cuối</button>
      </PixelModal>
    );

    // Focusable elements inside modal: Close button (✕), input-first, btn-last
    const closeBtn = screen.getByLabelText('Đóng cửa sổ');
    const firstInput = screen.getByTestId('input-first');
    expect(firstInput).toBeDefined();
    const lastBtn = screen.getByTestId('btn-last');

    // Focus last element and press Tab -> should wrap to closeBtn (first element)
    lastBtn.focus();
    expect(document.activeElement).toBe(lastBtn);

    const tabEvent = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
    document.dispatchEvent(tabEvent);
    expect(document.activeElement).toBe(closeBtn);

    // Focus first element (closeBtn) and press Shift+Tab -> should wrap to lastBtn
    closeBtn.focus();
    expect(document.activeElement).toBe(closeBtn);

    const shiftTabEvent = new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true, cancelable: true });
    document.dispatchEvent(shiftTabEvent);
    expect(document.activeElement).toBe(lastBtn);
  });

  it('ConfirmDialog triggers onConfirm and onCancel callbacks', () => {
    const handleConfirm = vi.fn();
    const handleCancel = vi.fn();

    render(
      <ConfirmDialog
        isOpen={true}
        title="Xác nhận xóa"
        message="Bạn có chắc chắn muốn xóa không?"
        confirmLabel="Đồng ý xóa"
        cancelLabel="Hủy bỏ"
        onConfirm={handleConfirm}
        onCancel={handleCancel}
        danger
      />
    );

    expect(screen.getByText('Xác nhận xóa')).toBeTruthy();
    expect(screen.getByText('Bạn có chắc chắn muốn xóa không?')).toBeTruthy();

    const confirmBtn = screen.getByText('Đồng ý xóa');
    fireEvent.click(confirmBtn);
    expect(handleConfirm).toHaveBeenCalledTimes(1);

    const cancelBtn = screen.getByText('Hủy bỏ');
    fireEvent.click(cancelBtn);
    expect(handleCancel).toHaveBeenCalledTimes(1);
  });
});
