import { useEffect, useRef, useState } from 'react';

function getAccentColor(): string {
  try {
    const root = document.querySelector('[style*="--accent"]') as HTMLElement;
    if (root) {
      const val = root.style.getPropertyValue('--accent');
      if (val) return val;
    }
  } catch {}
  return '#e8d44d';
}

function hexToRgb(hex: string): string {
  const h = hex.replace('#', '');
  const r = parseInt(h.substring(0, 2), 16);
  const g = parseInt(h.substring(2, 4), 16);
  const b = parseInt(h.substring(4, 6), 16);
  return `${r},${g},${b}`;
}

export default function CustomCursor() {
  const [visible, setVisible] = useState(false);
  const [clicking, setClicking] = useState(false);
  const dotRef = useRef<HTMLDivElement>(null);
  const glowRef = useRef<HTMLDivElement>(null);
  const accentRef = useRef('#e8d44d');

  useEffect(() => {
    // Poll for accent color changes
    const interval = setInterval(() => {
      accentRef.current = getAccentColor();
      if (dotRef.current) {
        dotRef.current.style.backgroundColor = accentRef.current;
      }
    }, 500);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const handleMove = (e: MouseEvent) => {
      if (!visible) setVisible(true);
      if (dotRef.current) {
        dotRef.current.style.transform = `translate(${e.clientX}px, ${e.clientY}px)`;
      }
      if (glowRef.current) {
        glowRef.current.style.transform = `translate(${e.clientX}px, ${e.clientY}px)`;
        const rgb = hexToRgb(accentRef.current);
        glowRef.current.style.background = `radial-gradient(circle, rgba(${rgb},${clicking ? 0.35 : 0.15}) 0%, transparent 70%)`;
      }
    };

    const handleDown = () => setClicking(true);
    const handleUp = () => setClicking(false);
    const handleLeave = () => setVisible(false);
    const handleEnter = () => setVisible(true);

    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mousedown', handleDown);
    window.addEventListener('mouseup', handleUp);
    document.addEventListener('mouseleave', handleLeave);
    document.addEventListener('mouseenter', handleEnter);

    return () => {
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mousedown', handleDown);
      window.removeEventListener('mouseup', handleUp);
      document.removeEventListener('mouseleave', handleLeave);
      document.removeEventListener('mouseenter', handleEnter);
    };
  }, [visible, clicking]);

  if (!visible) return null;

  const dotSize = clicking ? 5 : 8;
  const glowSize = clicking ? 24 : 36;
  const accent = accentRef.current;
  const rgb = hexToRgb(accent);

  return (
    <div style={{ position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 99999 }}>
      <div
        ref={glowRef}
        style={{
          position: 'absolute',
          left: -glowSize / 2,
          top: -glowSize / 2,
          width: glowSize,
          height: glowSize,
          borderRadius: '50%',
          background: `radial-gradient(circle, rgba(${rgb},${clicking ? 0.35 : 0.15}) 0%, transparent 70%)`,
          willChange: 'transform',
          transition: 'width 0.12s, height 0.12s, left 0.12s, top 0.12s',
        }}
      />
      <div
        ref={dotRef}
        style={{
          position: 'absolute',
          left: -dotSize / 2,
          top: -dotSize / 2,
          width: dotSize,
          height: dotSize,
          borderRadius: '50%',
          backgroundColor: accent,
          boxShadow: clicking
            ? `0 0 12px rgba(${rgb},0.9), 0 0 24px rgba(${rgb},0.5)`
            : `0 0 6px rgba(${rgb},0.5)`,
          willChange: 'transform',
          transition: 'width 0.08s, height 0.08s, left 0.08s, top 0.08s, box-shadow 0.08s',
        }}
      />
    </div>
  );
}
