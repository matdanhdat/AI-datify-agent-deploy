import React from 'react';
import { PixelBadge } from './PixelBadge';
import { PixelTooltip } from './PixelTooltip';
import { useAiStatus } from '../../services/aiClient';

export const AiStatusBadge: React.FC = () => {
  const { ai_mode, slots, model } = useAiStatus();

  const isAi = ai_mode === 'ai';

  const label = isAi
    ? `AI: Gemini (${slots} khóa)`
    : 'Chế độ dự phòng';

  const tooltipText = isAi
    ? `Kết nối AI trực tiếp với mô hình ${model}. Nhận định thị trường do AI phân tích.`
    : 'Ứng dụng vẫn hoạt động đầy đủ. Phần nhận định sẽ được tạo bằng mẫu câu định sẵn thay vì AI.';

  return (
    <PixelTooltip content={tooltipText} position="bottom">
      <div style={{ cursor: 'help', display: 'inline-flex' }}>
        <PixelBadge
          variant={isAi ? 'success' : 'warn'}
          icon={isAi ? 'robot-head' : 'shield-check'}
          size="md"
        >
          {label}
        </PixelBadge>
      </div>
    </PixelTooltip>
  );
};

