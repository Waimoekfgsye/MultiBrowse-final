import { useState, useCallback, useEffect, useRef } from 'react';
import { AnimatePresence } from 'framer-motion';
import { useStore } from './store/useStore';
import { StoreContext } from './store/StoreContext';
import CustomCursor from './components/CustomCursor';
import SplashScreen from './components/SplashScreen';
import AuthModal from './components/AuthModal';
import Sidebar from './components/Sidebar';
import ProfileList from './components/ProfileList';
import GroupsView from './components/GroupsView';
import ProxiesView from './components/ProxiesView';
import SettingsView from './components/SettingsView';
import ProfileEditor from './components/ProfileEditor';
import ImportModal from './components/ImportModal';
import ExportModal from './components/ExportModal';
import DeleteConfirm from './components/DeleteConfirm';
import ToastContainer from './components/ToastContainer';
import DownloadBar from './components/DownloadBar';
import { refreshTokenIfNeeded } from './utils/tokenRefresh';

type AppPhase = 'landing' | 'main';

const AUTH_KEY = 'multibrowse_auth';

function loadSavedAuth(): { email: string; token: string; offline?: boolean } | null {
  try {
    const data = localStorage.getItem(AUTH_KEY);
    if (data) {
      const parsed = JSON.parse(data);
      if ((parsed.email && parsed.token) || parsed.offline) return parsed;
    }
  } catch {}
  return null;
}

function saveAuth(email: string, token: string) {
  localStorage.setItem(AUTH_KEY, JSON.stringify({ email, token, offline: false }));
}

function saveOffline() {
  localStorage.setItem(AUTH_KEY, JSON.stringify({ email: 'offline', token: '', offline: true }));
}

function clearAuth() {
  localStorage.removeItem(AUTH_KEY);
}

