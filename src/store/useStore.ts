import { useState, useCallback, useRef } from 'react';
import type { BrowserProfile, ProfileGroup, Toast, ModalType, ViewType } from '../types';
import { generateFingerprint } from '../utils/fingerprint';
import { pullAllProfiles, uploadCloudProfile, deleteCloudProfile } from '../utils/cloudSync';
import { type SubscriptionPlan, type Permissions, getPermissions, getPlanFromToken } from '../utils/subscription';

// ── Local storage ────────────────────────────────────────────────────
function accountKey(a: string, s: string) {
  const safe = a.toLowerCase().replace(/[^a-z0-9]/g, '_');
  return `mb_${safe}_${s}`;
}

function loadLocal<T>(a: string, s: string, fb: T): T {
  try {
    const d = localStorage.getItem(accountKey(a, s));
    return d ? JSON.parse(d) : fb;
  } catch {
    return fb;
  }
}

function saveLocal(a: string, s: string, d: any) {
  localStorage.setItem(accountKey(a, s), JSON.stringify(d));
}

const DEFAULT_GROUPS: ProfileGroup[] = [{ id: 'default', name: 'Default', color: '#e8d44d', profileIds: [] }];
const DEFAULT_URLS: string[] = [];
const PROFILE_COLORS = ['#e8d44d', '#22c55e', '#3b82f6', '#ef4444', '#a855f7', '#f97316', '#ec4899', '#06b6d4'];

let profileCounter = 0;

function createProfile(existingCount: number, overrides?: Partial<BrowserProfile>): BrowserProfile {
  const fp = generateFingerprint();
  profileCounter++;
  const num = existingCount + profileCounter;
  return {
    id: crypto.randomUUID(),
    name: `Profile ${num}`,
    group: 'Default',
    status: 'ready',
    createdAt: new Date().toISOString(),
    lastUsed: '',
    proxy: { type: 'none', host: '', port: '', username: '', password: '' },
    fingerprint: fp,
    notes: '',
    color: PROFILE_COLORS[Math.floor(Math.random() * PROFILE_COLORS.length)],
    ...overrides,
  };
}

