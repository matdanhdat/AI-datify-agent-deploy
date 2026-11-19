import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { PixelButton } from './PixelButton';

describe('PixelButton Component', () => {
  it('triggers onClick when clicked normally', () => {
    const handleClick = vi.fn();
    render(<PixelButton onClick={handleClick}>Bấm vào đây</PixelButton>);

    const btn = screen.getByText('Bấm vào đây');
    fireEvent.click(btn);
    expect(handleClick).toHaveBeenCalledTimes(1);
  });

  it('blocks click events when disabled is true', () => {
    const handleClick = vi.fn();
    render(
      <PixelButton onClick={handleClick} disabled>
        Bị vô hiệu hóa
      </PixelButton>
    );

    const btn = screen.getByText('Bị vô hiệu hóa');
    fireEvent.click(btn);
    expect(handleClick).not.toHaveBeenCalled();
  });

  it('blocks click events and displays running blocks when loading is true', () => {
    const handleClick = vi.fn();
    render(
      <PixelButton onClick={handleClick} loading>
        Đang xử lý
      </PixelButton>
    );

    const btn = screen.getByRole('button');
    fireEvent.click(btn);
    expect(handleClick).not.toHaveBeenCalled();
  });
});
