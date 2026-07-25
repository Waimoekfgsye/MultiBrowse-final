import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Mail, Lock, Eye, EyeOff, ArrowLeft, Loader2 } from 'lucide-react';

type AuthView = 'login' | 'signup' | 'forgot' | 'verify' | 'reset-verify' | 'reset';
const API = 'https://api-unrealvfx.unrealvfx.workers.dev';

function isElectron() { return typeof window !== 'undefined' && !!window.electronAPI; }
function getAccent() { try { return localStorage.getItem('mb_accent_color') || '#e8d44d'; } catch { return '#e8d44d'; } }

function Particle({ index }: { index: number }) {
  const s = useMemo(() => ({
    left: `${Math.random() * 100}%`, dur: 4 + Math.random() * 5, del: Math.random() * 4,
    size: 1.5 + Math.random() * 2.5, opacity: 0.08 + Math.random() * 0.15,
  }), [index]);
  return (
    <motion.div className="absolute rounded-full"
      style={{ left: s.left, width: s.size, height: s.size, backgroundColor: getAccent(), opacity: s.opacity, bottom: -10 }}
      animate={{ y: [0, -(250 + Math.random() * 350)], opacity: [s.opacity, 0], x: [0, (Math.random() - 0.5) * 60] }}
      transition={{ duration: s.dur, delay: s.del, repeat: Infinity, ease: 'easeOut' }}
    />
  );
}

interface AuthModalProps {
  initialMode: 'login' | 'signup';
  onAuth: (email: string, token: string, remember: boolean) => void;
  onClose: () => void;
}

