import { useState, useMemo } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Icon } from '../Icon';
import { SOURCE_COLORS } from '../../constants';
import { Instance, CustomModItem, ModSource } from '../../types';
import { useToast } from '../../context/ToastContext';
import { getActiveSourcePlugins, SourcePlugin, SearchResult } from '../../plugins';
import { usePluginSearch } from '../../hooks/usePluginSearch';

const BASE_MODS_PAGE_SIZE = 50;

type ModsInnerTab = 'base' | 'custom';

interface ClientModsTabProps {
  instance: Instance;
  onUpdate: (updates: Partial<Instance>) => void;
}

interface ParsedMod {
  name: string;
  version: string | null;
  initials: string;
}

function parseModJar(raw: string): ParsedMod {
  // Strip extension and split on - or +
  const base = raw.replace(/\.(jar|zip)$/i, '');
  const parts = base.split(/[-+]/);

  const nameParts: string[] = [];
  let version: string | null = null;
  let foundVersion = false;

  for (const part of parts) {
    // A part is version-like if it starts with digits + dot
    const isVerLike = /^\d+(\.\d+)+/.test(part);
    if (!foundVersion && isVerLike) {
      foundVersion = true;
      version = part;
    } else if (!foundVersion) {
      nameParts.push(part);
    }
    // Ignore trailing mc-version / loader segments after first version
  }

  // Build a human-readable name: capitalise each word, expand camelCase
  const readableName = nameParts
    .join(' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/_/g, ' ')
    .split(' ')
    .filter(Boolean)
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
    .trim();

  const name = readableName || base;

  // Initials: up to 2 chars from the start of the name words
  const words = name.split(' ').filter(Boolean);
  const initials =
    words.length >= 2 ? (words[0][0] + words[1][0]).toUpperCase() : name.slice(0, 2).toUpperCase();

  return { name, version, initials };
}

// Deterministic hue from a string — gives each mod a unique-ish avatar colour
function hashHue(str: string): number {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) >>> 0;
  return h % 360;
}

