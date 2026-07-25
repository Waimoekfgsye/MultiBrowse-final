import { useState } from 'react';
import { motion } from 'framer-motion';
import { Crown, ExternalLink, X, Check, Key, Loader2 } from 'lucide-react';
import { PAYPAL_LINK, PREMIUM_PRICE } from '../utils/subscription';
import { useAppStore } from '../store/StoreContext';

const ACTIVATE_API = 'https://api-unrealvfx.unrealvfx.workers.dev';

interface Props {
  onClose: () => void;
  feature?: string;
}

export default function UpgradeModal({ onClose, feature }: Props) {
  const [licenseKey, setLicenseKey] = useState('');
  const [activating, setActivating] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const { setPlan, addToast } = useAppStore();

  const getToken = (): string => {
    try {
      const auth = localStorage.getItem('multibrowse_auth');
      if (auth) {
        const parsed = JSON.parse(auth);
        return parsed.token || '';
      }
    } catch {}
    return '';
  };

  const handleActivate = async () => {
    const key = licenseKey.trim();
    if (!key) {
      setError('Please enter your license key');
      return;
    }

    setActivating(true);
    setError('');
    setSuccess('');

    try {
      const token = getToken();
      const res = await fetch(`${ACTIVATE_API}/activate-license`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ license_key: key }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Activation failed');

      setSuccess('License activated. Premium is now enabled.');
      setPlan('premium');
      addToast('success', 'Premium activated');
      setTimeout(() => onClose(), 1800);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setActivating(false);
    }
  };

  return (
    <motion.div
      className="fixed inset-0 z-[70] flex items-center justify-center"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />

      <motion.div
        className="relative w-full max-w-[400px] mx-4 rounded-2xl overflow-hidden"
        style={{ backgroundColor: 'var(--color-bg-secondary)' }}
        initial={{ opacity: 0, y: 20, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 20, scale: 0.98 }}
        transition={{ duration: 0.24, ease: 'easeOut' }}
      >
        <div className="px-6 pt-5 pb-4 flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div
              className="w-9 h-9 rounded-xl flex items-center justify-center"
              style={{ backgroundColor: 'rgba(232,212,77,0.08)' }}
            >
              <Crown className="w-4.5 h-4.5" style={{ color: '#e8d44d' }} />
            </div>
            <div>
              <h2 className="text-[15px] font-semibold" style={{ color: 'var(--color-text-primary)' }}>
                Premium Plan
              </h2>
              <p className="text-[10px]" style={{ color: 'var(--color-text-tertiary)' }}>
                Unlock full access
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-1 text-[var(--color-text-tertiary)] hover:text-[var(--color-text-secondary)] transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        {feature && (
          <div className="px-6 pb-2">
            <p className="text-[11px]" style={{ color: 'var(--color-text-secondary)' }}>
              {feature} requires Premium.
            </p>
          </div>
        )}

        <div className="px-6 pb-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-xl p-3" style={{ backgroundColor: 'var(--color-bg-primary)' }}>
              <div className="text-[11px] font-medium mb-2" style={{ color: 'var(--color-text-secondary)' }}>Free Trial</div>
              <div className="space-y-1.5 text-[10px]" style={{ color: 'var(--color-text-muted)' }}>
                <p>1 profile only</p>
                <p>No edit or delete</p>
                <p>No import / export</p>
                <p>No fingerprint regen</p>
                <p>No duplicate</p>
                <p>No profile lock</p>
                <p>Limited cloud sync</p>
              </div>
            </div>
            <div className="rounded-xl p-3" style={{ backgroundColor: '#111118' }}>
              <div className="text-[11px] font-medium mb-2" style={{ color: '#e8d44d' }}>Premium</div>
              <div className="space-y-1.5 text-[10px]">
                {[
                  'Unlimited profiles',
                  'Edit and delete',
                  'Import / export',
                  'Regen fingerprints',
                  'Duplicate profiles',
                  'Lock profiles',
                  'Full cloud sync',
                ].map((f) => (
                  <div key={f} className="flex items-center gap-1.5">
                    <Check className="w-3 h-3 shrink-0" style={{ color: 'var(--color-text-secondary)' }} />
                    <span style={{ color: 'var(--color-text-secondary)' }}>{f}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="px-6 pb-4 text-center">
          <div className="text-2xl font-semibold" style={{ color: 'var(--color-text-primary)' }}>{PREMIUM_PRICE}</div>
          <div className="text-[10px] mt-1" style={{ color: 'var(--color-text-tertiary)' }}>one-time payment</div>
        </div>

        <div className="px-6 pb-4">
          <div className="text-[10px] font-medium mb-2" style={{ color: 'var(--color-text-secondary)' }}>1. Pay</div>
          <a
            href={PAYPAL_LINK}
            target="_blank"
            rel="noopener noreferrer"
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-[13px] font-medium transition-colors"
            style={{ backgroundColor: 'var(--color-bg-tertiary)', color: 'var(--color-text-primary)' }}
          >
            Pay with PayPal
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
          <p className="text-center text-[9px] mt-2" style={{ color: 'var(--color-text-muted)' }}>
            A license key will be sent to your email after payment.
          </p>
        </div>

        <div className="px-6 pb-6">
          <div className="text-[10px] font-medium mb-2" style={{ color: 'var(--color-text-secondary)' }}>2. Activate</div>
          <div className="flex gap-2">
            <div className="flex-1 relative">
              <Key className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[var(--color-text-tertiary)]" />
              <input
                type="text"
                placeholder="XXXX-XXXX-XXXX-XXXX"
                value={licenseKey}
                onChange={(e) => setLicenseKey(e.target.value.toUpperCase())}
                onKeyDown={(e) => { if (e.key === 'Enter') handleActivate(); }}
                className="w-full pl-9 pr-3 py-2.5 rounded-xl text-xs bg-[var(--color-bg-primary)] text-[var(--color-text-primary)] placeholder-[#333] font-mono tracking-wider"
              />
            </div>
            <button
              onClick={handleActivate}
              disabled={activating}
              className="px-4 py-2.5 rounded-xl text-xs font-medium"
              style={{ backgroundColor: 'var(--color-bg-tertiary)', color: 'var(--color-text-primary)', opacity: activating ? 0.6 : 1 }}
            >
              {activating ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Activate'}
            </button>
          </div>

          {error && <p className="mt-2 text-[11px] text-red-400">{error}</p>}
          {success && <p className="mt-2 text-[11px] text-green-400">{success}</p>}
        </div>
      </motion.div>
    </motion.div>
  );
}