export default function AuthModal({ initialMode, onAuth, onClose }: AuthModalProps) {
  const [view, setView] = useState<AuthView>(initialMode);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [showConfirmPass, setShowConfirmPass] = useState(false);
  const [rememberLogin, setRememberLogin] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [code, setCode] = useState(['', '', '', '']);
  const [newPassword, setNewPassword] = useState('');
  const codeRefs = useRef<(HTMLInputElement | null)[]>([]);

  const handleLogin = useCallback(async () => {
    if (!email || !password) { setError('Please fill all fields'); return; }
    setLoading(true); setError('');
    try {
      const res = await fetch(`${API}/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Login failed');
      if (!data.token || typeof data.token !== 'string' || data.token.split('.').length !== 3) {
        throw new Error('Login succeeded but no valid JWT token was returned by the auth worker. Cloud sync requires a real JWT with payload.sub.');
      }
      const token = data.token;
      if (isElectron()) window.electronAPI!.auth.setToken(token);
      onAuth(email, token, rememberLogin);
    } catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
  }, [email, password, onAuth, rememberLogin]);

  const handleSignup = useCallback(async () => {
    if (!email || !password || !confirmPassword) { setError('Please fill all fields'); return; }
    if (password !== confirmPassword) { setError('Passwords do not match'); return; }
    if (password.length < 6) { setError('Min 6 characters'); return; }
    setLoading(true); setError('');
    try {
      const res = await fetch(`${API}/signup`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Signup failed');
      // The worker answers 200 with email_sent:false when Resend is
      // misconfigured. Saying "check your email" there sends people to an
      // inbox that will never get anything.
      if (data.email_sent === false) {
        setError(data.email_error || 'Account created, but the verification email could not be sent. Contact support.');
        setTimeout(() => setView('verify'), 2500);
        return;
      }
      setSuccess('Account created. Check your email for the verification code.');
      setTimeout(() => setView('verify'), 1500);
    } catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
  }, [email, password, confirmPassword]);

  const handleVerifyEmail = useCallback(async () => {
    const codeStr = code.join('');
    if (codeStr.length !== 4) { setError('Enter full 4-digit code'); return; }
    setLoading(true); setError('');
    try {
      const res = await fetch(`${API}/verify-email`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, code: codeStr }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Verification failed');
      setSuccess('Email verified! You can now sign in.');
      setTimeout(() => setView('login'), 1500);
    } catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
  }, [email, code]);

  const handleResendVerification = useCallback(async () => {
    if (!email) { setError('Missing email'); return; }
    setLoading(true); setError('');
    try {
      const res = await fetch(`${API}/resend-verification`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Resend failed');
      if (data.email_sent === false) { setError(data.email_error || 'The email could not be sent.'); return; }
      setSuccess(data.message || 'Verification code resent.');
    } catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
  }, [email]);

  const handleForgot = useCallback(async () => {
    if (!email) { setError('Enter your email'); return; }
    setLoading(true); setError('');
    try {
      const res = await fetch(`${API}/forgot-password`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed');
      if (data.email_sent === false) { setError(data.email_error || 'The reset email could not be sent.'); return; }
      setSuccess('Reset code sent');
      setView('reset-verify');
    } catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
  }, [email]);

  const handleResetVerify = useCallback(async () => {
    const codeStr = code.join('');
    if (codeStr.length !== 4) { setError('Enter full code'); return; }
    setView('reset');
  }, [code]);

  const handleReset = useCallback(async () => {
    if (!newPassword || newPassword.length < 6) { setError('Min 6 characters'); return; }
    setLoading(true); setError('');
    try {
      const res = await fetch(`${API}/reset-password`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, code: code.join(''), password: newPassword }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed');
      setSuccess('Password reset!');
      setTimeout(() => setView('login'), 1500);
    } catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
  }, [email, code, newPassword]);

  const handleCodeChange = (i: number, v: string) => {
    if (v.length > 1) v = v[v.length - 1];
    if (v && !/\d/.test(v)) return;
    const n = [...code]; n[i] = v; setCode(n);
    if (v && i < 3) codeRefs.current[i + 1]?.focus();
  };

  const handleCodeKeyDown = (i: number, e: React.KeyboardEvent) => {
    if (e.key === 'Backspace' && !code[i] && i > 0) codeRefs.current[i - 1]?.focus();
  };

  useEffect(() => { setError(''); setSuccess(''); }, [view]);

  useEffect(() => {
    if (view === 'verify' || view === 'reset-verify') {
      setTimeout(() => codeRefs.current[0]?.focus(), 100);
    }
  }, [view]);

  const accent = getAccent();
  const inputClass = "w-full px-4 py-3 rounded-lg text-sm bg-[var(--color-bg-primary)] text-[var(--color-text-primary)] placeholder-[var(--color-text-tertiary)]";
  const btnClass = "w-full py-3 rounded-lg font-semibold text-sm btn-shine";

  return (
    <motion.div className="fixed inset-0 z-[60] flex items-center justify-center"
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.25 }}>

      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {Array.from({ length: 25 }).map((_, i) => <Particle key={i} index={i} />)}
      </div>

      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />

      <motion.div className="relative w-full max-w-[360px] mx-4 p-6 rounded-2xl bg-[var(--color-bg-tertiary)]"
        initial={{ opacity: 0, y: 30, scale: 0.95 }} animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 30, scale: 0.95 }} transition={{ duration: 0.3, ease: [0.23, 1, 0.32, 1] }}>

        <AnimatePresence mode="wait">
          {view === 'login' && (
            <motion.div key="login" initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 10 }} transition={{ duration: 0.15 }}>
              <div className="space-y-3">
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--color-text-tertiary)]" tabIndex={-1} />
                  <input type="email" placeholder="Email" value={email} onChange={e => setEmail(e.target.value)} tabIndex={1} autoFocus className={inputClass} style={{ paddingLeft: '40px' }} />
                </div>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--color-text-tertiary)]" tabIndex={-1} />
                  <input type={showPass ? 'text' : 'password'} placeholder="Password" value={password} onChange={e => setPassword(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') handleLogin(); }} tabIndex={2} className={inputClass} style={{ paddingLeft: '40px' }} />
                  <button onClick={() => setShowPass(!showPass)} tabIndex={-1} className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--color-text-tertiary)]">
                    {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <label className="flex items-center gap-2 text-[11px] text-[var(--color-text-tertiary)] select-none">
                    <input type="checkbox" checked={rememberLogin} onChange={(e) => setRememberLogin(e.target.checked)} tabIndex={3} className="h-3.5 w-3.5 rounded bg-[var(--color-bg-primary)] accent-yellow-400" />
                    Remember login
                  </label>
                  <button onClick={() => setView('forgot')} tabIndex={-1} className="text-[11px] text-[var(--color-text-tertiary)] hover:text-[var(--color-text-secondary)]">Forgot password?</button>
                </div>
                <button onClick={handleLogin} disabled={loading} tabIndex={4} className={btnClass} style={{ backgroundColor: accent, color: 'var(--color-bg-primary)' }}>
                  {loading ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : 'Sign In'}
                </button>
              </div>
              <div className="mt-4 flex items-center justify-between">
                <p className="text-[11px] text-[var(--color-text-muted)]">Don't have an account?{' '}
                  <button onClick={() => setView('signup')} tabIndex={-1} className="hover:underline" style={{ color: accent }}>Sign Up</button>
                </p>
                <button onClick={onClose} tabIndex={-1} className="text-[11px] text-[var(--color-text-tertiary)] hover:text-[var(--color-text-tertiary)]">← Back</button>
              </div>
            </motion.div>
          )}

          {view === 'signup' && (
            <motion.div key="signup" initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 10 }} transition={{ duration: 0.15 }}>
              <div className="space-y-3">
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--color-text-tertiary)]" tabIndex={-1} />
                  <input type="email" placeholder="Email" value={email} onChange={e => setEmail(e.target.value)} tabIndex={1} autoFocus className={inputClass} style={{ paddingLeft: '40px' }} />
                </div>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--color-text-tertiary)]" tabIndex={-1} />
                  <input type={showPass ? 'text' : 'password'} placeholder="Password" value={password} onChange={e => setPassword(e.target.value)} tabIndex={2} className={inputClass} style={{ paddingLeft: '40px' }} />
                  <button onClick={() => setShowPass(!showPass)} tabIndex={-1} className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--color-text-tertiary)]">
                    {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--color-text-tertiary)]" tabIndex={-1} />
                  <input type={showConfirmPass ? 'text' : 'password'} placeholder="Confirm Password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') handleSignup(); }} tabIndex={3} className={inputClass} style={{ paddingLeft: '40px' }} />
                  <button onClick={() => setShowConfirmPass(!showConfirmPass)} tabIndex={-1} className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--color-text-tertiary)]">
                    {showConfirmPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                <button onClick={handleSignup} disabled={loading} tabIndex={4} className={btnClass} style={{ backgroundColor: accent, color: 'var(--color-bg-primary)' }}>
                  {loading ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : 'Create Account'}
                </button>
              </div>
              <div className="mt-4 flex items-center justify-between">
                <p className="text-[11px] text-[var(--color-text-muted)]">Already have an account?{' '}
                  <button onClick={() => setView('login')} tabIndex={-1} className="hover:underline" style={{ color: accent }}>Sign In</button>
                </p>
                <button onClick={onClose} tabIndex={-1} className="text-[11px] text-[var(--color-text-tertiary)] hover:text-[var(--color-text-tertiary)]">← Back</button>
              </div>
            </motion.div>
          )}

          {view === 'verify' && (
            <motion.div key="verify" initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 10 }} transition={{ duration: 0.15 }}>
              <button onClick={() => setView('signup')} tabIndex={-1} className="flex items-center gap-1 text-[11px] text-[var(--color-text-tertiary)] mb-4"><ArrowLeft className="w-3 h-3" /> Back</button>
              <p className="text-xs text-[var(--color-text-secondary)] mb-1 font-medium">Verify your email</p>
              <p className="text-[11px] text-[var(--color-text-muted)] mb-5">Enter the 4-digit code sent to <span style={{ color: accent }}>{email}</span></p>
              <div className="flex gap-3 justify-center mb-5">
                {code.map((d, i) => (
                  <input key={i} ref={el => { codeRefs.current[i] = el; }} type="text" inputMode="numeric" maxLength={1} value={d}
                    onChange={e => handleCodeChange(i, e.target.value)} onKeyDown={e => handleCodeKeyDown(i, e)} tabIndex={i + 1}
                    className="w-13 h-13 text-center text-2xl rounded-xl bg-[var(--color-bg-primary)] text-[var(--color-text-primary)] font-mono" style={{ width: 52, height: 52 }} />
                ))}
              </div>
              <button onClick={handleVerifyEmail} disabled={loading} tabIndex={5} className={btnClass} style={{ backgroundColor: accent, color: 'var(--color-bg-primary)' }}>
                {loading ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : 'Verify Email'}
              </button>
              <p className="mt-3 text-center text-[10px] text-[var(--color-text-tertiary)]">Didn't receive it? Check spam or{' '}
                <button onClick={handleResendVerification} tabIndex={-1} className="hover:underline" style={{ color: accent }}>resend</button>
              </p>
            </motion.div>
          )}

          {view === 'forgot' && (
            <motion.div key="forgot" initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 10 }} transition={{ duration: 0.15 }}>
              <button onClick={() => setView('login')} tabIndex={-1} className="flex items-center gap-1 text-[11px] text-[var(--color-text-tertiary)] mb-4"><ArrowLeft className="w-3 h-3" /> Back</button>
              <div className="space-y-3">
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--color-text-tertiary)]" tabIndex={-1} />
                  <input type="email" placeholder="Email" value={email} onChange={e => setEmail(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') handleForgot(); }} tabIndex={1} autoFocus className={inputClass} style={{ paddingLeft: '40px' }} />
                </div>
                <button onClick={handleForgot} disabled={loading} tabIndex={2} className={btnClass} style={{ backgroundColor: accent, color: 'var(--color-bg-primary)' }}>
                  {loading ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : 'Send Reset Code'}
                </button>
              </div>
            </motion.div>
          )}

          {view === 'reset-verify' && (
            <motion.div key="reset-verify" initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 10 }} transition={{ duration: 0.15 }}>
              <button onClick={() => setView('forgot')} tabIndex={-1} className="flex items-center gap-1 text-[11px] text-[var(--color-text-tertiary)] mb-4"><ArrowLeft className="w-3 h-3" /> Back</button>
              <p className="text-xs text-[var(--color-text-secondary)] mb-1 font-medium">Reset password</p>
              <p className="text-[11px] text-[var(--color-text-muted)] mb-5">Enter the 4-digit code sent to <span style={{ color: accent }}>{email}</span></p>
              <div className="flex gap-3 justify-center mb-5">
                {code.map((d, i) => (
                  <input key={i} ref={el => { codeRefs.current[i] = el; }} type="text" inputMode="numeric" maxLength={1} value={d}
                    onChange={e => handleCodeChange(i, e.target.value)} onKeyDown={e => handleCodeKeyDown(i, e)} tabIndex={i + 1}
                    className="w-13 h-13 text-center text-2xl rounded-xl bg-[var(--color-bg-primary)] text-[var(--color-text-primary)] font-mono" style={{ width: 52, height: 52 }} />
                ))}
              </div>
              <button onClick={handleResetVerify} disabled={loading} tabIndex={5} className={btnClass} style={{ backgroundColor: accent, color: 'var(--color-bg-primary)' }}>
                {loading ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : 'Verify Code'}
              </button>
            </motion.div>
          )}

          {view === 'reset' && (
            <motion.div key="reset" initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 10 }} transition={{ duration: 0.15 }}>
              <p className="text-xs text-[var(--color-text-secondary)] mb-4 font-medium">Set your new password</p>
              <div className="space-y-3">
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--color-text-tertiary)]" tabIndex={-1} />
                  <input type="password" placeholder="New Password" value={newPassword} onChange={e => setNewPassword(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') handleReset(); }} tabIndex={1} autoFocus className={inputClass} style={{ paddingLeft: '40px' }} />
                </div>
                <button onClick={handleReset} disabled={loading} tabIndex={2} className={btnClass} style={{ backgroundColor: accent, color: 'var(--color-bg-primary)' }}>
                  {loading ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : 'Reset Password'}
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {error && <motion.div initial={{ opacity: 0, y: -5 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            className="mt-3 px-3 py-2 rounded-lg text-xs bg-red-500/10 text-red-400">{error}</motion.div>}
          {success && <motion.div initial={{ opacity: 0, y: -5 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            className="mt-3 px-3 py-2 rounded-lg text-xs bg-green-500/10 text-green-400">{success}</motion.div>}
        </AnimatePresence>
      </motion.div>
    </motion.div>
  );
}
