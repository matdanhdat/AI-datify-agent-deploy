import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AiStatusBadge } from './AiStatusBadge';
import * as aiClient from '../../services/aiClient';

describe('AiStatusBadge Component', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('renders green badge when AI mode is active', () => {
    vi.spyOn(aiClient, 'useAiStatus').mockReturnValue({
      ai_mode: 'ai',
      slots: 2,
      model: 'gemini-3.5-flash-lite',
      model_fallback: 'gemini-3.8-flash',
      loading: false,
      refresh: vi.fn(),
    });

    render(<AiStatusBadge />);
    expect(screen.getByText('AI: Gemini (2 khóa)')).toBeTruthy();
  });

  it('renders orange badge when in fallback mode', () => {
    vi.spyOn(aiClient, 'useAiStatus').mockReturnValue({
      ai_mode: 'fallback',
      slots: 0,
      model: 'gemini-3.5-flash-lite',
      model_fallback: null,
      loading: false,
      refresh: vi.fn(),
    });

    render(<AiStatusBadge />);
    expect(screen.getByText('Chế độ dự phòng')).toBeTruthy();
  });
});