export function ClientModsTab({ instance, onUpdate }: ClientModsTabProps) {
  const sc = SOURCE_COLORS[instance.source] || SOURCE_COLORS.local;
  const { addToast } = useToast();

  // Inner tab — default to custom if the user already has custom mods
  const [innerTab, setInnerTab] = useState<ModsInnerTab>(
    instance.customMods.length > 0 ? 'custom' : 'base'
  );

  const [baseFilter, setBaseFilter] = useState('');
  const [baseShowCount, setBaseShowCount] = useState(BASE_MODS_PAGE_SIZE);

  const filteredBaseMods = useMemo(() => {
    const q = baseFilter.trim().toLowerCase();
    return q
      ? instance.basePackMods.filter(m => m.name.toLowerCase().includes(q))
      : instance.basePackMods;
  }, [instance.basePackMods, baseFilter]);

  const visibleBaseMods = filteredBaseMods.slice(0, baseShowCount);

  const [activeSources] = useState<SourcePlugin[]>(() => getActiveSourcePlugins());
  const [addModSource, setAddModSource] = useState<ModSource>(
    () => (activeSources[0]?.id as ModSource) || 'local'
  );
  const [modQuery, setModQuery] = useState('');
  const [showModResults, setShowModResults] = useState(false);
  const [isAddingMod, setIsAddingMod] = useState(false);
  const [manualModName, setManualModName] = useState('');

  const currentSourcePlugin = activeSources.find(s => s.id === addModSource);
  const { results: modResults, isSearching: isSearchingMods } = usePluginSearch(
    currentSourcePlugin,
    modQuery,
    'mod'
  );

  const addCustomMod = async (modId: string, name: string, iconUrl?: string) => {
    if (instance.customMods.some(m => m.id === modId)) {
      addToast(`"${name}" is already added`, 'info');
      return;
    }
    setIsAddingMod(true);
    try {
      let version = 'latest';
      if (currentSourcePlugin?.getLatestVersion) {
        const info = await currentSourcePlugin.getLatestVersion(modId);
        if (info) version = info.versionNumber;
      }
      const newMod: CustomModItem = {
        id: modId,
        name,
        version,
        enabled: true,
        isBase: false,
        source: addModSource,
        iconUrl,
      };

      await invoke('add_custom_mod', {
        instanceId: instance.id,
        modId: newMod.id,
        name: newMod.name,
        version: newMod.version,
        source: newMod.source,
        iconUrl: newMod.iconUrl || undefined,
      });

      onUpdate({ customMods: [...instance.customMods, newMod] });
      setModQuery('');
      setManualModName('');
      setShowModResults(false);
      addToast(`Added "${name}"`, 'success');
    } catch (e) {
      console.error('Failed to resolve/add custom mod:', e);
      addToast(`Failed to add "${name}"`, 'error');
    } finally {
      setIsAddingMod(false);
    }
  };

  const handleAddManual = () => {
    if (!manualModName.trim()) return;
    addCustomMod(`custom-${Date.now()}`, manualModName.trim());
  };

  const toggleCustomMod = async (id: string, currentEnabled: boolean) => {
    try {
      const nextEnabled = !currentEnabled;
      await invoke('toggle_mod_state', {
        instanceId: instance.id,
        modId: id,
        enabled: nextEnabled,
      });
      onUpdate({
        customMods: instance.customMods.map(m =>
          m.id === id ? { ...m, enabled: nextEnabled } : m
        ),
      });
    } catch (e) {
      console.error('Failed to toggle mod:', e);
      addToast('Failed to toggle mod', 'error');
    }
  };

  const removeCustomMod = async (id: string) => {
    try {
      await invoke('remove_custom_mod', { instanceId: instance.id, modId: id });
      onUpdate({
        customMods: instance.customMods.filter(m => m.id !== id),
      });
      addToast('Mod removed', 'success');
    } catch (e) {
      console.error('Failed to remove mod:', e);
      addToast('Failed to remove mod', 'error');
    }
  };

  return (
    <div className="animate-slide-in flex flex-col gap-0">
      {/* ── Inner tab bar ──────────────────────────────────────────────────── */}
      <div
        className="flex items-center gap-1 mb-4 p-1 rounded-xl"
        style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}
      >
        <button
          className="flex-1 flex items-center justify-center gap-2 px-3 py-1.5 rounded-lg text-[12.5px] font-medium transition-all"
          style={
            innerTab === 'base'
              ? {
                  background: 'var(--bg-muted)',
                  color: 'var(--text-primary)',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.15)',
                }
              : { color: 'var(--text-muted)' }
          }
          onClick={() => setInnerTab('base')}
        >
          <Icon name="shield" size={12} />
          Base Mods
          <span className="badge text-[10.5px] px-1.5 py-0.5">{instance.basePackMods.length}</span>
        </button>

        <button
          className="flex-1 flex items-center justify-center gap-2 px-3 py-1.5 rounded-lg text-[12.5px] font-medium transition-all"
          style={
            innerTab === 'custom'
              ? {
                  background: 'var(--bg-muted)',
                  color: 'var(--text-primary)',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.15)',
                }
              : { color: 'var(--text-muted)' }
          }
          onClick={() => setInnerTab('custom')}
        >
          <Icon name="wrench" size={12} />
          Custom Mods
          <span className="badge text-[10.5px] px-1.5 py-0.5">{instance.customMods.length}</span>
        </button>
      </div>

      {/* ── Base Mods tab ───────────────────────────────────────────────────── */}
      {innerTab === 'base' && (
        <div className="flex flex-col gap-3">
          {instance.basePackMods.length === 0 ? (
            <div
              className="p-10 text-center rounded-xl"
              style={{ background: 'var(--bg-surface)', border: '1px dashed var(--border)' }}
            >
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                {instance.status !== 'Ready'
                  ? 'Base pack is currently downloading or processing...'
                  : 'This pack has no base mods listed.'}
              </p>
            </div>
          ) : (
            <>
              {/* Filter input */}
              <div className="relative">
                <div
                  className="absolute left-3 top-1/2 -translate-y-1/2"
                  style={{ color: 'var(--text-muted)' }}
                >
                  <Icon name="search" size={13} />
                </div>
                <input
                  className="form-input text-xs"
                  style={{ paddingLeft: 32 }}
                  placeholder={`Filter ${instance.basePackMods.length} base mods...`}
                  value={baseFilter}
                  onChange={e => {
                    setBaseFilter(e.target.value);
                    setBaseShowCount(BASE_MODS_PAGE_SIZE);
                  }}
                />
              </div>

              <div
                className="rounded-xl overflow-x-auto border"
                style={{ background: 'var(--bg-surface)', borderColor: 'var(--border)' }}
              >
                {filteredBaseMods.length === 0 ? (
                  <div
                    className="px-4 py-8 text-center text-xs"
                    style={{ color: 'var(--text-muted)' }}
                  >
                    No mods match &ldquo;{baseFilter}&rdquo;
                  </div>
                ) : (
                  <>
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr
                          className="text-[11px] uppercase tracking-wider"
                          style={{
                            background: 'var(--bg-muted)',
                            color: 'var(--text-muted)',
                            borderBottom: '1px solid var(--border)',
                          }}
                        >
                          <th className="font-medium px-4 py-2.5">Mod</th>
                          <th className="font-medium px-4 py-2.5 w-32">Version</th>
                          <th className="font-medium px-4 py-2.5 w-24 text-right">Source</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[var(--border)]">
                        {visibleBaseMods.map((mod, i) => {
                          const parsed = parseModJar(mod.name);
                          const hue = hashHue(parsed.name);
                          return (
                            <tr
                              key={`base-${i}`}
                              className="group transition-colors"
                              style={{ ':hover': { background: 'var(--bg-muted)' } } as any}
                              title={mod.name}
                            >
                              <td className="px-4 py-2.5 flex items-center gap-3">
                                {/* Colour avatar or icon */}
                                <div
                                  className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0 text-[10px] font-bold select-none overflow-hidden"
                                  style={
                                    mod.iconUrl
                                      ? { background: 'transparent' }
                                      : {
                                          background: `hsl(${hue} 55% 18%)`,
                                          color: `hsl(${hue} 80% 72%)`,
                                          border: `1px solid hsl(${hue} 55% 28%)`,
                                        }
                                  }
                                >
                                  {mod.iconUrl ? (
                                    <img
                                      src={mod.iconUrl}
                                      alt=""
                                      className="w-full h-full object-cover"
                                    />
                                  ) : (
                                    parsed.initials
                                  )}
                                </div>
                                <div className="min-w-0 flex-1">
                                  <div
                                    className="text-[12.5px] font-medium truncate"
                                    style={{ color: 'var(--text-primary)' }}
                                  >
                                    {parsed.name}
                                  </div>
                                </div>
                              </td>
                              <td
                                className="px-4 py-2.5 text-[11px]"
                                style={{ color: 'var(--text-muted)' }}
                              >
                                {parsed.version ? `v${parsed.version}` : 'Unknown'}
                              </td>
                              <td className="px-4 py-2.5 text-right">
                                <div
                                  className="inline-flex items-center justify-center gap-1 px-1.5 py-0.5 rounded text-[10px] shrink-0"
                                  style={{
                                    background: 'var(--bg-muted)',
                                    color: 'var(--text-muted)',
                                  }}
                                >
                                  <Icon name="lock" size={9} />
                                  base
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>

                    {filteredBaseMods.length > baseShowCount && (
                      <div className="px-3 py-3 flex items-center justify-center">
                        <button
                          className="text-[11.5px] font-medium"
                          style={{ color: sc.accent }}
                          onClick={() => setBaseShowCount(c => c + BASE_MODS_PAGE_SIZE)}
                        >
                          Show{' '}
                          {Math.min(BASE_MODS_PAGE_SIZE, filteredBaseMods.length - baseShowCount)}{' '}
                          more of {filteredBaseMods.length - baseShowCount} remaining
                        </button>
                      </div>
                    )}
                  </>
                )}
              </div>
            </>
          )}
        </div>
      )}

      {/* ── Custom Mods tab ─────────────────────────────────────────────────── */}
      {innerTab === 'custom' && (
        <div className="flex flex-col gap-3">
          {/* Source pill tabs */}
          {activeSources.length > 1 && (
            <div className="flex items-center gap-1.5 flex-wrap">
              {activeSources.map(s => {
                const psc = SOURCE_COLORS[s.id as ModSource] || SOURCE_COLORS.local;
                const isActive = addModSource === s.id;
                return (
                  <button
                    key={s.id}
                    className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11.5px] font-medium transition-all"
                    style={
                      isActive
                        ? {
                            background: psc.soft,
                            color: psc.accent,
                            border: `1px solid ${psc.border}`,
                          }
                        : {
                            background: 'var(--bg-surface)',
                            color: 'var(--text-muted)',
                            border: '1px solid var(--border)',
                          }
                    }
                    onClick={() => {
                      setAddModSource(s.id as ModSource);
                      setModQuery('');
                      setManualModName('');
                      setShowModResults(false);
                    }}
                  >
                    <span
                      className="w-1.5 h-1.5 rounded-full shrink-0"
                      style={{ background: isActive ? psc.accent : 'var(--text-muted)' }}
                    />
                    {s.name}
                  </button>
                );
              })}
            </div>
          )}

          {/* Search / manual add bar */}
          <div
            className="p-3 rounded-xl flex items-center gap-2"
            style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}
          >
            {currentSourcePlugin?.searchMods ? (
              <>
                <div className="relative flex-1">
                  <div
                    className="absolute left-3 top-1/2 -translate-y-1/2"
                    style={{ color: 'var(--text-muted)' }}
                  >
                    {isAddingMod ? (
                      <span style={{ color: sc.accent, fontSize: 10 }}>…</span>
                    ) : (
                      <Icon name="search" size={13} />
                    )}
                  </div>
                  <input
                    className="form-input text-xs"
                    style={{ paddingLeft: 32 }}
                    placeholder={`Search ${currentSourcePlugin.name} mods...`}
                    value={modQuery}
                    disabled={isAddingMod}
                    onChange={e => {
                      setModQuery(e.target.value);
                      setShowModResults(true);
                    }}
                    onFocus={() => setShowModResults(true)}
                    onBlur={() => setShowModResults(false)}
                    onKeyDown={e => {
                      if (e.key === 'Enter' && modQuery.trim()) {
                        addCustomMod(modQuery.trim(), modQuery.trim());
                      }
                    }}
                  />
                  {showModResults && isSearchingMods && (
                    <div className="search-results">
                      <div
                        className="px-3 py-2.5 text-[12px]"
                        style={{ color: 'var(--text-muted)' }}
                      >
                        Searching...
                      </div>
                    </div>
                  )}
                  {showModResults && !isSearchingMods && modResults.length > 0 && (
                    <div className="search-results">
                      {modResults.map((r: SearchResult) => {
                        const resultSc = SOURCE_COLORS[addModSource] || SOURCE_COLORS.local;
                        return (
                          <div
                            key={r.id}
                            className="search-result-item flex items-center justify-between"
                            onMouseDown={e => {
                              e.preventDefault();
                              addCustomMod(r.id, r.name, r.iconUrl);
                            }}
                          >
                            <div>
                              <div className="font-medium" style={{ color: 'var(--text-primary)' }}>
                                {r.name}
                              </div>
                              {r.author && (
                                <div className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                                  by {r.author}
                                </div>
                              )}
                            </div>
                            <button
                              className="btn-accent text-[11px] px-2 py-0.5 rounded flex items-center gap-1 shrink-0"
                              style={{ background: resultSc.accent }}
                            >
                              <Icon name="plus" size={11} />
                              Add
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
                <button
                  className="btn-accent text-xs px-3.5 py-1.5 font-medium shrink-0"
                  style={{
                    background: (SOURCE_COLORS[addModSource] || SOURCE_COLORS.local).accent,
                  }}
                  onClick={() => {
                    if (modQuery.trim()) addCustomMod(modQuery.trim(), modQuery.trim());
                  }}
                  disabled={isAddingMod || !modQuery.trim()}
                >
                  <Icon name="plus" size={13} />
                  <span>Add</span>
                </button>
              </>
            ) : (
              <>
                <input
                  className="form-input text-xs flex-1"
                  placeholder="Mod name..."
                  value={manualModName}
                  disabled={isAddingMod}
                  onChange={e => setManualModName(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleAddManual()}
                />
                <button
                  className="btn-accent text-xs px-3.5 py-1.5 font-medium shrink-0"
                  style={{
                    background: (SOURCE_COLORS[addModSource] || SOURCE_COLORS.local).accent,
                  }}
                  onClick={handleAddManual}
                  disabled={isAddingMod || !manualModName.trim()}
                >
                  <Icon name="plus" size={13} />
                  <span>Add</span>
                </button>
              </>
            )}
          </div>
          {/* Custom mod list */}
          {instance.customMods.length === 0 ? (
            <div
              className="p-10 text-center rounded-xl"
              style={{ background: 'var(--bg-surface)', border: '1px dashed var(--border)' }}
            >
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                No custom mods added yet. Search above to add mods on top of the base pack.
              </p>
            </div>
          ) : (
            <div
              className="rounded-xl overflow-x-auto border"
              style={{ background: 'var(--bg-surface)', borderColor: 'var(--border)' }}
            >
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr
                    className="text-[11px] uppercase tracking-wider"
                    style={{
                      background: 'var(--bg-muted)',
                      color: 'var(--text-muted)',
                      borderBottom: '1px solid var(--border)',
                    }}
                  >
                    <th className="font-medium px-4 py-2.5 w-12 text-center">Enable</th>
                    <th className="font-medium px-4 py-2.5">Mod</th>
                    <th className="font-medium px-4 py-2.5 w-32">Version</th>
                    <th className="font-medium px-4 py-2.5 w-32 text-center">Source</th>
                    <th className="font-medium px-4 py-2.5 w-16 text-center">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border)]">
                  {instance.customMods.map(mod => {
                    const initials = mod.name.match(/[A-Z]/g)?.join('').slice(0, 2) || '';
                    const modSc = SOURCE_COLORS[mod.source] || SOURCE_COLORS.local;
                    const hue = hashHue(mod.name);

                    return (
                      <tr
                        key={mod.id}
                        className="group transition-colors"
                        style={{ opacity: mod.enabled ? 1 : 0.55 }}
                      >
                        <td className="px-4 py-2.5 text-center">
                          <button
                            role="switch"
                            aria-checked={mod.enabled}
                            aria-label={`Toggle ${mod.name}`}
                            className={`theme-toggle-track ${mod.enabled ? 'on' : ''}`}
                            style={mod.enabled ? { background: modSc.accent } : {}}
                            onClick={() => toggleCustomMod(mod.id, mod.enabled)}
                          >
                            <div className="theme-toggle-knob" />
                          </button>
                        </td>
                        <td className="px-4 py-2.5">
                          <div className="flex items-center gap-3">
                            {/* Colour avatar or icon */}
                            <div
                              className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 text-[10px] font-bold select-none overflow-hidden"
                              style={
                                mod.iconUrl
                                  ? { background: 'transparent' }
                                  : {
                                      background: `hsl(${hue} 55% 18%)`,
                                      color: `hsl(${hue} 80% 72%)`,
                                      border: `1px solid hsl(${hue} 55% 28%)`,
                                    }
                              }
                            >
                              {mod.iconUrl ? (
                                <img
                                  src={mod.iconUrl}
                                  alt=""
                                  className="w-full h-full object-cover"
                                />
                              ) : (
                                initials || mod.name.slice(0, 2).toUpperCase()
                              )}
                            </div>

                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2">
                                <div
                                  className="text-[13px] font-medium truncate"
                                  style={{ color: 'var(--text-primary)' }}
                                >
                                  {mod.name}
                                </div>
                              </div>
                            </div>
                          </div>
                        </td>
                        <td
                          className="px-4 py-2.5 text-[11px]"
                          style={{ color: 'var(--text-muted)' }}
                        >
                          v{mod.version}
                        </td>
                        <td className="px-4 py-2.5 text-center">
                          <span
                            className="px-2 py-0.5 text-[10px] rounded font-medium inline-block"
                            style={{ background: modSc.soft, color: modSc.accent }}
                          >
                            {modSc.label}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-center">
                          <button
                            className="btn-ghost p-1.5 rounded text-red-400 hover:text-red-300 hover:bg-red-500/10"
                            onClick={() => removeCustomMod(mod.id)}
                            title="Remove mod"
                          >
                            <Icon name="trash" size={13} />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
