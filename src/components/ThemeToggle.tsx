import { Sun, Moon } from 'lucide-react';
import { useAppStore } from '../store/StoreContext';

export default function ThemeToggle({ size = 'sm' }: { size?: 'sm' | 'md' }) {
  const store = useAppStore();
  const { theme, toggleTheme, accentColor } = store;
  const isDark = theme === 'dark';

  const dims = size === 'md' ? { w: 40, h: 22, knob: 16 } : { w: 34, h: 18, knob: 13 };

  return (
    <button
      onClick={toggleTheme}
      title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      aria-label="Toggle theme"
      className="relative shrink-0 rounded-full transition-colors duration-200"
      style={{
        width: dims.w,
        height: dims.h,
        backgroundColor: isDark ? 'var(--color-bg-tertiary)' : accentColor + '33',
        border: '1px solid var(--color-border-primary)',
      }}
    >
      <span
        className="absolute top-1/2 flex items-center justify-center rounded-full transition-all duration-200"
        style={{
          width: dims.knob,
          height: dims.knob,
          transform: `translateY(-50%) translateX(${isDark ? 2 : dims.w - dims.knob - 3}px)`,
          backgroundColor: isDark ? 'var(--color-text-tertiary)' : accentColor,
        }}
      >
        {isDark ? (
          <Moon style={{ width: dims.knob * 0.6, height: dims.knob * 0.6, color: 'var(--color-bg-primary)' }} />
        ) : (
          <Sun style={{ width: dims.knob * 0.6, height: dims.knob * 0.6, color: 'var(--color-bg-primary)' }} />
        )}
      </span>
    </button>
  );
}
