import { motion, AnimatePresence } from 'framer-motion';
import { AlertTriangle, Lock } from 'lucide-react';
import { useAppStore } from '../store/StoreContext';

export default function DeleteConfirm() {
  const { profiles, selectedProfiles, setActiveModal, deleteSelectedProfiles } = useAppStore();
  const count = selectedProfiles.size;
  const lockedCount = profiles.filter(p => selectedProfiles.has(p.id) && p.locked).length;
  const deletableCount = count - lockedCount;

  const handleDelete = () => {
    deleteSelectedProfiles();
    setActiveModal(null);
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
          initial={{ scale: 0.96, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.96, opacity: 0 }}
          onClick={e => e.stopPropagation()}
          className="relative w-full max-w-[320px] rounded-xl p-4"
          style={{ backgroundColor: 'var(--color-bg-hover-alt)', border: '1px solid var(--color-border-primary)' }}
        >
          {/* Icon and copy on one row, instead of the old stacked hero block */}
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
              style={{ backgroundColor: 'rgba(239,68,68,0.1)' }}>
              <AlertTriangle className="w-4 h-4" style={{ color: '#ef4444' }} />
            </div>
            <div className="min-w-0">
              <h2 className="text-sm font-bold leading-tight" style={{ color: 'var(--color-text-primary)' }}>
                Delete {deletableCount} profile{deletableCount !== 1 ? 's' : ''}?
              </h2>
              <p className="text-[11px] mt-0.5 leading-snug" style={{ color: 'var(--color-text-muted)' }}>
                This can't be undone — profile data is removed permanently.
              </p>
            </div>
          </div>

          {lockedCount > 0 && (
            <div className="flex items-center gap-1.5 px-2 py-1.5 rounded-md mt-3"
              style={{ backgroundColor: 'rgba(232,212,77,0.08)', border: '1px solid rgba(232,212,77,0.15)' }}>
              <Lock className="w-3 h-3 shrink-0" style={{ color: '#e8d44d' }} />
              <span className="text-[11px]" style={{ color: '#e8d44d' }}>
                {lockedCount} locked profile{lockedCount !== 1 ? 's' : ''} skipped
              </span>
            </div>
          )}

          <div className="flex items-center gap-2 mt-4">
            <button
              onClick={() => setActiveModal(null)}
              className="flex-1 py-1.5 rounded-lg text-xs font-medium"
              style={{ backgroundColor: 'var(--color-border-primary)', color: 'var(--color-text-secondary)' }}
            >
              Cancel
            </button>
            <button
              onClick={handleDelete}
              disabled={deletableCount === 0}
              className="flex-1 py-1.5 rounded-lg text-xs font-medium disabled:opacity-40"
              style={{ backgroundColor: '#ef4444', color: '#ffffff' }}
            >
              Delete
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
