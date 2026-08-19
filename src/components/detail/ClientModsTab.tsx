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
  const sc = SOURCE_COLORS[instance.source] || SOURCE_COLORS.local;

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

  const removeMod = async (id: string) => {
    try {
      await invoke('remove_custom_mod', {
        instanceId: instance.id,
        modId: id,
      });
      onUpdate({
        customMods: instance.customMods.filter(m => m.id !== id),
      });
    } catch (e) {
      console.error('Failed to remove custom mod:', e);
    }
  };

  const addCustomMod = async () => {
    if (!newModName.trim()) return;
    const modId = `custom-${Date.now()}`;
    const name = newModName.trim();
    try {
      await invoke('add_custom_mod', {
        instanceId: instance.id,
        modId,
        name,
        source: addModSource,
      });
      const newMod: CustomModItem = {
        id: modId,
        name,
        version: 'latest',
        enabled: true,
        isBase: false,
        source: addModSource,
      };
      onUpdate({ customMods: [...instance.customMods, newMod] });
      setNewModName('');
    } catch (e) {
      console.error('Failed to add custom mod:', e);
    }
  };

  return (
    <div className="animate-slide-in max-w-3xl flex flex-col gap-6">
      {/* Add Custom Mod Bar */}
      <div
        className="p-3 rounded-xl flex items-center gap-3"
        style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}
      >
        <select
          className="form-select text-xs"
          style={{ width: 'auto', minWidth: 120 }}
          value={addModSource}
          onChange={e => setAddModSource(e.target.value as ModSource)}
        >
          <option value="modrinth">Modrinth</option>
          <option value="curseforge">CurseForge</option>
          <option value="local">Local File</option>
        </select>
        <input
          className="form-input text-xs flex-1"
          placeholder="Add mod name or slug..."
          value={newModName}
          onChange={e => setNewModName(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && addCustomMod()}
        />
        <button
          className="btn-accent text-xs px-3.5 py-1.5 font-medium shrink-0"
          style={{ background: sc.accent }}
          onClick={addCustomMod}
        >
          <Icon name="plus" size={13} />
          <span>Add Mod</span>
        </button>
      </div>

      {/* Base Pack Mods */}
      {instance.basePackMods.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <Icon name="shield" size={14} style={{ color: 'var(--text-muted)' }} />
            <span className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
              Base Pack Mods
            </span>
            <span className="badge text-[10.5px] px-1.5 py-0.2">
              {instance.basePackMods.length}
            </span>
          </div>

          <div
            className="rounded-xl overflow-hidden divide-y divide-[var(--border)]"
            style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}
          >
            {instance.basePackMods.map((modName, i) => (
              <div key={`base-${i}`} className="p-3 flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <Icon
                    name="lock"
                    size={13}
                    style={{ color: 'var(--text-muted)', flexShrink: 0 }}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="text-[13px] font-medium text-[var(--text-primary)] truncate">
                      {modName}
                    </div>
                    <div className="text-[11px] text-[var(--text-muted)]">
                      Upstream base package
                    </div>
                  </div>
                </div>
                <span className="text-[11px] text-[var(--text-muted)] font-mono shrink-0">
                  Locked
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Custom Mods */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <Icon name="wrench" size={14} style={{ color: sc.accent }} />
          <span className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
            Custom Added Mods
          </span>
          <span className="badge text-[10.5px] px-1.5 py-0.2">{instance.customMods.length}</span>
        </div>

        {instance.customMods.length === 0 ? (
          <div
            className="p-8 text-center rounded-xl"
            style={{ background: 'var(--bg-surface)', border: '1px dashed var(--border)' }}
          >
            <p className="text-xs text-[var(--text-muted)]">
              No custom mods added yet. Use the search bar above to add modifications on top of the
              base pack.
            </p>
          </div>
        ) : (
          <div
            className="rounded-xl overflow-hidden divide-y divide-[var(--border)]"
            style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}
          >
            {instance.customMods.map(mod => {
              const modSc = SOURCE_COLORS[mod.source] || SOURCE_COLORS.local;
              return (
                <div key={mod.id} className="p-3 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <div
                      className="w-4 h-4 rounded flex items-center justify-center shrink-0"
                      style={{ background: modSc.soft, border: `1px solid ${modSc.border}` }}
                    >
                      <Icon name="plus" size={10} style={{ color: modSc.accent }} />
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="text-[13px] font-medium text-[var(--text-primary)] truncate">
                        {mod.name}
                      </div>
                      <div className="text-[11px] text-[var(--text-muted)] flex items-center gap-2">
                        <span>Custom mod &middot; {mod.version}</span>
                        <span
                          className="px-1.5 py-0.2 text-[10px] rounded font-medium"
                          style={{ background: modSc.soft, color: modSc.accent }}
                        >
                          {modSc.label}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 shrink-0">
                    <button
                      role="switch"
                      aria-checked={mod.enabled}
                      aria-label={`Toggle ${mod.name}`}
                      className={`theme-toggle-track ${mod.enabled ? 'on' : ''}`}
                      style={mod.enabled ? { background: modSc.accent } : {}}
                      onClick={() => toggleMod(mod.id)}
                    >
                      <div className="theme-toggle-knob" />
                    </button>
                    <button
                      className="btn-ghost p-1.5 rounded text-red-400 hover:text-red-300 hover:bg-red-500/10"
                      onClick={() => removeMod(mod.id)}
                      title="Remove mod"
                    >
                      <Icon name="trash" size={13} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
