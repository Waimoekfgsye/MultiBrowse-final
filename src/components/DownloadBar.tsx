import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Download, CheckCircle, AlertCircle, Loader2, X } from 'lucide-react';
import type { BrowserDownloadProgress } from '../types';

function getAccent() { try { return localStorage.getItem('mb_accent_color') || '#e8d44d'; } catch { return '#e8d44d'; } }

export default function DownloadBar() {
  const accent = getAccent();
  const [state, setState] = useState<BrowserDownloadProgress>({ status: 'idle' });
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!window.electronAPI) return;
    window.electronAPI.browser.onDownloadProgress((data) => {
      setState(data);
      if (data.status !== 'idle') setVisible(true);
      // Auto-hide after done or error
      if (data.status === 'done' || data.status === 'error') {
        setTimeout(() => setVisible(false), 4000);
      }
    });
  }, []);

  if (!visible) return null;

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ y: 100, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 100, opacity: 0 }}
          className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 w-96 rounded-xl p-4 shadow-lg"
          style={{ backgroundColor: 'var(--color-bg-card)', border: '1px solid var(--color-border-hover)' }}
        >
          {/* Header row */}
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              {state.status === 'resolving' && <Loader2 className="w-5 h-5 animate-spin" style={{ color: accent }} />}
              {state.status === 'downloading' && <Download className="w-5 h-5" style={{ color: accent }} />}
              {state.status === 'extracting' && <Loader2 className="w-5 h-5 animate-spin" style={{ color: accent }} />}
              {state.status === 'done' && <CheckCircle className="w-5 h-5" style={{ color: '#22c55e' }} />}
              {state.status === 'error' && <AlertCircle className="w-5 h-5" style={{ color: '#ef4444' }} />}
              <span className="text-sm font-medium" style={{ color: 'var(--color-text-primary)' }}>
                {state.status === 'resolving' && 'Checking for latest engine version'}
                {state.status === 'downloading' && 'Downloading Nimbus Engine'}
                {state.status === 'extracting' && 'Extracting Nimbus Engine'}
                {state.status === 'done' && 'Nimbus Engine Ready'}
                {state.status === 'error' && 'Download Failed'}
              </span>
            </div>

            <div className="flex items-center gap-2">
              {state.status === 'downloading' && (
                <span className="text-xs font-mono" style={{ color: accent }}>
                  {state.speed}
                </span>
              )}
              {(state.status === 'done' || state.status === 'error') && (
                <button onClick={() => setVisible(false)} className="p-1 rounded" style={{ color: 'var(--color-text-muted)' }}>
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>

          {/* Progress bar */}
          {(state.status === 'downloading' || state.status === 'extracting') && (
            <div className="h-2 rounded-full overflow-hidden mb-2" style={{ backgroundColor: 'var(--color-bg-input)' }}>
              <motion.div
                className="h-full rounded-full"
                style={{ backgroundColor: accent }}
                initial={{ width: 0 }}
                animate={{ width: `${state.percent || 0}%` }}
                transition={{ duration: 0.3 }}
              />
            </div>
          )}

          {state.status === 'done' && (
            <div className="h-2 rounded-full overflow-hidden mb-2" style={{ backgroundColor: '#22c55e' }}>
              <div className="h-full w-full" style={{ backgroundColor: '#22c55e' }} />
            </div>
          )}

          {/* Info row */}
          <div className="flex items-center justify-between">
            <span className="text-[10px]" style={{ color: 'var(--color-text-muted)' }}>
              {state.status === 'resolving' && 'Asking GitHub for the latest release...'}
              {state.status === 'downloading' && `${state.downloaded} MB / ${state.total} MB`}
              {state.status === 'extracting' && 'Unpacking files...'}
              {state.status === 'done' && 'Nimbus engine installed'}
              {state.status === 'error' && (state.error || 'Unknown error')}
            </span>
            {(state.status === 'downloading' || state.status === 'extracting') && (
              <span className="text-[10px] font-mono" style={{ color: 'var(--color-text-secondary)' }}>
                {state.percent}%
              </span>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
