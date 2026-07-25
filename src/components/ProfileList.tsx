import { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Search, Plus, LayoutGrid, LayoutList,
  Play, Square, MoreVertical, Copy, RefreshCw, Trash2,
  CheckSquare, Pencil, Monitor, Lock,
  Cpu, Fingerprint, Wifi, WifiOff, Zap, Download, X
} from 'lucide-react';
import Guide from './Guide';
import { useAppStore } from '../store/StoreContext';
import { generateFingerprint } from '../utils/fingerprint';
import { hashPin, verifyPin } from '../utils/crypto';
import { getOSIconComponent, getBrowserIconComponent } from '../utils/osIcons';
import CustomSelect from './CustomSelect';
import WindowControls from './WindowControls';
import UpgradeModal from './UpgradeModal';

function formatGpuMain(renderer: string) {
  const patterns = [
    // RTX 40
    /RTX\s*4090/i, /RTX\s*4080/i, /RTX\s*4070\s*Ti/i, /RTX\s*4070/i, /RTX\s*4060\s*Ti/i, /RTX\s*4060/i,
    // RTX 30
    /RTX\s*3090/i, /RTX\s*3080\s*Ti/i, /RTX\s*3080/i, /RTX\s*3070\s*Ti/i, /RTX\s*3070/i, /RTX\s*3060\s*Ti/i, /RTX\s*3060/i,
    // RTX 20
    /RTX\s*2080\s*Ti/i, /RTX\s*2080/i, /RTX\s*2070/i, /RTX\s*2060/i,
    // GTX 16
    /GTX\s*1660\s*Ti/i, /GTX\s*1660\s*SUPER/i, /GTX\s*1660/i, /GTX\s*1650/i,
    // GTX 10
    /GTX\s*1080\s*Ti/i, /GTX\s*1080/i, /GTX\s*1070/i, /GTX\s*1060/i, /GTX\s*1050\s*Ti/i,
    // GTX 9
    /GTX\s*980\s*Ti/i, /GTX\s*980/i, /GTX\s*970/i, /GTX\s*960/i,
    // GTX older
    /GTX\s*8800/i, /GTX\s*480/i,
    // AMD
    /RX\s*7900\s*XTX/i, /RX\s*7800\s*XT/i, /RX\s*7700\s*XT/i, /RX\s*7600/i,
    /RX\s*6900\s*XT/i, /RX\s*6800\s*XT/i, /RX\s*6700\s*XT/i, /RX\s*6600\s*XT/i,
    /RX\s*5700\s*XT/i, /RX\s*580/i,
    /Radeon\s*R9\s*200/i, /Radeon\s*HD\s*3200/i, /Radeon\s*HD\s*5850/i,
    /Radeon\s*Pro\s*5500M/i,
    // Intel
    /Arc\s*A770/i, /Arc\s*A750/i, /UHD\s*Graphics\s*770/i, /UHD\s*Graphics\s*730/i,
    /UHD\s*Graphics\s*630/i, /Iris\s*Xe/i, /HD\s*Graphics\s*400/i, /HD\s*Graphics/i,
    /Intel\s*945GM/i,
    // Apple
    /Apple\s*M4\s*Pro/i, /Apple\s*M4/i, /Apple\s*M3\s*Pro/i, /Apple\s*M3/i,
    /Apple\s*M2\s*Max/i, /Apple\s*M2\s*Pro/i, /Apple\s*M2/i,
    /Apple\s*M1\s*Max/i, /Apple\s*M1\s*Pro/i, /Apple\s*M1/i,
  ];
  for (const pattern of patterns) {
    const match = renderer.match(pattern);
    if (match) return match[0].replace(/\(TM\)\s*/i, '');
  }
  const cleaned = renderer.replace(/^ANGLE\s*\(/i, '').replace(/\)$/i, '');
  const parts = cleaned.split(',').map((p) => p.trim());
  if (parts[1]) return parts[1].replace(/Direct3D11|OpenGL 4\.6|OpenGL 4\.5/gi, '').trim();
  return renderer.length > 24 ? `${renderer.slice(0, 24)}…` : renderer;
}

function formatGpuSub(renderer: string) {
  if (/NVIDIA/i.test(renderer)) return 'NVIDIA';
  if (/AMD|Radeon/i.test(renderer)) return 'AMD';
  if (/Intel/i.test(renderer)) return 'Intel';
  if (/Apple/i.test(renderer)) return 'Apple';
  if (/Adreno|Qualcomm/i.test(renderer)) return 'Qualcomm';
  if (/Mali|ARM/i.test(renderer)) return 'ARM';
  return 'GPU';
}

