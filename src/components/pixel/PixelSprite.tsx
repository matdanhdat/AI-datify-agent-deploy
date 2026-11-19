import React, { useEffect, useState } from 'react';

export type MascotMood = 'idle' | 'thinking' | 'working' | 'success' | 'error' | 'search';

export interface PixelSpriteProps {
  mood?: MascotMood;
  size?: number; // default 64 (2x of 32x32 native)
  className?: string;
  style?: React.CSSProperties;
}

export const PixelSprite: React.FC<PixelSpriteProps> = ({
  mood = 'idle',
  size = 64,
  className = '',
  style = {},
}) => {
  const [frame, setFrame] = useState(0);

  // Cycle animation frames based on mood
  useEffect(() => {
    let maxFrames = 2;
    let intervalMs = 600;

    if (mood === 'thinking') {
      maxFrames = 3;
      intervalMs = 450;
    } else if (mood === 'working') {
      maxFrames = 4;
      intervalMs = 250;
    } else if (mood === 'error') {
      maxFrames = 3;
      intervalMs = 300;
    } else if (mood === 'idle') {
      maxFrames = 3; // eye blink occasionally
      intervalMs = 1200;
    } else if (mood === 'search') {
      maxFrames = 2;
      intervalMs = 500;
    } else if (mood === 'success') {
      maxFrames = 2;
      intervalMs = 400;
    }

    const timer = setInterval(() => {
      setFrame((prev) => (prev + 1) % maxFrames);
    }, intervalMs);

    return () => clearInterval(timer);
  }, [mood]);

  // Color tokens
  const INK = 'var(--ink)';
  const ACCENT = 'var(--accent)';
  const BLUE = 'var(--blue)';
  const WHITE = '#FFFFFF';
  const GOOD = 'var(--good)';
  const BAD = 'var(--bad)';
  const WARN = 'var(--warn)';

  // Calculate dynamic parts depending on mood and current frame
  const isJumping = mood === 'success' && frame === 1;
  const isBlinking = mood === 'idle' && frame === 1;
  const headShiftX = mood === 'error' ? (frame === 1 ? -1 : frame === 2 ? 1 : 0) : 0;
  const yOffset = isJumping ? -2 : 0;

  return (
    <svg
      viewBox="0 0 32 32"
      width={size}
      height={size}
      shapeRendering="crispEdges"
      className={`pixel-sprite mood-${mood} ${className}`}
      style={{
        display: 'inline-block',
        verticalAlign: 'middle',
        imageRendering: 'pixelated',
        ...style,
      }}
      role="img"
      aria-label={`Robot linh vật trạng thái ${mood}`}
    >
      <g transform={`translate(${headShiftX}, ${yOffset})`}>
        {/* Antenna */}
        <rect x={15} y={1} width={2} height={2} fill={mood === 'thinking' && frame % 2 === 0 ? ACCENT : (mood === 'error' ? BAD : INK)} />
        <rect x={15} y={3} width={2} height={3} fill={INK} />

        {/* Head Base */}
        <rect x={8} y={6} width={16} height={11} fill={BLUE} />
        {/* Head Border */}
        <rect x={9} y={5} width={14} height={1} fill={INK} />
        <rect x={9} y={17} width={14} height={1} fill={INK} />
        <rect x={7} y={7} width={1} height={9} fill={INK} />
        <rect x={24} y={7} width={1} height={9} fill={INK} />
        {/* Head Corners */}
        <rect x={8} y={6} width={1} height={1} fill={INK} />
        <rect x={23} y={6} width={1} height={1} fill={INK} />
        <rect x={8} y={16} width={1} height={1} fill={INK} />
        <rect x={23} y={16} width={1} height={1} fill={INK} />

        {/* Ears */}
        <rect x={5} y={9} width={2} height={5} fill={INK} />
        <rect x={6} y={10} width={1} height={3} fill={ACCENT} />
        <rect x={25} y={9} width={2} height={5} fill={INK} />
        <rect x={25} y={10} width={1} height={3} fill={ACCENT} />

        {/* Face Screen */}
        <rect x={10} y={8} width={12} height={7} fill={INK} />

        {/* Eyes / Face Expression */}
        {isBlinking ? (
          <>
            {/* Blinking flat lines */}
            <rect x={11} y={11} width={3} height={1} fill={WHITE} />
            <rect x={18} y={11} width={3} height={1} fill={WHITE} />
          </>
        ) : mood === 'error' ? (
          <>
            {/* X Eyes */}
            <rect x={11} y={9} width={1} height={1} fill={BAD} />
            <rect x={13} y={9} width={1} height={1} fill={BAD} />
            <rect x={12} y={10} width={1} height={1} fill={BAD} />
            <rect x={11} y={11} width={1} height={1} fill={BAD} />
            <rect x={13} y={11} width={1} height={1} fill={BAD} />

            <rect x={18} y={9} width={1} height={1} fill={BAD} />
            <rect x={20} y={9} width={1} height={1} fill={BAD} />
            <rect x={19} y={10} width={1} height={1} fill={BAD} />
            <rect x={18} y={11} width={1} height={1} fill={BAD} />
            <rect x={20} y={11} width={1} height={1} fill={BAD} />
          </>
        ) : mood === 'success' ? (
          <>
            {/* Happy ^ ^ Eyes */}
            <rect x={12} y={9} width={2} height={1} fill={GOOD} />
            <rect x={11} y={10} width={1} height={2} fill={GOOD} />
            <rect x={14} y={10} width={1} height={2} fill={GOOD} />

            <rect x={18} y={9} width={2} height={1} fill={GOOD} />
            <rect x={17} y={10} width={1} height={2} fill={GOOD} />
            <rect x={20} y={10} width={1} height={2} fill={GOOD} />
          </>
        ) : (
          <>
            {/* Normal / Looking Eyes */}
            <rect x={11} y={9} width={3} height={3} fill={WHITE} />
            <rect x={mood === 'search' ? 12 : 11} y={10} width={2} height={2} fill={BLUE} />

            <rect x={18} y={9} width={3} height={3} fill={WHITE} />
            <rect x={mood === 'search' ? 19 : 18} y={10} width={2} height={2} fill={BLUE} />
          </>
        )}

        {/* Neck */}
        <rect x={14} y={18} width={4} height={1} fill={INK} />

        {/* Body */}
        <rect x={10} y={19} width={12} height={7} fill={BLUE} />
        <rect x={9} y={20} width={14} height={5} fill={BLUE} />
        {/* Body Borders */}
        <rect x={10} y={19} width={12} height={1} fill={INK} />
        <rect x={10} y={26} width={12} height={1} fill={INK} />
        <rect x={9} y={20} width={1} height={6} fill={INK} />
        <rect x={22} y={20} width={1} height={6} fill={INK} />

        {/* Chest Panel / Heart Indicator */}
        <rect x={13} y={21} width={6} height={3} fill={INK} />
        <rect x={14} y={22} width={4} height={1} fill={mood === 'working' ? ACCENT : (mood === 'success' ? GOOD : (mood === 'error' ? BAD : WARN))} />

        {/* Accessories & Hands according to Mood */}
        {mood === 'working' ? (
          <>
            {/* Holding Data Box */}
            <rect x={12} y={18} width={8} height={6} fill={ACCENT} />
            <rect x={13} y={19} width={6} height={4} fill={WHITE} />
            <rect x={14} y={20} width={4} height={2} fill={INK} />
            {/* Moving Arms */}
            <rect x={7} y={21} width={3} height={2} fill={INK} />
            <rect x={22} y={21} width={3} height={2} fill={INK} />
          </>
        ) : mood === 'search' ? (
          <>
            {/* Holding Magnifying Glass */}
            <rect x={22} y={18} width={2} height={3} fill={INK} />
            <rect x={23} y={15} width={4} height={4} fill={INK} />
            <rect x={24} y={16} width={2} height={2} fill={BLUE} />
            <rect x={26} y={19} width={2} height={3} fill={ACCENT} />
            {/* Left Arm */}
            <rect x={7} y={21} width={2} height={4} fill={INK} />
          </>
        ) : mood === 'thinking' ? (
          <>
            {/* Hand on Chin */}
            <rect x={7} y={21} width={2} height={4} fill={INK} />
            <rect x={20} y={15} width={3} height={2} fill={INK} />
            <rect x={21} y={17} width={2} height={4} fill={INK} />
            {/* Thinking dots above head */}
            {frame >= 1 && <rect x={23} y={4} width={2} height={2} fill={ACCENT} />}
            {frame >= 2 && <rect x={26} y={1} width={2} height={2} fill={ACCENT} />}
          </>
        ) : mood === 'success' ? (
          <>
            {/* Arms raised up in victory */}
            <rect x={6} y={16} width={3} height={2} fill={INK} />
            <rect x={6} y={18} width={2} height={3} fill={INK} />
            <rect x={23} y={16} width={3} height={2} fill={INK} />
            <rect x={24} y={18} width={2} height={3} fill={INK} />
            {/* Sparkle/Checkmark above */}
            <rect x={26} y={4} width={2} height={4} fill={GOOD} />
            <rect x={25} y={6} width={4} height={2} fill={GOOD} />
          </>
        ) : (
          <>
            {/* Standard Relaxed Arms */}
            <rect x={7} y={21} width={2} height={4} fill={INK} />
            <rect x={23} y={21} width={2} height={4} fill={INK} />
          </>
        )}

        {/* Legs / Feet */}
        {mood === 'working' ? (
          <>
            {/* Alternating Running Legs */}
            {frame % 2 === 0 ? (
              <>
                <rect x={11} y={27} width={3} height={2} fill={INK} />
                <rect x={10} y={29} width={4} height={2} fill={INK} />
                <rect x={18} y={27} width={3} height={1} fill={INK} />
                <rect x={19} y={28} width={3} height={2} fill={INK} />
              </>
            ) : (
              <>
                <rect x={12} y={27} width={3} height={1} fill={INK} />
                <rect x={11} y={28} width={3} height={2} fill={INK} />
                <rect x={17} y={27} width={3} height={2} fill={INK} />
                <rect x={17} y={29} width={4} height={2} fill={INK} />
              </>
            )}
          </>
        ) : isJumping ? (
          <>
            {/* Jumping Bent Legs */}
            <rect x={12} y={27} width={2} height={2} fill={INK} />
            <rect x={18} y={27} width={2} height={2} fill={INK} />
          </>
        ) : (
          <>
            {/* Standing Straight Legs */}
            <rect x={12} y={27} width={2} height={3} fill={INK} />
            <rect x={11} y={30} width={4} height={1} fill={INK} />
            <rect x={18} y={27} width={2} height={3} fill={INK} />
            <rect x={17} y={30} width={4} height={1} fill={INK} />
          </>
        )}
      </g>
    </svg>
  );
};

