import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FolderOpen, Plus, Pencil, Trash2, Check, X, Users } from 'lucide-react';
import WindowControls from './WindowControls';
import { useAppStore } from '../store/StoreContext';

const GROUP_COLORS = ['#e8d44d', '#22c55e', '#3b82f6', '#ef4444', '#a855f7', '#f97316', '#ec4899', '#06b6d4'];

export default function GroupsView() {
  const { groups, profiles, addGroup, updateGroup, deleteGroup, addToast } = useAppStore();
  const [newGroupName, setNewGroupName] = useState('');
  const [newGroupColor, setNewGroupColor] = useState(GROUP_COLORS[0]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editColor, setEditColor] = useState('');

  const handleAddGroup = () => {
    if (!newGroupName.trim()) {
      addToast('error', 'Group name is required');
      return;
    }
    addGroup(newGroupName.trim(), newGroupColor);
    setNewGroupName('');
    setNewGroupColor(GROUP_COLORS[Math.floor(Math.random() * GROUP_COLORS.length)]);
  };

  const handleStartEdit = (groupId: string) => {
    const group = groups.find(g => g.id === groupId);
    if (!group) return;
    setEditingId(groupId);
    setEditName(group.name);
    setEditColor(group.color);
  };

  const handleSaveEdit = () => {
    if (!editingId) return;
    if (!editName.trim()) {
      addToast('error', 'Group name is required');
      return;
    }
    updateGroup(editingId, { name: editName.trim(), color: editColor });
    setEditingId(null);
    addToast('success', 'Group updated');
  };

  const handleDeleteGroup = (groupId: string) => {
    deleteGroup(groupId);
  };

  const getProfileCount = (groupName: string) => {
    return profiles.filter(p => p.group === groupName).length;
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3" style={{ borderBottom: '1px solid var(--color-border-primary)' }}>
        <div className="flex items-center gap-3">
          <h1 className="text-lg font-bold" style={{ color: 'var(--color-text-primary)' }}>Groups</h1>
          <span className="text-xs px-2 py-0.5 rounded-full" style={{ backgroundColor: 'rgba(232,212,77,0.1)', color: '#e8d44d' }}>
            {groups.length}
          </span>
        </div>
        <div className="flex-1 self-stretch titlebar-drag" />
        <WindowControls />
      </div>

      <div className="flex-1 overflow-y-auto p-5 space-y-4">
        {/* Add new group */}
        <div className="rounded-xl p-4" style={{ backgroundColor: 'var(--color-bg-hover-alt)', border: '1px solid var(--color-border-primary)' }}>
          <div className="flex items-center gap-3">
            <input
              type="text"
              value={newGroupName}
              onChange={e => setNewGroupName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleAddGroup()}
              placeholder="New group name..."
              className="flex-1 px-3 py-2 rounded-lg text-sm"
              style={{ backgroundColor: 'var(--color-bg-primary)', border: '1px solid var(--color-border-primary)', color: 'var(--color-text-primary)' }}
            />
            <div className="flex items-center gap-1">
              {GROUP_COLORS.map(c => (
                <button
                  key={c}
                  onClick={() => setNewGroupColor(c)}
                  className="w-6 h-6 rounded-full transition-all duration-150"
                  style={{
                    backgroundColor: c,
                    transform: newGroupColor === c ? 'scale(1.25)' : 'scale(1)',
                    boxShadow: newGroupColor === c ? `0 0 12px ${c}, 0 0 4px ${c}` : 'none',
                    border: newGroupColor === c ? '2px solid rgba(255,255,255,0.5)' : '2px solid transparent',
                  }}
                />
              ))}
            </div>
            <button
              onClick={handleAddGroup}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium"
              style={{ backgroundColor: '#e8d44d', color: 'var(--color-bg-primary)' }}
            >
              <Plus className="w-3.5 h-3.5" />
              Add
            </button>
          </div>
        </div>

        {/* Groups list */}
        <div className="space-y-2">
          <AnimatePresence>
            {groups.map(group => (
              <motion.div
                key={group.id}
                layout
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="flex items-center gap-3 px-4 py-3 rounded-xl transition-colors"
                style={{ backgroundColor: 'var(--color-bg-hover-alt)', border: '1px solid var(--color-border-primary)' }}
                onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--color-border-hover)')}
                onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--color-border-primary)')}
              >
                {editingId === group.id ? (
                  <>
                    <div className="w-8 h-8 rounded-lg" style={{ backgroundColor: editColor }} />
                    <input
                      type="text"
                      value={editName}
                      onChange={e => setEditName(e.target.value)}
                      className="flex-1 px-2 py-1 rounded text-sm"
                      style={{ backgroundColor: 'var(--color-bg-primary)', border: '1px solid #e8d44d', color: 'var(--color-text-primary)' }}
                      onKeyDown={e => e.key === 'Enter' && handleSaveEdit()}
                      autoFocus
                    />
                    <div className="flex items-center gap-1">
                      {GROUP_COLORS.map(c => (
                        <button
                          key={c}
                          onClick={() => setEditColor(c)}
                          className="w-5 h-5 rounded-full transition-all duration-150"
                          style={{
                            backgroundColor: c,
                            transform: editColor === c ? 'scale(1.25)' : 'scale(1)',
                            boxShadow: editColor === c ? `0 0 12px ${c}, 0 0 4px ${c}` : 'none',
                            border: editColor === c ? '2px solid rgba(255,255,255,0.5)' : '2px solid transparent',
                          }}
                        />
                      ))}
                    </div>
                    <button onClick={handleSaveEdit} className="p-1.5 rounded-lg" style={{ color: '#22c55e' }}>
                      <Check className="w-4 h-4" />
                    </button>
                    <button onClick={() => setEditingId(null)} className="p-1.5 rounded-lg" style={{ color: '#ef4444' }}>
                      <X className="w-4 h-4" />
                    </button>
                  </>
                ) : (
                  <>
                    <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: group.color + '22' }}>
                      <FolderOpen className="w-4 h-4" style={{ color: group.color }} />
                    </div>
                    <div className="flex-1">
                      <span className="text-sm font-medium" style={{ color: 'var(--color-text-primary)' }}>{group.name}</span>
                      <div className="flex items-center gap-1 text-xs" style={{ color: 'var(--color-text-tertiary)' }}>
                        <Users className="w-3 h-3" />
                        {getProfileCount(group.name)} profile{getProfileCount(group.name) !== 1 ? 's' : ''}
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => handleStartEdit(group.id)}
                        className="p-1.5 rounded-lg transition-colors"
                        style={{ color: 'var(--color-text-tertiary)' }}
                        onMouseEnter={e => (e.currentTarget.style.backgroundColor = 'var(--color-border-primary)')}
                        onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      {group.name !== 'Default' && (
                        <button
                          onClick={() => handleDeleteGroup(group.id)}
                          className="p-1.5 rounded-lg transition-colors"
                          style={{ color: 'var(--color-text-tertiary)' }}
                          onMouseEnter={e => {
                            e.currentTarget.style.backgroundColor = 'rgba(239,68,68,0.1)';
                            e.currentTarget.style.color = '#ef4444';
                          }}
                          onMouseLeave={e => {
                            e.currentTarget.style.backgroundColor = 'transparent';
                            e.currentTarget.style.color = 'var(--color-text-tertiary)';
                          }}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </>
                )}
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
