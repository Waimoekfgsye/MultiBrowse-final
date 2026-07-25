import { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Upload, FileJson } from 'lucide-react';
import { useAppStore } from '../store/StoreContext';
import type { BrowserProfile } from '../types';

export default function ImportModal() {
  const { setActiveModal, importProfiles, addToast, accentColor } = useAppStore();
  const [jsonText, setJsonText] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const [fileName, setFileName] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFile = (file: File) => {
    if (!file.name.endsWith('.json')) { addToast('error', 'Please select a JSON file'); return; }
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = (e) => { const content = e.target?.result as string; setJsonText(content); };
    reader.readAsText(file);
  };

  const handleDrop = (e: React.DragEvent) => { e.preventDefault(); setDragOver(false); const file = e.dataTransfer.files[0]; if (file) handleFile(file); };

  const handleImport = () => {
    if (!jsonText.trim()) { addToast('error', 'Please provide profile data'); return; }
    try {
      const data = JSON.parse(jsonText);
      const profiles: BrowserProfile[] = Array.isArray(data) ? data : [data];
      if (profiles.length === 0) { addToast('error', 'No profiles found in the data'); return; }
      importProfiles(profiles);
      setActiveModal(null);
    } catch {
      addToast('error', 'Invalid JSON format');
    }
  };

  return (
    <AnimatePresence>
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 flex items-center justify-center" style={{ backgroundColor: 'rgba(0,0,0,0.8)' }} onClick={() => setActiveModal(null)}>
        <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }} onClick={e => e.stopPropagation()} className="relative w-full max-w-lg rounded-2xl p-6" style={{ backgroundColor: 'var(--color-bg-hover-alt)', border: '1px solid var(--color-border-primary)' }}>
          <button onClick={() => setActiveModal(null)} className="absolute top-4 right-4 p-1.5 rounded-lg" style={{ color: 'var(--color-text-muted)' }}><X className="w-5 h-5" /></button>
          <h2 className="text-lg font-bold mb-4" style={{ color: 'var(--color-text-primary)' }}>Import Profiles</h2>
          <div className={`border-2 border-dashed rounded-xl p-8 text-center mb-4 transition-colors ${dragOver ? '' : 'border-[var(--color-border-primary)]'}`} style={dragOver ? { borderColor: accentColor } : {}} onDragOver={e => { e.preventDefault(); setDragOver(true); }} onDragLeave={() => setDragOver(false)} onDrop={handleDrop}>
            <Upload className="w-10 h-10 mx-auto mb-3" style={{ color: 'var(--color-text-muted)' }} />
            <p className="text-sm mb-2" style={{ color: 'var(--color-text-secondary)' }}>Drop a .json file here</p>
            <p className="text-xs mb-3" style={{ color: 'var(--color-text-dim)' }}>or</p>
            <button onClick={() => fileInputRef.current?.click()} className="px-4 py-2 rounded-lg text-sm font-medium" style={{ backgroundColor: accentColor + '1a', color: accentColor }}>Browse Files</button>
            <input ref={fileInputRef} type="file" accept=".json" className="hidden" onChange={e => { if (e.target.files?.[0]) handleFile(e.target.files[0]); }} />
            {fileName && (<div className="flex items-center justify-center gap-2 mt-3" style={{ color: '#22c55e' }}><FileJson className="w-4 h-4" /><span className="text-xs">{fileName}</span></div>)}
          </div>
          <div className="mb-4">
            <label className="text-[10px] font-semibold uppercase tracking-wider mb-1.5 block" style={{ color: 'var(--color-text-muted)' }}>Or paste JSON</label>
            <textarea value={jsonText} onChange={e => setJsonText(e.target.value)} className="w-full h-32 px-3 py-2 rounded-lg text-xs font-mono resize-none" style={{ backgroundColor: 'var(--color-bg-primary)', border: '1px solid var(--color-border-primary)', color: 'var(--color-text-primary)' }} placeholder='[{"name": "Profile 1", ...}]' />
          </div>
          <p className="text-[10px] mb-3" style={{ color: 'var(--color-text-muted)' }}>
            Imports profile settings (fingerprint, proxy, name). Login sessions restore automatically from cloud sync.
          </p>
          <div className="flex items-center justify-end gap-3">
            <button onClick={() => setActiveModal(null)} className="px-4 py-2 rounded-lg text-sm" style={{ color: 'var(--color-text-tertiary)' }}>Cancel</button>
            <button onClick={handleImport} className="px-5 py-2 rounded-lg text-sm font-medium" style={{ backgroundColor: accentColor, color: 'var(--color-bg-primary)' }}>Import</button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
