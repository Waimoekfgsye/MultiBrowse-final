import { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Download, X, Copy, Check } from 'lucide-react';
import { useAppStore } from '../store/StoreContext';

export default function ExportModal() {
  const { profiles, setActiveModal, addToast, accentColor } = useAppStore();
  const [selected, setSelected] = useState<Set<string>>(new Set(profiles.map(p => p.id)));
  const [copied, setCopied] = useState(false);

  const selectedProfiles = useMemo(() => {
    return profiles.filter(p => selected.has(p.id));
  }, [profiles, selected]);

  const jsonPreview = useMemo(() => {
    return JSON.stringify(selectedProfiles, null, 2);
  }, [selectedProfiles]);

  const toggleSelect = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (selected.size === profiles.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(profiles.map(p => p.id)));
    }
  };

  const handleDownload = () => {
    const blob = new Blob([jsonPreview], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `multibrowse-profiles-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    addToast('success', `Exported ${selectedProfiles.length} profile(s)`);
    setActiveModal(null);
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(jsonPreview);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    addToast('success', 'JSON copied to clipboard');
  };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-center justify-center"
        style={{ backgroundColor: 'rgba(0,0,0,0.8)' }}
        onClick={() => setActiveModal(null)}
      >
        <motion.div
          initial={{ scale: 0.95, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.95, opacity: 0 }}
          onClick={e => e.stopPropagation()}
          className="relative w-full max-w-2xl rounded-2xl p-6"
          style={{ backgroundColor: 'var(--color-bg-hover-alt)', border: '1px solid var(--color-border-primary)' }}
        >
          <button
            onClick={() => setActiveModal(null)}
            className="absolute top-4 right-4 p-1.5 rounded-lg"
            style={{ color: 'var(--color-text-muted)' }}
          >
            <X className="w-5 h-5" />
          </button>

          <h2 className="text-lg font-bold mb-4" style={{ color: 'var(--color-text-primary)' }}>Export Profiles</h2>

          <div className="grid grid-cols-2 gap-4">
            {/* Profile selection */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-medium" style={{ color: 'var(--color-text-tertiary)' }}>
                  Select Profiles ({selected.size}/{profiles.length})
                </span>
                <button onClick={toggleAll} className="text-xs" style={{ color: accentColor }}>
                  {selected.size === profiles.length ? 'Deselect All' : 'Select All'}
                </button>
              </div>
              <div className="h-64 overflow-y-auto rounded-lg p-2" style={{ backgroundColor: 'var(--color-bg-primary)' }}>
                {profiles.map(p => (
                  <button
                    key={p.id}
                    onClick={() => toggleSelect(p.id)}
                    className="w-full flex items-center gap-2 px-2 py-1.5 rounded text-left transition-colors"
                    style={{
                      backgroundColor: selected.has(p.id) ? 'rgba(232,212,77,0.1)' : 'transparent',
                    }}
                    onMouseEnter={e => { if (!selected.has(p.id)) e.currentTarget.style.backgroundColor = 'var(--color-bg-tertiary)'; }}
                    onMouseLeave={e => { if (!selected.has(p.id)) e.currentTarget.style.backgroundColor = 'transparent'; }}
                  >
                    <div
                      className="w-6 h-6 rounded flex items-center justify-center text-[10px] font-bold"
                      style={{ backgroundColor: p.color + '22', color: p.color }}
                    >
                      {p.name[0]?.toUpperCase()}
                    </div>
                    <span className="text-xs flex-1 truncate" style={{ color: 'var(--color-text-primary)' }}>{p.name}</span>
                    <span className="text-[10px]" style={{ color: 'var(--color-text-muted)' }}>{p.fingerprint.os}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* JSON preview */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-medium" style={{ color: 'var(--color-text-tertiary)' }}>
                  JSON Preview
                </span>
                <button onClick={handleCopy} className="flex items-center gap-1 text-xs" style={{ color: accentColor }}>
                  {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                  {copied ? 'Copied!' : 'Copy'}
                </button>
              </div>
              <pre
                className="h-64 overflow-auto rounded-lg p-3 text-[10px] font-mono"
                style={{ backgroundColor: 'var(--color-bg-primary)', color: 'var(--color-text-tertiary)' }}
              >
                {jsonPreview.slice(0, 2000)}{jsonPreview.length > 2000 ? '...' : ''}
              </pre>
            </div>
          </div>

          {/* Info note */}
          <p className="text-[10px] mt-3" style={{ color: 'var(--color-text-muted)' }}>
            Exports profile settings (fingerprint, proxy, name). Login sessions and cookies sync automatically via cloud.
          </p>

          {/* Actions */}
          <div className="flex items-center gap-3 mt-3">
            <button
              onClick={() => setActiveModal(null)}
              className="flex-1 py-2.5 rounded-lg text-sm font-medium"
              style={{ backgroundColor: 'var(--color-border-primary)', color: 'var(--color-text-secondary)' }}
            >
              Cancel
            </button>
            <button
              onClick={handleDownload}
              disabled={selected.size === 0}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-medium disabled:opacity-50"
              style={{ backgroundColor: accentColor, color: 'var(--color-bg-primary)' }}
            >
              <Download className="w-4 h-4" />
              Download JSON
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
