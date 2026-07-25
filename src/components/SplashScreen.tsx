import { useEffect, useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { LogIn, UserPlus, X, WifiOff } from 'lucide-react';

const isElectron = typeof window !== 'undefined' && !!window.electronAPI;
const getAccent = () => { try { return localStorage.getItem('mb_accent_color') || '#e8d44d'; } catch { return '#e8d44d'; } };

const BOOT_LINES = [
  'Initializing MultiBrowse...',
  'Loading fingerprint engine',
  'Calibrating canvas noise',
  'Connecting to Nimbus engine',
  'Verifying modules',
  'All systems operational ✓',
];

function Particle({ index }: { index: number }) {
  const style = useMemo(() => ({
    left: `${Math.random() * 100}%`,
    dur: 3 + Math.random() * 4,
    del: Math.random() * 3,
    size: 2 + Math.random() * 4,
    opacity: 0.25 + Math.random() * 0.45,
  }), [index]);
  return (
    <motion.div className="absolute rounded-full"
      style={{ left: style.left, width: style.size, height: style.size, backgroundColor: getAccent(), opacity: style.opacity, bottom: -10 }}
      animate={{ y: [0, -(300 + Math.random() * 400)], opacity: [style.opacity, 0], x: [0, (Math.random() - 0.5) * 80] }}
      transition={{ duration: style.dur, delay: style.del, repeat: Infinity, ease: 'easeOut' }}
    />
  );
}

interface Props {
  onOpenAuth: (mode: 'login' | 'signup') => void;
  onOffline: () => void;
}

export default function SplashScreen({ onOpenAuth, onOffline }: Props) {
  const accent = getAccent();
  const [lineIndex, setLineIndex] = useState(0);
  const [bootDone, setBootDone] = useState(false);
  const [showSignIn, setShowSignIn] = useState(false);
  const [showSignUp, setShowSignUp] = useState(false);
  const [showOffline, setShowOffline] = useState(false);

  useEffect(() => {
    const t: ReturnType<typeof setTimeout>[] = [];
    const d = 500;
    BOOT_LINES.forEach((_, i) => t.push(setTimeout(() => setLineIndex(i), d * i)));
    const total = d * (BOOT_LINES.length - 1) + 600;
    t.push(setTimeout(() => setBootDone(true), total));
    t.push(setTimeout(() => setShowSignIn(true), total + 400));
    t.push(setTimeout(() => setShowSignUp(true), total + 700));
    t.push(setTimeout(() => setShowOffline(true), total + 900));
    return () => t.forEach(clearTimeout);
  }, []);

  const progress = Math.min(((lineIndex + 1) / BOOT_LINES.length) * 100, 100);
  const currentLine = BOOT_LINES[lineIndex];
  const isReady = lineIndex === BOOT_LINES.length - 1;
  const W = 'w-[280px]';

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center" style={{ backgroundColor: 'var(--color-bg-primary)' }}>
      <button onClick={() => { if (isElectron) window.electronAPI?.windowClose(); }}
        className="absolute top-3 right-3 p-1.5 rounded-lg z-20 transition-colors"
        onMouseEnter={e => (e.currentTarget.style.backgroundColor = 'rgba(239,68,68,0.2)')}
        onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}>
        <X className="w-4 h-4" style={{ color: 'var(--color-text-muted)' }} />
      </button>

      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {Array.from({ length: 40 }).map((_, i) => <Particle key={i} index={i} />)}
      </div>

      <div className="relative z-10 flex flex-col items-center">
        <div className="h-6 flex items-center justify-center mb-5" style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '12px' }}>
          <AnimatePresence mode="wait">
            <motion.span key={lineIndex}
              initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.2 }}
              style={{ color: isReady ? '#22c55e' : 'var(--color-text-muted)' }}>
              {currentLine}
            </motion.span>
          </AnimatePresence>
        </div>

        <div className={`${W} h-[3px] rounded-full overflow-hidden`} style={{ backgroundColor: '#141420' }}>
          <motion.div className="h-full rounded-full"
            style={{ background: bootDone ? '#22c55e' : accent }}
            animate={{ width: `${progress}%` }}
            transition={{ duration: 0.35, ease: 'easeOut' }}
          />
        </div>

        {/* Sign In / Sign Up */}
        <div className={`${W} mt-5 flex items-start justify-between`}>
          {showSignIn ? (
            <motion.button initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.5 }}
              onClick={() => onOpenAuth('login')}
              className="w-[136px] flex items-center justify-center gap-2 py-2.5 rounded-lg text-[13px] font-semibold btn-shine"
              style={{ backgroundColor: accent, color: 'var(--color-bg-primary)' }}
              whileHover={{ boxShadow: `0 0 20px ${accent}40` }} whileTap={{ scale: 0.97 }}>
              <LogIn className="w-4 h-4" /> Sign In
            </motion.button>
          ) : <div />}
          {showSignUp && (
            <motion.button initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.5 }}
              onClick={() => onOpenAuth('signup')}
              className="w-[136px] flex items-center justify-center gap-2 py-2.5 rounded-lg text-[13px] font-semibold"
              style={{ backgroundColor: accent + '14', color: accent }}
              whileHover={{ backgroundColor: accent + '26' }} whileTap={{ scale: 0.97 }}>
              <UserPlus className="w-4 h-4" /> Sign Up
            </motion.button>
          )}
        </div>

        {/* Offline button */}
        {showOffline && (
          <motion.div className={W} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.5 }}>
            <button onClick={onOffline}
              className="w-full mt-3 flex items-center justify-center gap-1.5 py-2 rounded-lg text-[11px] text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)] transition-colors">
              <WifiOff className="w-3 h-3" />
              Use Offline — profiles stored on device only
            </button>
          </motion.div>
        )}
      </div>
    </div>
  );
}
