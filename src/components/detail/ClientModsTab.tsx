import { useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Icon } from '../Icon';
import { SOURCE_COLORS } from '../../constants';
import { Instance, CustomModItem, ModSource } from '../../types';

interface ClientModsTabProps {
  instance: Instance;
  onUpdate: (updates: Partial<Instance>) => void;
}

export function ClientModsTab({ instance, onUpdate }: ClientModsTabProps) {
  const [newModName, setNewModName] = useState('');
  const [addModSource, setAddModSource] = useState<ModSource>('modrinth');

  const toggleMod = async (id: string) => {
    const mod = instance.customMods.find(m => m.id === id);
    if (!mod) return;
    try {
      await invoke('toggle_mod_state', {
        instanceId: instance.id,
        modId: id,
        enabled: !mod.enabled,
      });
      onUpdate({
        customMods: instance.customMods.map(m => (m.id === id ? { ...m, enabled: !m.enabled } : m)),
      });
    } catch (e) {
      console.error('Failed to toggle mod state:', e);
    }
  };

  const removeMod = (id: string) => {
    onUpdate({
      customMods: instance.customMods.filter(m => m.id !== id),
    });
  };

  const addCustomMod = () => {
    if (!newModName.trim()) return;
    const newMod: CustomModItem = {
      id: `custom-${Date.now()}`,
      name: newModName.trim(),
      version: 'latest',
      enabled: true,
      isBase: false,
      source: addModSource,
    };
    onUpdate({ customMods: [...instance.customMods, newMod] });
    setNewModName('');
  };

  return (
    <div className="animate-slide-in max-w-2xl">
      <div className="add-mod-bar">
        <select
          className="form-select"
          value={addModSource}
          onChange={e => setAddModSource(e.target.value as ModSource)}
        >
          <option value="modrinth">Modrinth</option>
          <option value="curseforge">CurseForge</option>
          <option value="local">Local File</option>
        </select>
        <input
          className="form-input"
          placeholder="Search or add mod..."
          value={newModName}
          onChange={e => setNewModName(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && addCustomMod()}
        />
        <button
          className="btn-accent"
          onClick={addCustomMod}
          style={{ padding: '5px 12px', fontSize: 12 }}
        >
          <Icon name="plus" size={13} />
          Add
        </button>
      </div>

      {instance.basePackMods.length > 0 && (
        <div className="mb-6">
          <div className="flex items-center gap-2 mb-3">
            <Icon name="shield" size={14} style={{ color: 'var(--text-muted)' }} />
            <span
              className="text-xs font-semibold uppercase tracking-wider"
              style={{ color: 'var(--text-muted)' }}
            >
              Base Pack Mods
            </span>
            <span className="badge" style={{ fontSize: 10 }}>
              {instance.basePackMods.length}
            </span>
          </div>
          {instance.basePackMods.map((modName, i) => (
            <div key={`base-${i}`} className="mod-row group">
              <div className="flex items-center gap-3">
                <Icon name="lock" size={13} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
                <div>
                  <div className="text-[13px] font-medium" style={{ color: 'var(--text-primary)' }}>
                    {modName}
                  </div>
                  <div className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                    Base pack &middot; &mdash;
                  </div>
                </div>
              </div>
              <div
                className="relative flex items-center justify-center"
                title="Base pack mods are managed by the upstream modpack and cannot be disabled directly"
              >
                <button className="toggle-track opacity-50 cursor-not-allowed">
                  <div className="toggle-knob" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <div>
        <div className="flex items-center gap-2 mb-3">
          <Icon name="wrench" size={14} style={{ color: 'var(--accent)' }} />
          <span
            className="text-xs font-semibold uppercase tracking-wider"
            style={{ color: 'var(--text-muted)' }}
          >
            Custom Mods
          </span>
          <span className="badge" style={{ fontSize: 10 }}>
            {instance.customMods.length}
          </span>
        </div>
        {instance.customMods.length === 0 ? (
          <div className="py-8 text-center">
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
              No custom mods added yet
            </p>
          </div>
        ) : (
          instance.customMods.map(mod => (
            <div key={mod.id} className="mod-row">
              <div className="flex items-center gap-3">
                <div
                  style={{
                    width: 13,
                    height: 13,
                    borderRadius: 3,
                    background: SOURCE_COLORS[mod.source]?.soft || 'var(--bg-muted)',
                    border: `1px solid ${SOURCE_COLORS[mod.source]?.accent || 'var(--border)'}30`,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                  }}
                >
                  <Icon
                    name="plus"
                    size={8}
                    style={{ color: SOURCE_COLORS[mod.source]?.accent || 'var(--text-muted)' }}
                  />
                </div>
                <div className="flex items-center gap-2.5">
                  <div>
                    <div
                      className="text-[13px] font-medium"
                      style={{ color: 'var(--text-primary)' }}
                    >
                      {mod.name}
                    </div>
                    <div className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                      Custom &middot; {mod.version}
                    </div>
                  </div>
                  <span className={`source-badge source-badge-${mod.source}`}>
                    <span className="source-badge-dot" />
                    {SOURCE_COLORS[mod.source]?.label || 'Local'}
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  className={`toggle-track ${mod.enabled ? SOURCE_COLORS[mod.source]?.toggleClass || 'on-local' : ''}`}
                  onClick={() => toggleMod(mod.id)}
                >
                  <div className="toggle-knob" />
                </button>
                <button className="btn-ghost" onClick={() => removeMod(mod.id)} title="Remove mod">
                  <Icon name="trash" size={13} />
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