export function useStore(account: string = 'offline', token: string = '') {
  const accountRef = useRef(account);
  const tokenRef = useRef(token);
  const isOnline = () => accountRef.current !== 'offline' && !!tokenRef.current;

  // Always load from local first — cloud reconciliation happens after mount
  // Reset all statuses to 'ready' on startup — no browser is actually running yet
  const [profiles, setProfilesState] = useState<BrowserProfile[]>(() => {
    const loaded = loadLocal<BrowserProfile[]>(account, 'profiles', []);
    return loaded.map(p => p.status !== 'ready' ? { ...p, status: 'ready' as const } : p);
  });

  const [groups, setGroupsState] = useState<ProfileGroup[]>(() => loadLocal(account, 'groups', DEFAULT_GROUPS));
  const [startupUrls, setStartupUrlsState] = useState<string[]>(() => loadLocal(account, 'urls', DEFAULT_URLS));
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [currentView, setCurrentView] = useState<ViewType>('profiles');
  const [activeModal, setActiveModal] = useState<ModalType>(null);
  const [editingProfile, setEditingProfile] = useState<BrowserProfile | null>(null);
  const [selectedProfiles, setSelectedProfiles] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<'name' | 'created' | 'lastUsed' | 'status' | 'os'>('created');
  const [viewMode, setViewMode] = useState<'grid' | 'list' | 'cards'>('list');
  const [deleteAnchor, setDeleteAnchor] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);

  // ── Theme colors ─────────────────────────────────────────────────────
  const [accentColor, setAccentColorState] = useState(() => {
    try {
      return localStorage.getItem('mb_accent_color') || '#e8d44d';
    } catch {
      return '#e8d44d';
    }
  });

  const setAccentColor = useCallback((c: string) => {
    setAccentColorState(c);
    try {
      localStorage.setItem('mb_accent_color', c);
    } catch {}
  }, []);

  const [theme, setThemeState] = useState<'dark' | 'light'>(() => {
    try {
      const saved = localStorage.getItem('mb_theme');
      if (saved === 'light' || saved === 'dark') return saved;
    } catch {}
    return 'dark';
  });

  const setTheme = useCallback((t: 'dark' | 'light') => {
    setThemeState(t);
    try {
      localStorage.setItem('mb_theme', t);
    } catch {}
  }, []);

  const toggleTheme = useCallback(() => {
    setThemeState(prev => {
      const next = prev === 'dark' ? 'light' : 'dark';
      try {
        localStorage.setItem('mb_theme', next);
      } catch {}
      return next;
    });
  }, []);



  // ── Subscription ─────────────────────────────────────────────────────
  const [plan, setPlan] = useState<SubscriptionPlan>(() => {
    if (account === 'offline') return 'offline';
    return getPlanFromToken(token);
  });

  const permissions: Permissions = getPermissions(plan, profiles.length);

  // ── Save profiles ──────────────────────────────────────────────────────
  const setProfiles = useCallback((p: BrowserProfile[] | ((prev: BrowserProfile[]) => BrowserProfile[])) => {
    setProfilesState(prev => {
      const next = typeof p === 'function' ? p(prev) : p;
      // Always persist locally — both offline and online accounts
      saveLocal(accountRef.current, 'profiles', next);
      return next;
    });
  }, []);

  const setGroups = useCallback((g: ProfileGroup[] | ((prev: ProfileGroup[]) => ProfileGroup[])) => {
    setGroupsState(prev => {
      const next = typeof g === 'function' ? g(prev) : g;
      saveLocal(accountRef.current, 'groups', next);
      return next;
    });
  }, []);

  const setStartupUrls = useCallback((u: string[] | ((prev: string[]) => string[])) => {
    setStartupUrlsState(prev => {
      const next = typeof u === 'function' ? u(prev) : u;
      saveLocal(accountRef.current, 'urls', next);
      return next;
    });
  }, []);

  // ── Toasts ─────────────────────────────────────────────────────────────
  const addToast = useCallback((type: Toast['type'], message: string) => {
    const id = crypto.randomUUID();
    setToasts(prev => [...prev, { id, type, message }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 4000);
  }, []);

  const removeToast = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  // ── Cloud sync ─────────────────────────────────────────────────────────
  const syncProfileToCloud = useCallback((profile: BrowserProfile) => {
    if (!isOnline()) return;
    setSyncError(null);
    uploadCloudProfile(tokenRef.current, profile).catch((err: any) => {
      const msg = err?.message || 'Cloud upload failed';
      console.warn('[CloudSync] Upload failed:', msg);
      setSyncError(msg);
      addToast('error', `Cloud sync failed: ${msg}`);
    });
  }, [addToast]);

  const removeProfileFromCloud = useCallback((profileId: string) => {
    if (!isOnline()) return;
    setSyncError(null);
    deleteCloudProfile(tokenRef.current, profileId).catch((err: any) => {
      const msg = err?.message || 'Cloud delete failed';
      console.warn('[CloudSync] Delete failed:', msg);
      setSyncError(msg);
      addToast('error', `Cloud sync failed: ${msg}`);
    });
  }, [addToast]);

  const pullFromCloud = useCallback(async () => {
    if (!isOnline()) return;
    setSyncing(true);
    setSyncError(null);
    try {
      const cloudProfiles = await pullAllProfiles(tokenRef.current);
      const cloudIds = new Set(cloudProfiles.map(p => p.id));
      setProfilesState(prev => {
        const localIds = new Set(prev.map(p => p.id));
        // Profiles in local but NOT in cloud = deleted on another device → remove
        const kept = prev.filter(p => cloudIds.has(p.id));
        // Profiles in cloud but NOT in local = created on another device → add
        const newFromCloud = cloudProfiles.filter(p => !localIds.has(p.id));
        // Profiles in both = update local with cloud version (cloud is fresher)
        const merged = kept.map(local => {
          const cloud = cloudProfiles.find(c => c.id === local.id);
          return cloud ? { ...local, ...cloud, status: local.status } : local;
        });
        const reconciled = [...merged, ...newFromCloud];
        // Persist reconciled list locally
        saveLocal(accountRef.current, 'profiles', reconciled);
        const removed = prev.length - kept.length;
        const added = newFromCloud.length;
        if (removed > 0 || added > 0) {
          console.log(`[CloudSync] Reconciled: ${removed} removed, ${added} added, ${merged.length} updated`);
        }
        return reconciled;
      });
      if (cloudProfiles.length > 0) {
        addToast('success', `Synced ${cloudProfiles.length} cloud profile(s)`);
      } else {
        addToast('info', 'No cloud profiles found for this account');
      }
    } catch (err: any) {
      const msg = err?.message || 'Cloud pull failed';
      console.warn('[CloudSync] Pull failed:', msg);
      setSyncError(msg);
      addToast('error', `Cloud sync failed: ${msg}`);
    }
    setSyncing(false);
  }, [addToast]);

  const switchAccount = useCallback((newAccount: string, newToken: string = '') => {
    accountRef.current = newAccount;
    tokenRef.current = newToken;
    setPlan(newAccount === 'offline' ? 'offline' : getPlanFromToken(newToken));

    // Always load from local first — gives instant UI, cloud reconciles after
    // Reset all statuses to 'ready' — no browser is running after account switch
    const loaded = loadLocal<BrowserProfile[]>(newAccount, 'profiles', []);
    setProfilesState(loaded.map(p => p.status !== 'ready' ? { ...p, status: 'ready' as const } : p));
    setGroupsState(loadLocal(newAccount, 'groups', DEFAULT_GROUPS));
    setStartupUrlsState(loadLocal(newAccount, 'urls', DEFAULT_URLS));
    setSelectedProfiles(new Set());
    setSearchQuery('');
    setEditingProfile(null);
    setActiveModal(null);

    if (newAccount !== 'offline' && newToken) setTimeout(() => pullFromCloud(), 300);
  }, [pullFromCloud]);

  // ── Profile CRUD ───────────────────────────────────────────────────────
  const addProfile = useCallback((overrides?: Partial<BrowserProfile>) => {
    const currentCount = profiles.length;
    const p = createProfile(currentCount, overrides);
    let created = false;
    setProfiles(prev => {
      if (prev.some(existing => existing.id === p.id)) return prev;
      created = true;
      return [p, ...prev];
    });
    if (created) {
      addToast('success', `Profile "${p.name}" created`);
      syncProfileToCloud(p);
    }
    return p;
  }, [setProfiles, addToast, syncProfileToCloud, profiles.length]);

  const updateProfile = useCallback((id: string, updates: Partial<BrowserProfile>) => {
    let updated: BrowserProfile | null = null;
    setProfiles(prev => prev.map(p => {
      if (p.id === id) {
        updated = { ...p, ...updates };
        return updated;
      }
      return p;
    }));
    // Skip cloud sync for status-only / lastUsed-only updates — these are local UI state
    // and syncing them would overwrite session data in cloud
    const syncKeys = Object.keys(updates).filter(k => k !== 'status' && k !== 'lastUsed');
    if (updated && syncKeys.length > 0) syncProfileToCloud(updated);
  }, [setProfiles, syncProfileToCloud]);

  const deleteProfile = useCallback((id: string) => {
    const profile = profiles.find(p => p.id === id);
    if (profile?.locked) {
      addToast('error', 'Cannot delete a locked profile. Unlock it first.');
      return;
    }
    setProfiles(prev => prev.filter(p => p.id !== id));
    setSelectedProfiles(prev => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
    removeProfileFromCloud(id);
  }, [setProfiles, removeProfileFromCloud, profiles, addToast]);

  const deleteSelectedProfiles = useCallback(() => {
    const ids = Array.from(selectedProfiles);
    const lockedIds = new Set(profiles.filter(p => selectedProfiles.has(p.id) && p.locked).map(p => p.id));
    const deletableIds = ids.filter(id => !lockedIds.has(id));

    if (deletableIds.length === 0 && lockedIds.size > 0) {
      addToast('error', 'Cannot delete locked profiles. Unlock them first.');
      return;
    }

    setProfiles(prev => prev.filter(p => !deletableIds.includes(p.id)));
    setSelectedProfiles(new Set(lockedIds.size > 0 ? Array.from(lockedIds) : []));
    deletableIds.forEach(id => removeProfileFromCloud(id));

    if (lockedIds.size > 0) {
      addToast('info', `Deleted ${deletableIds.length} profile(s). ${lockedIds.size} locked profile(s) skipped.`);
    } else {
      addToast('success', `Deleted ${deletableIds.length} profile(s)`);
    }
  }, [selectedProfiles, setProfiles, addToast, removeProfileFromCloud, profiles]);

  const duplicateProfile = useCallback((id: string) => {
    const original = profiles.find(p => p.id === id);
    if (!original) return;
    const dup: BrowserProfile = {
      ...original,
      id: crypto.randomUUID(),
      name: `${original.name} (copy)`,
      status: 'ready' as const,
      createdAt: new Date().toISOString(),
      lastUsed: ''
    };
    setProfiles(prev => [dup, ...prev]);
    addToast('success', 'Profile duplicated');
    syncProfileToCloud(dup);
  }, [profiles, setProfiles, addToast, syncProfileToCloud]);

  // ── Groups ─────────────────────────────────────────────────────────────
  const addGroup = useCallback((name: string, color: string) => {
    setGroups(prev => [...prev, { id: crypto.randomUUID(), name, color, profileIds: [] }]);
    addToast('success', `Group "${name}" created`);
  }, [setGroups, addToast]);

  const updateGroup = useCallback((id: string, updates: Partial<ProfileGroup>) => {
    setGroups(prev => prev.map(g => g.id === id ? { ...g, ...updates } : g));
  }, [setGroups]);

  const deleteGroup = useCallback((id: string) => {
    setGroups(prev => prev.filter(g => g.id !== id));
    addToast('success', 'Group deleted');
  }, [setGroups, addToast]);

  const importProfiles = useCallback((data: BrowserProfile[]) => {
    const imported = data.map(p => ({ ...p, id: crypto.randomUUID(), status: 'ready' as const }));
    setProfiles(prev => [...imported, ...prev]);
    addToast('success', `Imported ${imported.length} profile(s)`);
    imported.forEach(p => syncProfileToCloud(p));
  }, [setProfiles, addToast, syncProfileToCloud]);

  return {
    profiles, groups, startupUrls, toasts, currentView, activeModal, editingProfile,
    selectedProfiles, searchQuery, sortBy, viewMode, deleteAnchor, syncing, syncError,
    plan, permissions, setProfiles, setGroups, setStartupUrls, setCurrentView,
    setActiveModal, setEditingProfile, setSelectedProfiles, setSearchQuery, setSortBy,
    setViewMode, setDeleteAnchor, setPlan, addToast, removeToast, addProfile,
    updateProfile, deleteProfile, deleteSelectedProfiles, duplicateProfile,
    addGroup, updateGroup, deleteGroup, importProfiles, switchAccount,
    pullFromCloud, PROFILE_COLORS, accentColor, setAccentColor,
    theme, setTheme, toggleTheme,
  };
}

export type Store = ReturnType<typeof useStore>;