export default function App() {
  const saved = loadSavedAuth();
  const initialAccount = saved?.offline ? 'offline' : (saved?.email || 'offline');
  const initialToken = saved?.offline ? '' : (saved?.token || '');

  const [phase, setPhase] = useState<AppPhase>(saved ? 'main' : 'landing');
  const [userEmail, setUserEmail] = useState(saved?.email || '');
  const [isOffline, setIsOffline] = useState(saved?.offline || false);
  const [authModal, setAuthModal] = useState<'login' | 'signup' | null>(null);

  const store = useStore(initialAccount, initialToken);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', store.theme);
  }, [store.theme]);

  const handleOpenAuth = useCallback((mode: 'login' | 'signup') => {
    setAuthModal(mode);
  }, []);

  const handleAuth = useCallback((email: string, token: string, remember: boolean) => {
    setUserEmail(email);
    setIsOffline(false);
    setAuthModal(null);
    setPhase('main');
    if (remember) saveAuth(email, token);
    else clearAuth();
    store.switchAccount(email, token);
  }, [store]);

  const handleOffline = useCallback(() => {
    setUserEmail('offline');
    setIsOffline(true);
    setPhase('main');
    saveOffline();
    store.switchAccount('offline', '');
  }, [store]);

  const handleLogout = useCallback(() => {
    setUserEmail('');
    setIsOffline(false);
    if (window.electronAPI) window.electronAPI.auth.clearToken();
    clearAuth();
    setPhase('landing');
  }, []);

  // ── Browser running-state sync ──────────────────────────────────────
  // The main process is the only thing that knows whether a browser is
  // actually alive, so it is the single source of truth here. It pushes
  // the complete list of running profile IDs on every reconcile (a few
  // seconds apart, plus immediately on launch and stop) and this effect
  // maps that list onto profile.status.
  //
  // Two things were wrong before:
  //   * the effect depended on [store], so it re-ran on every state
  //     change and registered another IPC listener each time, with no way
  //     to remove the old ones. They accumulated and fired with stale
  //     store snapshots.
  //   * nothing ever ran after mount, so a browser closed with its own X
  //     button left the row stuck on red "Stop" forever.
  //
  // storeRef keeps the listener stable while still reaching the current
  // store, so it can be registered exactly once.
  const storeRef = useRef(store);
  storeRef.current = store;

  useEffect(() => {
    const api = window.electronAPI;
    if (!api) return;

    const applyActive = (activeIds: string[]) => {
      const active = new Set(activeIds);
      const current = storeRef.current;
      current.profiles.forEach(p => {
        const shouldBeRunning = active.has(p.id);
        if (shouldBeRunning && p.status !== 'running') {
          current.updateProfile(p.id, { status: 'running' });
        } else if (!shouldBeRunning && p.status === 'running') {
          current.updateProfile(p.id, { status: 'ready' });
        }
      });
    };

    const unsubActive = api.browser.onActiveChanged(applyActive);
    const unsubStopped = api.browser.onProfileStopped((profileId: string) => {
      storeRef.current.updateProfile(profileId, { status: 'ready' });
    });
    const unsubStarted = api.browser.onProfileStarted((profileId: string) => {
      storeRef.current.updateProfile(profileId, { status: 'running' });
    });

    // Initial hard sync, so a restart never shows a stale "running" row.
    api.browser.listActive().then(applyActive).catch(() => {});

    // Backstop in case an IPC message is ever missed.
    const poll = setInterval(() => {
      api.browser.listActive().then(applyActive).catch(() => {});
    }, 5000);

    return () => {
      clearInterval(poll);
      unsubActive?.();
      unsubStopped?.();
      unsubStarted?.();
    };
  }, []);

  useEffect(() => {
    if (!saved || saved.offline || !initialToken) return;

    // Refresh token if expiring soon, then sync
    refreshTokenIfNeeded().then((freshToken) => {
      const tokenToUse = freshToken || initialToken;
      if (window.electronAPI) {
        try { window.electronAPI.auth.setToken(tokenToUse); } catch {}
      }
      // If token was refreshed, update the store's account with the new token
      if (freshToken && freshToken !== initialToken) {
        store.switchAccount(saved.email, freshToken);
      } else {
        store.pullFromCloud();
      }
    }).catch(() => {
      // Fallback: use existing token even if refresh failed
      if (window.electronAPI) {
        try { window.electronAPI.auth.setToken(initialToken); } catch {}
      }
      store.pullFromCloud();
    });
  }, []);

  const renderMainContent = () => {
    switch (store.currentView) {
      case 'groups': return <GroupsView />;
      case 'proxies': return <ProxiesView />;
      case 'settings': return <SettingsView />;
      default: return <ProfileList />;
    }
  };

  return (
    <StoreContext.Provider value={store}>
      <CustomCursor />

      <AnimatePresence mode="wait">
        {phase === 'landing' && (
          <SplashScreen key="landing" onOpenAuth={handleOpenAuth} onOffline={handleOffline} />
        )}

        {phase === 'main' && (
          <div key="main" className="flex flex-col h-screen" style={{
            backgroundColor: 'var(--color-bg-primary)',
            '--accent': store.accentColor,
            '--accent-dim': store.accentColor + 'cc',
            '--accent-glow': store.accentColor + '4d',
            '--accent-bg': store.accentColor + '15',
            '--accent-bg2': store.accentColor + '22',
          } as React.CSSProperties}>
            <div className="flex flex-1 overflow-hidden">
              <Sidebar userEmail={userEmail} onLogout={handleLogout} isOffline={isOffline} />
              <div className="flex-1 flex flex-col overflow-hidden" style={{ backgroundColor: 'var(--color-bg-secondary)' }}>
                {renderMainContent()}
              </div>
            </div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {authModal && (
          <AuthModal key="auth-modal" initialMode={authModal} onAuth={handleAuth}
            onClose={() => setAuthModal(null)} />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {store.activeModal === 'editor' && <ProfileEditor key="editor" />}
        {store.activeModal === 'import' && <ImportModal key="import" />}
        {store.activeModal === 'export' && <ExportModal key="export" />}
        {store.activeModal === 'delete' && <DeleteConfirm key="delete" />}
      </AnimatePresence>

      <DownloadBar />
      <ToastContainer />
    </StoreContext.Provider>
  );
}
