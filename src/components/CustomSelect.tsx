import { useState, useRef, useEffect, useMemo } from 'react';
import { ChevronDown, Check } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';

interface SelectOption<T> {
  value: T;
  label: string;
}

interface CustomSelectProps<T> {
  value: T;
  onChange: (value: T) => void;
  options: SelectOption<T>[];
  placeholder?: string;
  className?: string;
  menuClassName?: string;
  buttonClassName?: string;
  disabled?: boolean;
  direction?: 'down';
  menuWidth?: string;
}

export default function CustomSelect<T extends string | number>({
  value,
  onChange,
  options,
  placeholder,
  className,
  menuClassName,
  buttonClassName,
  disabled,
  direction: _direction = 'down',
  menuWidth,
}: CustomSelectProps<T>) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  const selected = useMemo(
    () => options.find((option) => String(option.value) === String(value)),
    [options, value]
  );

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    window.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      window.removeEventListener('keydown', handleEscape);
    };
  }, []);

  return (
    <div ref={rootRef} className={`relative ${className || ''}`}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen(!open)}
        className={buttonClassName || 'w-full flex items-center justify-between gap-2 px-3 py-2 rounded-lg text-sm'}
        style={{
          backgroundColor: 'var(--color-bg-input)',
          border: '1px solid var(--color-border-primary)',
          color: selected ? 'var(--color-text-primary)' : 'var(--color-text-muted)',
        }}
      >
        <span className="truncate">{selected?.label || placeholder || 'Select...'}</span>
        <ChevronDown
          className={`w-4 h-4 transition-transform ${open ? 'rotate-180' : ''}`}
          style={{ color: 'var(--color-text-muted)' }}
        />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.15 }}
            className={`absolute z-50 mt-1 rounded-lg overflow-hidden shadow-lg ${menuClassName || ''}`}
            style={{
              backgroundColor: 'var(--color-bg-tertiary)',
              border: '1px solid var(--color-border-hover)',
              width: menuWidth || '100%',
              maxHeight: 240,
              overflowY: 'auto',
            }}
          >
            <div className="py-1">
              {options.map((option) => {
                const isSelected = String(option.value) === String(value);
                return (
                  <button
                    key={String(option.value)}
                    type="button"
                    onClick={() => {
                      onChange(option.value);
                      setOpen(false);
                    }}
                    className="w-full flex items-center gap-2 px-3 py-2 text-sm transition-colors"
                    style={{
                      backgroundColor: isSelected ? 'rgba(232,212,77,0.08)' : 'transparent',
                      color: isSelected ? '#e8d44d' : 'var(--color-text-secondary)',
                    }}
                    onMouseEnter={(e) => {
                      if (!isSelected) e.currentTarget.style.backgroundColor = 'var(--color-border-primary)';
                    }}
                    onMouseLeave={(e) => {
                      if (!isSelected) e.currentTarget.style.backgroundColor = 'transparent';
                    }}
                  >
                    <span className="flex-1 text-left truncate">{option.label}</span>
                    {isSelected && <Check className="w-4 h-4" style={{ color: '#e8d44d' }} />}
                  </button>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
