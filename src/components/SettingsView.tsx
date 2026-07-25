import { useState, useRef } from 'react';
import { Palette, RotateCcw, Check, Pipette, Sun, Moon, HelpCircle } from 'lucide-react';
import WindowControls from './WindowControls';
import { useAppStore } from '../store/StoreContext';
import ThemeToggle from './ThemeToggle';
import Guide, { useGuidesEnabled, setGuidesEnabled } from './Guide';

const ACCENT_PRESETS = [
  { color: '#e8d44d', label: 'Gold' },
  { color: '#22c55e', label: 'Green' },
  { color: '#3b82f6', label: 'Blue' },
  { color: '#ef4444', label: 'Red' },
  { color: '#a855f7', label: 'Purple' },
  { color: '#f97316', label: 'Orange' },
  { color: '#ec4899', label: 'Pink' },
  { color: '#06b6d4', label: 'Cyan' },
  { color: '#10b981', label: 'Emerald' },
  { color: '#f43f5e', label: 'Rose' },
  { color: '#8b5cf6', label: 'Violet' },
  { color: '#14b8a6', label: 'Teal' },
  { color: '#64748b', label: 'Slate' },
  { color: '#facc15', label: 'Yellow' },
];

export default function SettingsView() {
  const { accentColor, setAccentColor, addToast, theme, setTheme } = useAppStore();
  const [hexInput, setHexInput] = useState(accentColor);
  const pickerRef = useRef<HTMLInputElement>(null);
  const guidesOn = useGuidesEnabled();

  const apply = (c: string) => { setHexInput(c); setAccentColor(c); };

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-5 py-3" style={{ borderBottom: '1px solid var(--color-border-primary)' }}>
        <h1 className="text-lg font-bold" style={{ color: 'var(--color-text-primary)' }}>Settings</h1>
        <button onClick={() => { apply('#e8d44d'); addToast('info', 'Reset to default'); }}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
          style={{ backgroundColor: 'var(--color-border-primary)', color: 'var(--color-text-secondary)' }}>
          <RotateCcw className="w-3.5 h-3.5" /> Reset
        </button>
        <div className="flex-1 self-stretch titlebar-drag" />
        <WindowControls />
      </div>

      <div className="flex-1 overflow-y-auto p-5">
        {/* Appearance / Theme */}
        <div className="flex items-center gap-2 mb-1">
          {theme === 'dark' ? <Moon className="w-4 h-4" style={{ color: accentColor }} /> : <Sun className="w-4 h-4" style={{ color: accentColor }} />}
          <span className="text-xs font-semibold" style={{ color: 'var(--color-text-primary)' }}>Appearance</span>
        </div>
        <p className="text-[11px] mb-3" style={{ color: 'var(--color-text-muted)' }}>
          Switch between dark and light interface themes.
        </p>

        <div className="rounded-xl p-4 mb-6 flex items-center justify-between" style={{ backgroundColor: 'var(--color-bg-hover-alt)', border: '1px solid var(--color-border-primary)' }}>
          <div className="flex items-center gap-3">
            <button onClick={() => setTheme('dark')}
              className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium transition-all"
              style={{
                backgroundColor: theme === 'dark' ? accentColor + '18' : 'transparent',
                border: `1.5px solid ${theme === 'dark' ? accentColor : 'var(--color-border-primary)'}`,
                color: theme === 'dark' ? accentColor : 'var(--color-text-secondary)',
              }}>
              <Moon className="w-3.5 h-3.5" /> Dark
            </button>
            <button onClick={() => setTheme('light')}
              className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium transition-all"
              style={{
                backgroundColor: theme === 'light' ? accentColor + '18' : 'transparent',
                border: `1.5px solid ${theme === 'light' ? accentColor : 'var(--color-border-primary)'}`,
                color: theme === 'light' ? accentColor : 'var(--color-text-secondary)',
              }}>
              <Sun className="w-3.5 h-3.5" /> Light
            </button>
          </div>
          <ThemeToggle size="md" />
        </div>

        {/* Hover guides */}
        <div className="flex items-center gap-2 mb-1">
          <HelpCircle className="w-4 h-4" style={{ color: accentColor }} />
          <span className="text-xs font-semibold" style={{ color: 'var(--color-text-primary)' }}>Hover guides</span>
        </div>
        <p className="text-[11px] mb-3" style={{ color: 'var(--color-text-muted)' }}>
          Short explanations that appear when you rest the pointer on a control.
        </p>

        <div className="rounded-xl p-4 mb-6 flex items-center justify-between" style={{ backgroundColor: 'var(--color-bg-hover-alt)', border: '1px solid var(--color-border-primary)' }}>
          <span className="text-[11px]" style={{ color: 'var(--color-text-secondary)' }}>
            {guidesOn ? 'Guides are on' : 'Guides are off'}
          </span>
          <Guide id="settings.guides" side="left">
            <button
              onClick={() => { setGuidesEnabled(!guidesOn); addToast('info', guidesOn ? 'Hover guides off' : 'Hover guides on'); }}
              role="switch"
              aria-checked={guidesOn}
              className="relative rounded-full transition-colors"
              style={{ width: 40, height: 22, backgroundColor: guidesOn ? accentColor : 'var(--color-border-primary)' }}
            >
              <span
                className="absolute rounded-full transition-all"
                style={{
                  width: 16, height: 16, top: 3, left: guidesOn ? 21 : 3,
                  backgroundColor: guidesOn ? 'var(--color-bg-primary)' : 'var(--color-text-muted)',
                }}
              />
            </button>
          </Guide>
        </div>

        {/* Section Header */}
        <div className="flex items-center gap-2 mb-1">
          <Palette className="w-4 h-4" style={{ color: accentColor }} />
          <span className="text-xs font-semibold" style={{ color: 'var(--color-text-primary)' }}>Accent Color</span>
        </div>
        <p className="text-[11px] mb-5" style={{ color: 'var(--color-text-muted)' }}>
          Applies to all buttons, tabs, sidebar, title bar, cursor, and highlights.
        </p>

        {/* Preset Grid */}
        <div className="grid grid-cols-7 gap-2 mb-5">
          {ACCENT_PRESETS.map(p => {
            const active = accentColor === p.color;
            return (
              <button key={p.color} onClick={() => apply(p.color)}
                className="flex flex-col items-center gap-1.5 p-2.5 rounded-xl transition-all duration-150 hover:brightness-110"
                style={{
                  backgroundColor: active ? p.color + '18' : 'var(--color-bg-hover-alt)',
                  border: `1.5px solid ${active ? p.color : 'var(--color-border-primary)'}`,
                  boxShadow: active ? `0 0 20px ${p.color}60, 0 0 6px ${p.color}40` : 'none',
                }}
              >
                <div className="w-8 h-8 rounded-lg relative flex items-center justify-center"
                  style={{ backgroundColor: p.color }}>
                  {active && <Check className="w-4 h-4" style={{ color: 'var(--color-bg-primary)' }} />}
                </div>
                <span className="text-[9px] font-medium" style={{ color: active ? p.color : 'var(--color-text-muted)' }}>{p.label}</span>
              </button>
            );
          })}
        </div>

        {/* Custom Color Picker */}
        <div className="rounded-xl p-4" style={{ backgroundColor: 'var(--color-bg-hover-alt)', border: '1px solid var(--color-border-primary)' }}>
          <div className="flex items-center gap-2 mb-3">
            <Pipette className="w-3.5 h-3.5" style={{ color: 'var(--color-text-secondary)' }} />
            <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--color-text-muted)' }}>Custom Color</span>
          </div>
          <div className="flex items-center gap-3">
            {/* Color picker trigger */}
            <button onClick={() => pickerRef.current?.click()}
              className="w-11 h-11 rounded-xl transition-all relative overflow-hidden group"
              style={{ backgroundColor: accentColor, boxShadow: `0 0 20px ${accentColor}40`, border: '2px solid rgba(255,255,255,0.1)' }}>
              <div className="absolute inset-0 flex items-center justify-center bg-black/0 group-hover:bg-black/20 transition-colors">
                <Pipette className="w-4 h-4 opacity-0 group-hover:opacity-100 transition-opacity" style={{ color: '#fff' }} />
              </div>
            </button>
            <input ref={pickerRef} type="color" value={hexInput} onChange={e => apply(e.target.value)}
              className="absolute w-0 h-0 opacity-0" />

            {/* HEX input */}
            <div className="flex items-center rounded-lg overflow-hidden" style={{ border: '1px solid var(--color-border-primary)' }}>
              <span className="px-2.5 py-2 text-xs font-mono" style={{ backgroundColor: 'var(--color-bg-primary)', color: 'var(--color-text-muted)' }}>#</span>
              <input type="text"
                value={hexInput.replace('#', '')}
                onChange={e => {
                  const v = e.target.value.replace(/[^0-9a-fA-F]/g, '').slice(0, 6);
                  setHexInput('#' + v);
                  if (v.length === 6) setAccentColor('#' + v);
                }}
                maxLength={6}
                className="w-20 px-2 py-2 text-xs font-mono uppercase bg-transparent"
                style={{ color: 'var(--color-text-primary)', outline: 'none' }}
                placeholder="e8d44d"
              />
            </div>

            {/* Current color label */}
            <div className="flex items-center gap-2 ml-auto">
              <div className="w-3 h-3 rounded-full" style={{ backgroundColor: accentColor }} />
              <span className="text-[11px] font-mono" style={{ color: 'var(--color-text-tertiary)' }}>{accentColor}</span>
            </div>
          </div>
        </div>


      </div>
    </div>
  );
}
