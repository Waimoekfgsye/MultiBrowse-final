import { useState } from 'react';

/**
 * macOS-style traffic lights, sized to sit inline in a view's toolbar
 * row. This replaces the old dedicated TitleBar: the window is frameless
 * (frame: false in electron/main.cjs), so these are the only way to
 * minimise/maximise/close.
 *
 * Every top-level view renders one of these at the right end of its
 * header row. `titlebar-no-drag` keeps them clickable inside the
 * draggable header region.
 */
const isElectron = typeof window !== 'undefined' && !!window.electronAPI;

export default function WindowControls() {
  const [maximized, setMaximized] = useState(false);

  const minimize = () => { if (isElectron) window.electronAPI?.windowMinimize(); };
  const maximize = () => {
    if (isElectron) window.electronAPI?.windowMaximize();
    setMaximized(m => !m);
  };
  const close = () => { if (isElectron) window.electronAPI?.windowClose(); };

  return (
    <div className="flex items-center gap-2 titlebar-no-drag shrink-0 pl-1">
      <button onClick={minimize} title="Minimize"
        className="w-[13px] h-[13px] rounded-full transition-opacity hover:opacity-80 active:opacity-60"
        style={{ backgroundColor: '#ffbd2e' }} />
      <button onClick={maximize} title={maximized ? 'Restore' : 'Maximize'}
        className="w-[13px] h-[13px] rounded-full transition-opacity hover:opacity-80 active:opacity-60"
        style={{ backgroundColor: '#27c93f' }} />
      <button onClick={close} title="Close"
        className="w-[13px] h-[13px] rounded-full transition-opacity hover:opacity-80 active:opacity-60"
        style={{ backgroundColor: '#ff5f56' }} />
    </div>
  );
}
