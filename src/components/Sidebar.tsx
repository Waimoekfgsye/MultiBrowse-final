import { useState } from 'react';
import { motion, AnimatePresence, Reorder } from 'framer-motion';
import {
  Users, FolderOpen, Plus, Upload, Download, LogOut, GripVertical,
  Pencil, Trash2, Check, X, ExternalLink, Shield,
  Globe, RefreshCw, Settings
} from 'lucide-react';
import { useAppStore } from '../store/StoreContext';
import type { ViewType } from '../types';
import UpgradeModal from './UpgradeModal';
import ThemeToggle from './ThemeToggle';
import Guide from './Guide';
import type { GuideId } from '../guideContent';

export default function Sidebar({ userEmail, onLogout, isOffline = false }: { userEmail: string; onLogout: () => void; isOffline?: boolean }) {
  const store = useAppStore();
  const { syncing, syncError, plan, permissions } = store;
  const [showUpgrade, setShowUpgrade] = useState(false);
  const [upgradeReason, setUpgradeReason] = useState('');
  const {
    profiles, groups, startupUrls, currentView,
    setCurrentView, setActiveModal, setStartupUrls, addToast
  } = store;
  const [editingUrl, setEditingUrl] = useState<number | null>(null);
  const [editUrlValue, setEditUrlValue] = useState('');
  const [addingUrl, setAddingUrl] = useState(false);
  const [newUrlValue, setNewUrlValue] = useState('');

  const profileCount = profiles.length;
  const groupCount = groups.length;
  const proxyCount = profiles.filter(p => p.proxy.type !== 'none').length;

  const navItems: { id: ViewType; label: string; icon: typeof Users; count?: number; guide: GuideId }[] = [
    { id: 'profiles', label: 'Profiles', icon: Users, count: profileCount, guide: 'nav.profiles' },
    { id: 'groups', label: 'Groups', icon: FolderOpen, count: groupCount, guide: 'nav.groups' },
    { id: 'proxies', label: 'Proxies', icon: Globe, count: proxyCount, guide: 'nav.proxies' },
    { id: 'settings', label: 'Settings', icon: Settings, guide: 'settings.accent' },
  ];

  const handleEditUrl = (index: number) => { setEditingUrl(index); setEditUrlValue(startupUrls[index]); };
  const saveEditUrl = () => { if (editingUrl === null) return; if (!editUrlValue.trim()) return; setStartupUrls(prev => prev.map((u, i) => i === editingUrl ? editUrlValue.trim() : u)); setEditingUrl(null); };
  const handleAddUrl = () => { if (!newUrlValue.trim()) return; setStartupUrls(prev => [...prev, newUrlValue.trim()]); setNewUrlValue(''); setAddingUrl(false); };
  const handleDeleteUrl = (index: number) => { setStartupUrls(prev => prev.filter((_, i) => i !== index)); };

  return (
    <div className="flex flex-col h-full shrink-0" style={{ width: 224, backgroundColor: 'var(--color-bg-sidebar)' }}>
      <div className="flex items-center gap-2.5 px-4 py-3.5">
        <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: store.accentColor + '1f' }}><Shield className="w-4 h-4" style={{ color: store.accentColor }} /></div>
        <div className="flex-1 min-w-0"><h2 className="text-[13px] font-bold" style={{ color: store.accentColor, fontFamily: "'JetBrains Mono', monospace" }}>MultiBrowse</h2><p className="text-[9px]" style={{ color: 'var(--color-text-dim)' }}>Anti-Detect Manager</p></div>
        <ThemeToggle />
      </div>
      <div className="h-px mx-3" style={{ backgroundColor: 'var(--color-bg-card)' }} />
      <div className="px-2 py-2 space-y-0.5">
        {navItems.map(item => {
          const active = currentView === item.id;
          return (
            <Guide key={item.id} id={item.guide} side="right">
            <button onClick={() => setCurrentView(item.id)} className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-[13px] transition-all duration-200 relative" style={{ backgroundColor: active ? store.accentColor + '14' : 'transparent', color: active ? store.accentColor : 'var(--color-text-tertiary)' }} onMouseEnter={e => { if (!active) e.currentTarget.style.backgroundColor = 'var(--color-bg-hover-alt)'; }} onMouseLeave={e => { if (!active) e.currentTarget.style.backgroundColor = active ? store.accentColor + '14' : 'transparent'; }}>
              {active && (<motion.div layoutId="sidebar-indicator" className="absolute left-0 top-1.5 bottom-1.5 w-[3px] rounded-full" style={{ backgroundColor: store.accentColor }} transition={{ type: 'spring', stiffness: 500, damping: 30 }} />)}
              <item.icon className="w-4 h-4" /><span className="font-medium">{item.label}</span>
              {item.count !== undefined && (<span className="ml-auto text-[10px] px-1.5 py-0.5 rounded" style={{ backgroundColor: active ? store.accentColor + '1f' : 'var(--color-bg-tertiary)', color: active ? store.accentColor : 'var(--color-text-dim)' }}>{item.count}</span>)}
            </button>
            </Guide>
          );
        })}
      </div>
      <div className="h-px mx-3" style={{ backgroundColor: 'var(--color-bg-card)' }} />
      <div className="px-3 py-2.5 flex-1 overflow-y-auto min-h-0">
        <div className="flex items-center justify-between mb-2">
          <Guide id="sidebar.startupUrls" side="right"><span className="text-[9px] font-semibold uppercase tracking-wider" style={{ color: 'var(--color-text-dim)' }}>Startup URLs</span></Guide>
          <Guide id="sidebar.addUrl" side="left"><button onClick={() => setAddingUrl(true)} className="w-5 h-5 rounded flex items-center justify-center transition-colors" style={{ backgroundColor: 'var(--color-bg-tertiary)' }} onMouseEnter={e => (e.currentTarget.style.backgroundColor = 'var(--color-bg-hover)')} onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'var(--color-bg-tertiary)')}><Plus className="w-3 h-3" style={{ color: 'var(--color-text-tertiary)' }} /></button></Guide>
        </div>
        <Reorder.Group axis="y" values={startupUrls} onReorder={(newOrder) => setStartupUrls(newOrder)}>
          <AnimatePresence>
            {startupUrls.map((url, index) => (
              <Reorder.Item key={url} value={url}>
                <div className="group flex items-center gap-1 py-1">
                  <GripVertical className="w-3 h-3 shrink-0 opacity-0 group-hover:opacity-40 transition-opacity" style={{ color: 'var(--color-text-muted)' }} />
                  {editingUrl === index ? (
                    <div className="flex items-center gap-1 flex-1 min-w-0">
                      <input value={editUrlValue} onChange={e => setEditUrlValue(e.target.value)} className="flex-1 px-1.5 py-0.5 rounded text-[10px] min-w-0" style={{ backgroundColor: 'var(--color-bg-primary)', border: '1px solid #e8d44d', color: 'var(--color-text-primary)' }} onKeyDown={e => e.key === 'Enter' && saveEditUrl()} autoFocus />
                      <button onClick={saveEditUrl}><Check className="w-3 h-3" style={{ color: '#22c55e' }} /></button>
                      <button onClick={() => setEditingUrl(null)}><X className="w-3 h-3" style={{ color: '#ef4444' }} /></button>
                    </div>
                  ) : (
                    <>
                      <div className="flex items-center gap-1 flex-1 min-w-0"><ExternalLink className="w-3 h-3 shrink-0" style={{ color: 'var(--color-text-dim)' }} /><span className="text-[10px] truncate" style={{ color: 'var(--color-text-tertiary)' }}>{url.replace(/^https?:\/\//, '')}</span></div>
                      <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button onClick={() => handleEditUrl(index)}><Pencil className="w-3 h-3" style={{ color: 'var(--color-text-muted)' }} /></button>
                        <button onClick={() => handleDeleteUrl(index)}><Trash2 className="w-3 h-3" style={{ color: 'var(--color-text-muted)' }} /></button>
                      </div>
                    </>
                  )}
                </div>
              </Reorder.Item>
            ))}
          </AnimatePresence>
        </Reorder.Group>
        {addingUrl && (
          <div className="flex items-center gap-1 mt-1">
            <input value={newUrlValue} onChange={e => setNewUrlValue(e.target.value)} placeholder="https://..." className="flex-1 px-1.5 py-0.5 rounded text-[10px] min-w-0" style={{ backgroundColor: 'var(--color-bg-primary)', border: '1px solid #e8d44d', color: 'var(--color-text-primary)' }} onKeyDown={e => e.key === 'Enter' && handleAddUrl()} autoFocus />
            <button onClick={handleAddUrl}><Check className="w-3 h-3" style={{ color: '#22c55e' }} /></button>
            <button onClick={() => { setAddingUrl(false); setNewUrlValue(''); }}><X className="w-3 h-3" style={{ color: '#ef4444' }} /></button>
          </div>
        )}
      </div>
      <div className="h-px mx-3" style={{ backgroundColor: 'var(--color-bg-card)' }} />
      <div className="px-3 py-2 space-y-2">
        <div className="flex gap-2">
          <Guide id="sidebar.import"><button onClick={() => { if (!permissions.canImportProfiles) { setUpgradeReason('Importing profiles'); setShowUpgrade(true); return; } setActiveModal('import'); }} className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-[11px] font-medium transition-colors" style={{ backgroundColor: 'var(--color-bg-tertiary)', color: 'var(--color-text-tertiary)' }} onMouseEnter={e => (e.currentTarget.style.backgroundColor = 'var(--color-border-primary)')} onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'var(--color-bg-tertiary)')}><Upload className="w-3 h-3" /> Import</button></Guide>
          <Guide id="sidebar.export"><button onClick={() => { if (!permissions.canExportProfiles) { setUpgradeReason('Exporting profiles'); setShowUpgrade(true); return; } if (profiles.length === 0) { addToast('info', 'No profiles to export'); return; } setActiveModal('export'); }} className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-[11px] font-medium transition-colors" style={{ backgroundColor: 'var(--color-bg-tertiary)', color: 'var(--color-text-tertiary)' }} onMouseEnter={e => (e.currentTarget.style.backgroundColor = 'var(--color-border-primary)')} onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'var(--color-bg-tertiary)')}><Download className="w-3 h-3" /> Export</button></Guide>
        </div>
        {(plan === 'free_trial' || isOffline) && (
          <Guide id="sidebar.upgrade"><button onClick={() => setShowUpgrade(true)} className="w-full flex items-center justify-center gap-1.5 py-2 rounded-lg text-[11px] font-semibold btn-shine" style={{ background: 'linear-gradient(135deg, #e8d44d, #f59e0b)', color: 'var(--color-bg-primary)' }}>⚡ Upgrade to Premium — $25</button></Guide>
        )}
        {plan === 'premium' && (<div className="w-full text-center py-2 rounded-lg text-[10px] font-semibold" style={{ backgroundColor: 'rgba(34,197,94,0.12)', color: '#22c55e' }}>PREMIUM ACTIVE</div>)}
      </div>
      <AnimatePresence>{showUpgrade && <UpgradeModal key="sidebar-upgrade" feature={upgradeReason || undefined} onClose={() => { setShowUpgrade(false); setUpgradeReason(''); }} />}</AnimatePresence>
      <div className="h-px mx-3" style={{ backgroundColor: 'var(--color-bg-card)' }} />
      <div className="px-3 py-2.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-6 h-6 rounded-full flex items-center justify-center shrink-0" style={{ backgroundColor: isOffline ? 'rgba(136,136,160,0.12)' : store.accentColor + '1f' }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={isOffline ? 'var(--color-text-secondary)' : store.accentColor} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></svg>
            </div>
            <div className="min-w-0">
              <span className="text-[10px] truncate block" style={{ color: 'var(--color-text-tertiary)' }}>{isOffline ? 'Offline Mode' : userEmail}</span>
              <span className="text-[8px]" style={{ color: isOffline ? 'var(--color-text-muted)' : syncError ? '#ef4444' : syncing ? store.accentColor : 'var(--color-text-tertiary)' }}>{isOffline ? 'Profiles stored on device' : syncError ? `Sync error: ${syncError}` : syncing ? 'Syncing...' : 'Synced to cloud ☁'}</span>
            </div>
          </div>
          <div className="flex items-center gap-1">
            {!isOffline && (<Guide id="sidebar.sync" side="top"><button onClick={() => store.pullFromCloud()} disabled={syncing} className="p-1.5 rounded transition-colors" style={{ color: syncing ? store.accentColor : 'var(--color-text-dim)' }} onMouseEnter={e => { if (!syncing) e.currentTarget.style.color = store.accentColor; }} onMouseLeave={e => { if (!syncing) e.currentTarget.style.color = syncing ? store.accentColor : 'var(--color-text-dim)'; }} ><RefreshCw className={`w-3.5 h-3.5 ${syncing ? 'animate-spin' : ''}`} /></button></Guide>)}
            <Guide id="sidebar.logout" side="top"><button onClick={onLogout} className="p-1.5 rounded transition-colors" style={{ color: 'var(--color-text-dim)' }} onMouseEnter={e => { e.currentTarget.style.color = '#ef4444'; }} onMouseLeave={e => { e.currentTarget.style.color = 'var(--color-text-dim)'; }}><LogOut className="w-3.5 h-3.5" /></button></Guide>
          </div>
        </div>
      </div>
      <div className="px-3 py-1.5" style={{ borderTop: '1px solid var(--color-bg-card)' }}><span className="text-[9px] block text-center" style={{ color: 'var(--color-border-hover)', fontFamily: "'JetBrains Mono', monospace" }}>MultiBrowse v2.0</span></div>
    </div>
  );
}