function formatOsMain(os: string, osVersion?: string) {
  const version = osVersion || '';
  if (os === 'Windows') return version.includes('11') ? 'Win 11' : version.includes('10') ? 'Win 10' : 'Windows';
  if (os === 'macOS') return version.match(/\d+/)?.[0] ? `macOS ${version.match(/\d+/)?.[0]}` : 'macOS';
  if (os === 'Linux') return version.includes('Ubuntu 24') ? 'Ubuntu 24' : version.includes('Ubuntu 22') ? 'Ubuntu 22' : version.includes('Fedora 40') ? 'Fedora 40' : version.includes('Fedora 39') ? 'Fedora 39' : version.includes('Debian 12') ? 'Debian 12' : 'Linux';
  if (os === 'Android') return version.replace('Android ', 'Android ');
  if (os === 'iOS') return version.replace('iOS ', 'iOS ');
  return os;
}

function formatResolution(resolution: string) {
  return resolution.replace('x', '×');
}

function getProfileLabel(name: string): string {
  const match = name.match(/(\d+)/);
  return match ? `P${match[1]}` : name[0]?.toUpperCase() || 'P';
}

export default function ProfileList() {
  const store = useAppStore();
  const [downloadPrompt, setDownloadPrompt] = useState<{ profileId: string } | null>(null);
  const [upgradeReason, setUpgradeReason] = useState<string | null>(null);
  const [pinPrompt, setPinPrompt] = useState<{ mode: 'lock' | 'unlock'; profileId: string; nextAction?: 'edit' | 'start' } | null>(null);
  const [pinValue, setPinValue] = useState('');
  const {
    profiles, searchQuery, sortBy, viewMode, selectedProfiles,
    setSearchQuery, setSortBy, setViewMode, setSelectedProfiles,
    setActiveModal, setEditingProfile, updateProfile,
    duplicateProfile, addToast, setDeleteAnchor,
    permissions, plan,
  } = store;

  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; profileId: string } | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const filtered = profiles.filter(p =>
    p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    p.group.toLowerCase().includes(searchQuery.toLowerCase()) ||
    p.fingerprint.os.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const sorted = [...filtered].sort((a, b) => {
    switch (sortBy) {
      case 'name': return a.name.localeCompare(b.name);
      case 'status': return a.status.localeCompare(b.status);
      case 'created': return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      case 'os': return a.fingerprint.os.localeCompare(b.fingerprint.os);
      default: return 0;
    }
  });

  const isAllSelected = sorted.length > 0 && sorted.every(p => selectedProfiles.has(p.id));

  const toggleSelectAll = () => {
    if (isAllSelected) { setSelectedProfiles(new Set()); } else { setSelectedProfiles(new Set(sorted.map(p => p.id))); }
  };

  const toggleSelect = (id: string) => {
    setSelectedProfiles(prev => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  };

  const [launching, setLaunching] = useState<string | null>(null);

  const doLaunch = async (id: string, bypassLockCheck = false) => {
    const p = profiles.find(pr => pr.id === id);
    if (!p) return;
    if (p.locked && !bypassLockCheck) { addToast('info', 'Profile is locked. Enter PIN to access.'); return; }
    if (launching === id) return; // prevent double-click
    setLaunching(id);
    try {
      if (window.electronAPI) {
        // Check if engine is installed, if not download first and wait
        const installed = await window.electronAPI.browser.checkInstalled();
        if (!installed) {
          addToast('info', 'Downloading Nimbus engine... please wait');
          const dlResult = await window.electronAPI.browser.download();
          if (!dlResult.success) {
            updateProfile(id, { status: 'error' });
            addToast('error', dlResult.error || 'Engine download failed');
            return;
          }
          // Verify it's actually installed now
          const installedNow = await window.electronAPI.browser.checkInstalled();
          if (!installedNow) {
            updateProfile(id, { status: 'error' });
            addToast('error', 'Engine downloaded but not found. Check nimbus-engine folder.');
            return;
          }
        }
        addToast('info', 'Starting browser...');
        const result = await window.electronAPI.browser.launch(id, { ...p, startupUrls: store.startupUrls });
        if (!result.success) { updateProfile(id, { status: 'error' }); addToast('error', result.error || 'Launch failed'); return; }
      }
      updateProfile(id, { status: 'running', lastUsed: new Date().toISOString() });
      addToast('success', 'Browser launched');
    } finally {
      setLaunching(null);
    }
  };

  const handleStart = async (id: string) => {
    const p = profiles.find(pr => pr.id === id);
    if (p?.locked) { setPinValue(''); setPinPrompt({ mode: 'unlock', profileId: id, nextAction: 'start' }); return; }
    if (window.electronAPI) {
      const installed = await window.electronAPI.browser.checkInstalled();
      if (!installed) { setDownloadPrompt({ profileId: id }); return; }
    }
    doLaunch(id);
  };

  const handleConfirmDownload = async () => {
    if (!downloadPrompt) return;
    const id = downloadPrompt.profileId;
    setDownloadPrompt(null);
    await doLaunch(id);
  };

  const [stopping, setStopping] = useState<string | null>(null);

  const handleStop = async (id: string) => {
    if (stopping === id) return;
    setStopping(id);
    try {
      if (window.electronAPI) {
        // Resolves true only once the browser process tree is actually
        // gone. Previously this fired and forgot, so the button went green
        // while the window was still open on screen.
        const gone = await window.electronAPI.browser.stop(id);
        if (!gone) {
          addToast('error', 'Could not close the browser — it may still be running');
          return;
        }
      }
      updateProfile(id, { status: 'ready' });
      addToast('info', 'Profile stopped');
    } finally {
      setStopping(null);
    }
  };

  const handleContextMenu = (e: React.MouseEvent, profileId: string) => { e.preventDefault(); e.stopPropagation(); setContextMenu({ x: e.clientX, y: e.clientY, profileId }); };

  const handleRegenFingerprint = (id: string) => {
    if (!permissions.canRegenFingerprint) { setUpgradeReason('Regenerating fingerprints'); return; }
    const p = profiles.find(pr => pr.id === id); if (!p) return;
    const fp = generateFingerprint(p.fingerprint.os); updateProfile(id, { fingerprint: fp }); addToast('success', 'Fingerprint regenerated');
  };

  const handleBulkDelete = (e: React.MouseEvent<HTMLButtonElement>) => {
    if (!permissions.canDeleteProfile) { setUpgradeReason('Deleting profiles'); return; }
    if (selectedProfiles.size === 0) return;
    const rect = e.currentTarget.getBoundingClientRect(); setDeleteAnchor({ x: rect.left, y: rect.bottom } as any); setActiveModal('delete');
  };

  const handleEdit = (id: string) => {
    const p = profiles.find(pr => pr.id === id);
    if (!permissions.canEditProfile) { setUpgradeReason('Editing profiles'); return; }
    if (p?.locked) { setPinValue(''); setPinPrompt({ mode: 'unlock', profileId: id, nextAction: 'edit' }); return; }
    if (p) { setEditingProfile(p); setActiveModal('editor'); }
  };

  const handleToggleLock = (id: string) => {
    if (!permissions.canLockProfile) { setUpgradeReason('Locking profiles'); return; }
    const p = profiles.find(pr => pr.id === id); if (!p) return;
    if (p.locked) { setPinValue(''); setPinPrompt({ mode: 'unlock', profileId: id }); } else { setPinValue(''); setPinPrompt({ mode: 'lock', profileId: id }); }
  };

  const handleSubmitPin = async () => {
    if (!pinPrompt) return; const p = profiles.find(pr => pr.id === pinPrompt.profileId); if (!p) return;
    if (!/^\d{4,8}$/.test(pinValue)) { addToast('error', 'PIN must be 4–8 digits'); return; }
    if (pinPrompt.mode === 'lock') {
      const hashed = await hashPin(pinValue);
      updateProfile(p.id, { locked: true, lockPin: hashed });
      addToast('success', 'Profile locked'); setPinPrompt(null); setPinValue(''); return;
    }
    // Verify: support both hashed and legacy plain-text PINs
    const isValid = p.lockPin?.startsWith('') && p.lockPin.length === 64
      ? await verifyPin(pinValue, p.lockPin)
      : p.lockPin === pinValue;
    if (!isValid) { addToast('error', 'Incorrect PIN'); return; }
    // If legacy plain-text PIN matched, upgrade it to hashed
    if (p.lockPin === pinValue && p.lockPin.length < 64) {
      const hashed = await hashPin(pinValue);
      updateProfile(p.id, { lockPin: hashed });
    }
    const next = pinPrompt.nextAction; setPinPrompt(null); setPinValue('');
    if (next === 'edit') {
      setEditingProfile(p); setActiveModal('editor');
    } else if (next === 'start') {
      doLaunch(p.id, true);
    } else {
      updateProfile(p.id, { locked: false, lockPin: '' }); addToast('success', 'Profile unlocked');
    }
  };

  const handleNewProfile = () => {
    if (!permissions.canCreateProfile) { setUpgradeReason('Creating more than 1 profile'); return; }
    setEditingProfile(null); setActiveModal('editor');
  };

  const statusColor = (s: string) => { if (s === 'running') return '#22c55e'; if (s === 'error') return '#ef4444'; return 'var(--color-text-muted)'; };

  return (
    <div className="flex flex-col h-full" onClick={() => setContextMenu(null)}>
      {/* Header + Toolbar (merged) */}
      <div className="flex items-center gap-3 px-5 py-2.5" style={{ borderBottom: '1px solid var(--color-border-primary)' }}>
        <h1 className="text-base font-bold shrink-0" style={{ color: 'var(--color-text-primary)' }}>Profiles</h1>
        <span className="text-[10px] px-1.5 py-0.5 rounded-full shrink-0" style={{ backgroundColor: store.accentColor + '1a', color: store.accentColor }}>{profiles.length}</span>
        <div className="relative w-48 shrink-0">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5" style={{ color: 'var(--color-text-muted)' }} />
          <input value={searchQuery} onChange={e => setSearchQuery(e.target.value)} placeholder="Search..." className="w-full pl-9 pr-3 py-1.5 rounded-lg text-xs" style={{ backgroundColor: 'var(--color-bg-input)', border: '1px solid var(--color-border-primary)', color: 'var(--color-text-primary)' }} />
        </div>
        <div className="w-[130px] shrink-0">
          <CustomSelect value={sortBy} onChange={(value) => setSortBy(value as typeof sortBy)} options={[{ value: 'name', label: 'Sort: Name' }, { value: 'status', label: 'Sort: Status' }, { value: 'created', label: 'Sort: Created' }, { value: 'os', label: 'Sort: OS' }]} buttonClassName="w-full flex items-center justify-between gap-3 rounded-lg px-3 py-1.5 text-left text-xs" />
        </div>
        <Guide id="profiles.selectAll"><button onClick={toggleSelectAll} className="p-1.5 rounded-lg transition-colors shrink-0" style={{ backgroundColor: isAllSelected ? store.accentColor + '26' : 'var(--color-border-primary)' }}><CheckSquare className="w-3.5 h-3.5" style={{ color: isAllSelected ? store.accentColor : 'var(--color-text-muted)' }} /></button></Guide>
        {selectedProfiles.size > 0 && (<Guide id="profiles.bulkDelete"><button onClick={handleBulkDelete} className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-medium transition-colors shrink-0" style={{ backgroundColor: 'rgba(239,68,68,0.1)', color: '#ef4444' }}><Trash2 className="w-3 h-3" /> Delete ({selectedProfiles.size})</button></Guide>)}
        <div className="flex rounded-lg overflow-hidden shrink-0" style={{ border: '1px solid var(--color-border-primary)' }}>
          <Guide id="profiles.viewList" side="bottom"><button onClick={() => setViewMode('list')} className="p-1.5 transition-colors" style={{ backgroundColor: viewMode === 'list' ? store.accentColor + '26' : 'transparent' }}><LayoutList className="w-3.5 h-3.5" style={{ color: viewMode === 'list' ? store.accentColor : 'var(--color-text-muted)' }} /></button></Guide>
          <Guide id="profiles.viewCards" side="bottom"><button onClick={() => setViewMode('cards')} className="p-1.5 transition-colors" style={{ backgroundColor: viewMode === 'cards' ? store.accentColor + '26' : 'transparent' }}><LayoutGrid className="w-3.5 h-3.5" style={{ color: viewMode === 'cards' ? store.accentColor : 'var(--color-text-muted)' }} /></button></Guide>
        </div>
        <div className="flex-1 self-stretch titlebar-drag" />
        <Guide id="profiles.new" side="bottom"><button onClick={handleNewProfile} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium btn-shine shrink-0" style={{ backgroundColor: store.accentColor, color: 'var(--color-bg-primary)' }}><Plus className="w-3.5 h-3.5" /> New Profile</button></Guide>
        <WindowControls />
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-5 py-3">
        {sorted.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center py-20">
            <div className="w-16 h-16 rounded-2xl flex items-center justify-center mb-4" style={{ backgroundColor: 'rgba(232,212,77,0.05)', border: '1px solid var(--color-border-primary)' }}><Monitor className="w-8 h-8" style={{ color: 'var(--color-text-muted)' }} /></div>
            <h3 className="text-sm font-medium mb-1" style={{ color: 'var(--color-text-secondary)' }}>No profiles yet</h3>
            <p className="text-xs mb-4" style={{ color: 'var(--color-text-muted)' }}>Create your first browser profile to get started</p>
            <button onClick={handleNewProfile} className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-medium btn-shine" style={{ backgroundColor: store.accentColor, color: 'var(--color-bg-primary)' }}><Plus className="w-3.5 h-3.5" /> Create Profile</button>
          </div>
        ) : viewMode === 'list' ? (
          <div>
            <div className="grid gap-3 px-3 py-2 text-[10px] font-semibold uppercase tracking-wider" style={{ gridTemplateColumns: '24px 2fr 1.2fr 0.8fr 0.8fr 120px', color: 'var(--color-text-muted)' }}>
              <div /><div>Profile</div><div className="flex items-center gap-1"><Cpu className="w-3 h-3" /> GPU</div><div className="flex items-center gap-1"><Fingerprint className="w-3 h-3" /> FP</div><div className="flex items-center gap-1"><Wifi className="w-3 h-3" /> PXY</div><div className="text-right">Actions</div>
            </div>
            <AnimatePresence>
              {sorted.map(profile => (
                <motion.div key={profile.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}
                  className="profile-row grid gap-3 px-3 py-2.5 rounded-lg mb-1 items-center group"
                  style={{ gridTemplateColumns: '24px 2fr 1.2fr 0.8fr 0.8fr 120px', backgroundColor: selectedProfiles.has(profile.id) ? 'rgba(232,212,77,0.05)' : 'transparent' }}
                  onClick={() => toggleSelect(profile.id)} onContextMenu={e => handleContextMenu(e, profile.id)}>
                  <div className="flex items-center"><div className="w-4 h-4 rounded border flex items-center justify-center text-[10px]" style={{ borderColor: selectedProfiles.has(profile.id) ? '#e8d44d' : 'var(--color-border-hover)', backgroundColor: selectedProfiles.has(profile.id) ? 'rgba(232,212,77,0.2)' : 'transparent', color: '#e8d44d' }}>{selectedProfiles.has(profile.id) && '✓'}</div></div>
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-8 h-8 rounded-lg flex items-center justify-center text-[10px] font-bold shrink-0 relative" style={{ backgroundColor: profile.color + '22', color: profile.color }}>{getProfileLabel(profile.name)}<div className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2" style={{ borderColor: 'var(--color-bg-secondary)', backgroundColor: statusColor(profile.status) }} /></div>
                    <div className="min-w-0"><div className="text-sm font-medium truncate flex items-center gap-1.5" style={{ color: 'var(--color-text-primary)' }}>{profile.name}{profile.locked && <Lock className="w-3 h-3 shrink-0" style={{ color: '#e8d44d' }} />}</div><div className="text-[10px] truncate" style={{ color: 'var(--color-text-muted)' }}>{profile.group}</div></div>
                  </div>
                  <div className="min-w-0"><div className="text-[11px] font-semibold truncate" style={{ color: 'var(--color-text-primary)' }}>{formatGpuMain(profile.fingerprint.webglRenderer)}</div><div className="text-[10px] truncate" style={{ color: 'var(--color-text-muted)' }}>{formatGpuSub(profile.fingerprint.webglRenderer)}</div></div>
                  <div className="min-w-0"><div className="flex items-center gap-1.5 text-[11px] font-semibold" style={{ color: 'var(--color-text-primary)' }}>{getOSIconComponent(profile.fingerprint.os, 13)}<span>{formatOsMain(profile.fingerprint.os, profile.fingerprint.osVersion)}</span></div><div className="flex items-center gap-1.5 text-[10px]" style={{ color: 'var(--color-text-muted)' }}>{getBrowserIconComponent(profile.fingerprint.browserVersion, 12)}<span>{formatResolution(profile.fingerprint.screenResolution)}</span></div></div>
                  <div>{profile.proxy.type !== 'none' ? (<div className="flex items-center gap-1"><Wifi className="w-3 h-3" style={{ color: '#22c55e' }} /><span className="text-[10px] uppercase font-medium" style={{ color: '#22c55e' }}>{profile.proxy.type}</span></div>) : (<div className="flex items-center gap-1"><WifiOff className="w-3 h-3" style={{ color: 'var(--color-text-muted)' }} /><span className="text-[10px]" style={{ color: 'var(--color-text-muted)' }}>None</span></div>)}</div>
                  <div className="flex items-center justify-end gap-1" onClick={e => e.stopPropagation()}>
                    {profile.status === 'running' ? (<Guide id="profile.stop"><button disabled={stopping === profile.id} onClick={() => handleStop(profile.id)} className="flex items-center gap-1 px-2.5 py-1 rounded text-[11px] font-medium transition-colors disabled:opacity-50" style={{ backgroundColor: 'rgba(239,68,68,0.15)', color: '#ef4444' }}><Square className="w-3 h-3" /> {stopping === profile.id ? 'Stopping' : 'Stop'}</button></Guide>) : (<Guide id="profile.start"><button disabled={launching === profile.id} onClick={() => handleStart(profile.id)} className="flex items-center gap-1 px-2.5 py-1 rounded text-[11px] font-medium transition-colors disabled:opacity-50" style={{ backgroundColor: 'rgba(34,197,94,0.15)', color: '#22c55e' }}><Play className="w-3 h-3" /> {launching === profile.id ? 'Starting' : 'Start'}</button></Guide>)}
                    <Guide id="profile.more" side="left"><button onClick={e => handleContextMenu(e, profile.id)} className="p-1 rounded transition-colors" style={{ color: 'var(--color-text-muted)' }} onMouseEnter={e => (e.currentTarget.style.backgroundColor = 'var(--color-border-primary)')} onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}><MoreVertical className="w-4 h-4" /></button></Guide>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        ) : (
          <div className="grid grid-cols-2 xl:grid-cols-3 gap-3">
            <AnimatePresence>
              {sorted.map(profile => (
                <motion.div key={profile.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}
                  className="rounded-xl p-4 transition-colors group" style={{ backgroundColor: 'var(--color-bg-tertiary)', border: `1px solid ${selectedProfiles.has(profile.id) ? 'rgba(232,212,77,0.3)' : 'var(--color-border-primary)'}` }}
                  onClick={() => toggleSelect(profile.id)} onContextMenu={e => handleContextMenu(e, profile.id)}>
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <div className="w-4 h-4 rounded border flex items-center justify-center text-[10px] shrink-0 mt-1" style={{ borderColor: selectedProfiles.has(profile.id) ? '#e8d44d' : 'var(--color-border-hover)', backgroundColor: selectedProfiles.has(profile.id) ? 'rgba(232,212,77,0.2)' : 'transparent', color: '#e8d44d' }}>{selectedProfiles.has(profile.id) && '✓'}</div>
                      <div className="w-10 h-10 rounded-xl flex items-center justify-center text-xs font-bold relative" style={{ backgroundColor: profile.color + '22', color: profile.color }}>{getProfileLabel(profile.name)}<div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2" style={{ borderColor: 'var(--color-bg-tertiary)', backgroundColor: statusColor(profile.status) }} /></div>
                      <div><div className="text-sm font-medium flex items-center gap-1.5" style={{ color: 'var(--color-text-primary)' }}>{profile.name}{profile.locked && <Lock className="w-3 h-3 shrink-0" style={{ color: '#e8d44d' }} />}</div><div className="text-[10px]" style={{ color: 'var(--color-text-muted)' }}>{profile.group}</div></div>
                    </div>
                    <button onClick={e => { e.stopPropagation(); handleContextMenu(e, profile.id); }} className="p-1 rounded opacity-0 group-hover:opacity-100 transition-opacity" style={{ color: 'var(--color-text-muted)' }}><MoreVertical className="w-4 h-4" /></button>
                  </div>
                  <div className="space-y-2.5 mb-3">
                    <div className="flex items-center justify-between text-[11px]"><div className="flex items-center gap-2">{getOSIconComponent(profile.fingerprint.os, 13)}<span style={{ color: 'var(--color-text-primary)', fontWeight: 600 }}>{formatOsMain(profile.fingerprint.os, profile.fingerprint.osVersion)}</span></div><span style={{ color: 'var(--color-text-muted)' }}>{formatResolution(profile.fingerprint.screenResolution)}</span></div>
                    <div className="grid grid-cols-2 gap-2 text-[10px]">
                      <div className="rounded-lg px-2.5 py-2" style={{ backgroundColor: 'var(--color-bg-secondary)' }}><div style={{ color: 'var(--color-text-muted)' }}>Browser</div><div className="mt-0.5 flex items-center gap-1.5" style={{ color: 'var(--color-text-primary)', fontWeight: 600 }}>{getBrowserIconComponent(profile.fingerprint.browserVersion, 12)}<span className="truncate">{profile.fingerprint.browserVersion}</span></div></div>
                      <div className="rounded-lg px-2.5 py-2" style={{ backgroundColor: 'var(--color-bg-secondary)' }}><div style={{ color: 'var(--color-text-muted)' }}>GPU</div><div className="mt-0.5 truncate" style={{ color: 'var(--color-text-primary)', fontWeight: 600 }}>{formatGpuMain(profile.fingerprint.webglRenderer)}</div><div className="truncate" style={{ color: 'var(--color-text-muted)' }}>{formatGpuSub(profile.fingerprint.webglRenderer)}</div></div>
                      <div className="rounded-lg px-2.5 py-2" style={{ backgroundColor: 'var(--color-bg-secondary)' }}><div style={{ color: 'var(--color-text-muted)' }}>Language</div><div className="mt-0.5" style={{ color: 'var(--color-text-primary)', fontWeight: 600 }}>{profile.fingerprint.language}</div></div>
                      <div className="rounded-lg px-2.5 py-2" style={{ backgroundColor: 'var(--color-bg-secondary)' }}><div style={{ color: 'var(--color-text-muted)' }}>Timezone</div><div className="mt-0.5 truncate" style={{ color: 'var(--color-text-primary)', fontWeight: 600 }}>{profile.fingerprint.timezone.split('/').pop()?.replace('_', ' ') || profile.fingerprint.timezone}</div></div>
                    </div>
                    <div className="flex items-center justify-between gap-2 text-[10px] rounded-lg px-2.5 py-2" style={{ backgroundColor: 'var(--color-bg-secondary)' }}>
                      <div className="flex items-center gap-3" style={{ color: 'var(--color-text-secondary)' }}><span><span style={{ color: 'var(--color-text-muted)' }}>CPU</span> <span style={{ color: 'var(--color-text-primary)', fontWeight: 600 }}>{profile.fingerprint.hardwareConcurrency}</span></span><span><span style={{ color: 'var(--color-text-muted)' }}>RAM</span> <span style={{ color: 'var(--color-text-primary)', fontWeight: 600 }}>{profile.fingerprint.deviceMemory}GB</span></span></div>
                      <div>{profile.proxy.type !== 'none' ? (<span className="uppercase font-semibold px-1.5 py-0.5 rounded" style={{ backgroundColor: 'rgba(34,197,94,0.1)', color: '#22c55e', fontSize: '9px' }}>{profile.proxy.type}</span>) : (<span style={{ color: 'var(--color-text-muted)' }}>No proxy</span>)}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2" onClick={e => e.stopPropagation()}>
                    {profile.status === 'running' ? (<Guide id="profile.stop"><button disabled={stopping === profile.id} onClick={() => handleStop(profile.id)} className="flex-1 flex items-center justify-center gap-1 py-1.5 rounded-lg text-[11px] font-medium disabled:opacity-50" style={{ backgroundColor: 'rgba(239,68,68,0.15)', color: '#ef4444' }}><Square className="w-3 h-3" /> {stopping === profile.id ? 'Stopping' : 'Stop'}</button></Guide>) : (<Guide id="profile.start"><button disabled={launching === profile.id} onClick={() => handleStart(profile.id)} className="flex-1 flex items-center justify-center gap-1 py-1.5 rounded-lg text-[11px] font-medium disabled:opacity-50" style={{ backgroundColor: 'rgba(34,197,94,0.15)', color: '#22c55e' }}><Play className="w-3 h-3" /> {launching === profile.id ? 'Starting' : 'Start'}</button></Guide>)}
                    <Guide id="profile.edit"><button onClick={() => handleEdit(profile.id)} className="p-1.5 rounded-lg transition-colors" style={{ backgroundColor: 'var(--color-border-primary)', color: 'var(--color-text-secondary)' }}><Pencil className="w-3.5 h-3.5" /></button></Guide>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        )}
      </div>

      {/* Status bar */}
      <div className="flex items-center justify-between px-5 py-2 text-[10px]" style={{ borderTop: '1px solid var(--color-border-primary)', backgroundColor: 'var(--color-bg-primary)' }}>
        <span style={{ color: 'var(--color-text-muted)' }}>{sorted.length} profile{sorted.length !== 1 ? 's' : ''}{permissions.maxProfiles > 0 ? ` / ${permissions.maxProfiles} max` : ''}</span>
        <a href="https://waimoe.online" target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 transition-colors" onMouseEnter={e => (e.currentTarget.style.opacity = '0.8')} onMouseLeave={e => (e.currentTarget.style.opacity = '1')}><Zap className="w-3 h-3" style={{ color: store.accentColor }} /><span style={{ color: 'var(--color-text-tertiary)', fontFamily: "'JetBrains Mono', monospace" }}>waimoe.online</span></a>
      </div>

      {/* Context menu */}
      <AnimatePresence>
        {contextMenu && (
          <motion.div ref={menuRef} initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }}
            className="fixed z-50 rounded-xl py-1.5 shadow-2xl min-w-[180px]"
            style={{ left: Math.min(contextMenu.x, window.innerWidth - 200), top: Math.min(contextMenu.y, window.innerHeight - 280), backgroundColor: 'var(--color-bg-tertiary)', border: '1px solid var(--color-border-primary)' }}
            onClick={e => e.stopPropagation()}>
            {[
              { icon: Pencil, label: 'Edit Profile', action: () => { handleEdit(contextMenu.profileId); setContextMenu(null); }, locked: !permissions.canEditProfile },
              { icon: Copy, label: 'Duplicate', action: () => { if (!permissions.canDuplicateProfile) { setUpgradeReason('Duplicating profiles'); setContextMenu(null); return; } duplicateProfile(contextMenu.profileId); setContextMenu(null); }, locked: !permissions.canDuplicateProfile },
              { icon: RefreshCw, label: 'Regen Fingerprint', action: () => { handleRegenFingerprint(contextMenu.profileId); setContextMenu(null); }, locked: !permissions.canRegenFingerprint },
              { icon: Download, label: 'Export Profile', action: () => { if (!permissions.canExportProfiles) { setUpgradeReason('Exporting profiles'); setContextMenu(null); return; } const p = profiles.find(pr => pr.id === contextMenu.profileId); if (p) { const blob = new Blob([JSON.stringify([p], null, 2)], { type: 'application/json' }); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = `${p.name.replace(/[^a-zA-Z0-9]/g, '_')}.json`; a.click(); URL.revokeObjectURL(url); addToast('success', 'Profile exported'); } setContextMenu(null); }, locked: !permissions.canExportProfiles },
              { icon: Lock, label: (() => { const lockedNow = profiles.find(pr => pr.id === contextMenu.profileId)?.locked; const base = lockedNow ? 'Unlock Profile' : 'Lock Profile'; return plan === 'offline' ? `${base} (Premium only)` : base; })(), action: () => { handleToggleLock(contextMenu.profileId); setContextMenu(null); }, locked: !permissions.canLockProfile },
              null,
              { icon: Trash2, label: 'Delete', action: () => {
                if (!permissions.canDeleteProfile) { setUpgradeReason('Deleting profiles'); setContextMenu(null); return; }
                const p = profiles.find(pr => pr.id === contextMenu.profileId);
                if (p?.locked) { addToast('error', 'Cannot delete a locked profile. Unlock it first.'); setContextMenu(null); return; }
                setSelectedProfiles(new Set([contextMenu.profileId]));
                setActiveModal('delete');
                setContextMenu(null);
              }, danger: true, locked: !permissions.canDeleteProfile },
            ].map((item, i) => item === null ? (
              <div key={`sep-${i}`} className="h-px my-1 mx-2" style={{ backgroundColor: 'var(--color-border-primary)' }} />
            ) : (
              <button key={item.label as string} onClick={item.action} className="w-full flex items-center gap-2.5 px-3 py-2 text-xs transition-colors" style={{ color: (item as any).danger ? '#ef4444' : 'var(--color-text-primary)' }} onMouseEnter={e => (e.currentTarget.style.backgroundColor = 'var(--color-bg-hover)')} onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}>
                <item.icon className="w-3.5 h-3.5 shrink-0" />
                <span className="flex items-center gap-1.5 min-w-0"><span>{String(item.label).replace(' (Premium only)', '')}</span>{String(item.label).includes('(Premium only)') && (<span style={{ color: 'var(--color-text-muted)', fontSize: '10px' }}>(Premium only)</span>)}</span>
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      {/* PIN lock/unlock prompt */}
      <AnimatePresence>
        {pinPrompt && (
          <motion.div className="fixed inset-0 z-[56] flex items-center justify-center" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <div className="absolute inset-0 bg-black/60" onClick={() => { setPinPrompt(null); setPinValue(''); }} />
            <motion.div className="relative w-[320px] rounded-2xl p-5" style={{ backgroundColor: 'var(--color-bg-tertiary)', border: '1px solid var(--color-border-primary)' }} initial={{ scale: 0.92, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.92, opacity: 0 }}>
              <h3 className="text-sm font-semibold mb-1" style={{ color: 'var(--color-text-primary)' }}>{pinPrompt.mode === 'lock' ? 'Set profile PIN' : 'Enter profile PIN'}</h3>
              <p className="text-[11px] mb-4" style={{ color: 'var(--color-text-tertiary)' }}>{pinPrompt.mode === 'lock' ? 'Lock this profile with a 4–8 digit PIN.' : pinPrompt.nextAction === 'start' ? 'This profile is locked. Enter PIN to launch.' : pinPrompt.nextAction === 'edit' ? 'This profile is locked. Enter PIN to edit.' : 'Enter PIN to permanently unlock this profile.'}</p>
              <input type="password" inputMode="numeric" pattern="[0-9]*" maxLength={8} value={pinValue} onChange={(e) => setPinValue(e.target.value.replace(/\D/g, ''))} onKeyDown={(e) => { if (e.key === 'Enter') handleSubmitPin(); }} autoFocus className="w-full px-4 py-3 rounded-xl text-center text-lg font-mono tracking-[0.35em] bg-[var(--color-bg-primary)] text-[var(--color-text-primary)]" placeholder="0000" />
              <div className="flex gap-2 mt-4">
                <button onClick={() => { setPinPrompt(null); setPinValue(''); }} className="flex-1 py-2 rounded-lg text-xs font-medium" style={{ backgroundColor: 'var(--color-border-primary)', color: 'var(--color-text-secondary)' }}>Cancel</button>
                <button onClick={handleSubmitPin} className="flex-1 py-2 rounded-lg text-xs font-semibold btn-shine" style={{ backgroundColor: '#e8d44d', color: 'var(--color-bg-primary)' }}>{pinPrompt.mode === 'lock' ? 'Lock' : pinPrompt.nextAction ? 'Confirm' : 'Unlock'}</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Download confirmation dialog */}
      <AnimatePresence>
        {downloadPrompt && (
          <motion.div className="fixed inset-0 z-[55] flex items-center justify-center" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <div className="absolute inset-0 bg-black/60" onClick={() => setDownloadPrompt(null)} />
            <motion.div className="relative w-[380px] rounded-2xl p-5" style={{ backgroundColor: 'var(--color-bg-tertiary)', border: '1px solid var(--color-border-primary)' }} initial={{ scale: 0.92, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.92, opacity: 0 }}>
              <button onClick={() => setDownloadPrompt(null)} className="absolute top-3 right-3 p-1 text-[var(--color-text-tertiary)] hover:text-[var(--color-text-secondary)]"><X className="w-4 h-4" /></button>
              <div className="flex items-center gap-3 mb-3"><div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ backgroundColor: 'rgba(232,212,77,0.1)' }}><Download className="w-5 h-5" style={{ color: '#e8d44d' }} /></div><div><h3 className="text-sm font-bold" style={{ color: 'var(--color-text-primary)' }}>Browser Engine Required</h3><p className="text-[10px]" style={{ color: 'var(--color-text-tertiary)' }}>Nimbus anti-detect engine</p></div></div>
              <p className="text-xs mb-4" style={{ color: 'var(--color-text-secondary)' }}>Nimbus engine (~500 MB) needs to be downloaded to launch profiles. This is a one-time download.</p>
              <div className="flex gap-2"><button onClick={() => setDownloadPrompt(null)} className="flex-1 py-2 rounded-lg text-xs font-medium" style={{ backgroundColor: 'var(--color-border-primary)', color: 'var(--color-text-secondary)' }}>Cancel</button><button onClick={handleConfirmDownload} className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-semibold btn-shine" style={{ backgroundColor: '#e8d44d', color: 'var(--color-bg-primary)' }}><Download className="w-3.5 h-3.5" />Download & Launch</button></div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Upgrade modal */}
      <AnimatePresence>
        {upgradeReason && (<UpgradeModal key="upgrade" feature={upgradeReason} onClose={() => setUpgradeReason(null)} />)}
      </AnimatePresence>
    </div>
  );
}
