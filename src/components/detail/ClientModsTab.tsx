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

// ── Jar filename parser ────────────────────────────────────────────────────────
// Turns raw filenames like "BOMD-1.7.5-1.20.1.jar" or "fabric-api-0.91.0+1.20.1.jar"
// into a human-readable { name, version } pair for display.
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

// ── Component ──────────────────────────────────────────────────────────────────
export function ClientModsTab({ instance, onUpdate }: ClientModsTabProps) {
  const sc = SOURCE_COLORS[instance.source] || SOURCE_COLORS.local;
  const { addToast } = useToast();

  // Inner tab — default to custom if the user already has custom mods
  const [innerTab, setInnerTab] = useState<ModsInnerTab>(
    instance.customMods.length > 0 ? 'custom' : 'base'
  );

  // ── Base Mods tab state ───────────────────────────────────────────────────
  const [baseFilter, setBaseFilter] = useState('');
  const [baseShowCount, setBaseShowCount] = useState(BASE_MODS_PAGE_SIZE);

  const filteredBaseMods = useMemo(() => {
    const q = baseFilter.trim().toLowerCase();
    return q
      ? instance.basePackMods.filter(m => m.toLowerCase().includes(q))
      : instance.basePackMods;
  }, [instance.basePackMods, baseFilter]);

  const visibleBaseMods = filteredBaseMods.slice(0, baseShowCount);

  // ── Custom Mods draft state ───────────────────────────────────────────────
  // Draft starts from saved state; changes stage locally until Save is clicked.
  // We store the instance ID alongside the draft so we can detect when the user
  // navigates to a different instance. On mismatch, we reset during render (React
  // documents this as the safe alternative to useEffect for derived-from-props state).
  const [{ draftInstanceId, draft }, setDraftState] = useState({
    draftInstanceId: instance.id,
    draft: instance.customMods,
  });
  if (draftInstanceId !== instance.id) {
    setDraftState({ draftInstanceId: instance.id, draft: instance.customMods });
  }
  const setDraft = (updater: CustomModItem[] | ((prev: CustomModItem[]) => CustomModItem[])) => {
    setDraftState(prev => ({
      draftInstanceId: prev.draftInstanceId,
      draft: typeof updater === 'function' ? updater(prev.draft) : updater,
    }));
  };
  const [isSaving, setIsSaving] = useState(false);

  const isDirty = JSON.stringify(draft) !== JSON.stringify(instance.customMods);
  const handleRevert = () => {
    setDraft(instance.customMods);
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const savedIds = new Set(instance.customMods.map(m => m.id));
      const draftIds = new Set(draft.map(m => m.id));

      for (const saved of instance.customMods) {
        if (!draftIds.has(saved.id)) {
          await invoke('remove_custom_mod', { instanceId: instance.id, modId: saved.id });
        }
      }
      for (const mod of draft) {
        if (!savedIds.has(mod.id)) {
          await invoke('add_custom_mod', {
            instanceId: instance.id,
            modId: mod.id,
            name: mod.name,
            version: mod.version,
            source: mod.source,
          });
        }
      }
      for (const mod of draft) {
        const saved = instance.customMods.find(m => m.id === mod.id);
        if (saved && saved.enabled !== mod.enabled) {
          await invoke('toggle_mod_state', {
            instanceId: instance.id,
            modId: mod.id,
            enabled: mod.enabled,
          });
        }
      }

      onUpdate({ customMods: draft });
      addToast('Custom mods saved', 'success');
    } catch (e) {
      console.error('Failed to save custom mods:', e);
      addToast('Failed to save custom mods', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  // ── Add-mod source picker ─────────────────────────────────────────────────
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

  const addModToDraft = async (modId: string, name: string) => {
    if (draft.some(m => m.id === modId)) {
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
      };
      setDraft(prev => [...prev, newMod]);
      setModQuery('');
      setManualModName('');
      setShowModResults(false);
    } catch (e) {
      console.error('Failed to resolve mod version:', e);
      addToast(`Failed to add "${name}"`, 'error');
    } finally {
      setIsAddingMod(false);
    }
  };

  const handleAddManual = () => {
    if (!manualModName.trim()) return;
    addModToDraft(`custom-${Date.now()}`, manualModName.trim());
  };

  const toggleDraftMod = (id: string) => {
    setDraft(prev => prev.map(m => (m.id === id ? { ...m, enabled: !m.enabled } : m)));
  };

  const removeDraftMod = (id: string) => {
    setDraft(prev => prev.filter(m => m.id !== id));
  };

  return (
    <div className="animate-slide-in max-w-3xl flex flex-col gap-0">
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
          <span className="badge text-[10.5px] px-1.5 py-0.5">{draft.length}</span>
          {isDirty && (
            <span
              className="w-1.5 h-1.5 rounded-full shrink-0"
              style={{ background: sc.accent }}
              title="Unsaved changes"
            />
          )}
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
                This pack has no base mods listed.
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

              {/* Mod card list */}
              <div
                className="rounded-xl overflow-hidden divide-y divide-[var(--border)]"
                style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}
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
                    {visibleBaseMods.map((rawName, i) => {
                      const parsed = parseModJar(rawName);
                      const hue = hashHue(parsed.name);
                      return (
                        <div
                          key={`base-${i}`}
                          className="flex items-center gap-3 px-3 py-2.5"
                          title={rawName}
                        >
                          {/* Colour avatar */}
                          <div
                            className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0 text-[10px] font-bold select-none"
                            style={{
                              background: `hsl(${hue} 55% 18%)`,
                              color: `hsl(${hue} 80% 72%)`,
                              border: `1px solid hsl(${hue} 55% 28%)`,
                            }}
                          >
                            {parsed.initials}
                          </div>

                          {/* Name + version */}
                          <div className="min-w-0 flex-1">
                            <div
                              className="text-[12.5px] font-medium truncate"
                              style={{ color: 'var(--text-primary)' }}
                            >
                              {parsed.name}
                            </div>
                            {parsed.version && (
                              <div
                                className="text-[10.5px] mt-0.5"
                                style={{ color: 'var(--text-muted)' }}
                              >
                                v{parsed.version}
                              </div>
                            )}
                          </div>

                          {/* Lock badge */}
                          <div
                            className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] shrink-0"
                            style={{ background: 'var(--bg-muted)', color: 'var(--text-muted)' }}
                          >
                            <Icon name="lock" size={9} />
                            base
                          </div>
                        </div>
                      );
                    })}

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
                />
                {showModResults && isSearchingMods && (
                  <div className="search-results">
                    <div className="px-3 py-2.5 text-[12px]" style={{ color: 'var(--text-muted)' }}>
                      Searching...
                    </div>
                  </div>
                )}
                {showModResults && !isSearchingMods && modResults.length > 0 && (
                  <div className="search-results">
                    {modResults.map((r: SearchResult) => (
                      <div
                        key={r.id}
                        className="search-result-item"
                        onMouseDown={e => {
                          e.preventDefault();
                          addModToDraft(r.id, r.name);
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
                      </div>
                    ))}
                  </div>
                )}
              </div>
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
                  style={{ background: sc.accent }}
                  onClick={handleAddManual}
                  disabled={isAddingMod || !manualModName.trim()}
                >
                  <Icon name="plus" size={13} />
                  <span>Add</span>
                </button>
              </>
            )}
          </div>

          {/* Draft mod list */}
          {draft.length === 0 ? (
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
              className="rounded-xl overflow-hidden divide-y divide-[var(--border)]"
              style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}
            >
              {draft.map(mod => {
                const modSc = SOURCE_COLORS[mod.source] || SOURCE_COLORS.local;
                const isSavedMod = instance.customMods.some(m => m.id === mod.id);
                const hue = hashHue(mod.name);
                const initials = mod.name
                  .split(' ')
                  .filter(Boolean)
                  .slice(0, 2)
                  .map(w => w[0].toUpperCase())
                  .join('');

                return (
                  <div
                    key={mod.id}
                    className="flex items-center justify-between gap-3 px-3 py-2.5"
                    style={{ opacity: mod.enabled ? 1 : 0.55 }}
                  >
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      {/* Colour avatar */}
                      <div
                        className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 text-[10px] font-bold select-none"
                        style={{
                          background: `hsl(${hue} 55% 18%)`,
                          color: `hsl(${hue} 80% 72%)`,
                          border: `1px solid hsl(${hue} 55% 28%)`,
                        }}
                      >
                        {initials || mod.name.slice(0, 2).toUpperCase()}
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <div
                            className="text-[13px] font-medium truncate"
                            style={{ color: 'var(--text-primary)' }}
                          >
                            {mod.name}
                          </div>
                          {!isSavedMod && (
                            <span
                              className="text-[9.5px] font-semibold px-1.5 py-0.5 rounded uppercase tracking-wide shrink-0"
                              style={{ background: sc.soft, color: sc.accent }}
                            >
                              unsaved
                            </span>
                          )}
                        </div>
                        <div
                          className="text-[11px] flex items-center gap-2 mt-0.5"
                          style={{ color: 'var(--text-muted)' }}
                        >
                          <span>v{mod.version}</span>
                          <span
                            className="px-1.5 py-0.5 text-[10px] rounded font-medium"
                            style={{ background: modSc.soft, color: modSc.accent }}
                          >
                            {modSc.label}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2.5 shrink-0">
                      <button
                        role="switch"
                        aria-checked={mod.enabled}
                        aria-label={`Toggle ${mod.name}`}
                        className={`theme-toggle-track ${mod.enabled ? 'on' : ''}`}
                        style={mod.enabled ? { background: modSc.accent } : {}}
                        onClick={() => toggleDraftMod(mod.id)}
                      >
                        <div className="theme-toggle-knob" />
                      </button>
                      <button
                        className="btn-ghost p-1.5 rounded text-red-400 hover:text-red-300 hover:bg-red-500/10"
                        onClick={() => removeDraftMod(mod.id)}
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

          {/* Save / Revert footer */}
          <div className="flex items-center justify-end gap-2 pt-1">
            <button
              className="btn-ghost text-xs px-3 py-1.5"
              onClick={handleRevert}
              disabled={!isDirty || isSaving}
              style={{ opacity: isDirty && !isSaving ? 1 : 0.4 }}
            >
              Revert
            </button>
            <button
              className="btn-accent text-xs px-3.5 py-1.5 font-medium"
              style={{
                background: isDirty && !isSaving ? sc.accent : undefined,
                opacity: isDirty && !isSaving ? 1 : 0.4,
              }}
              onClick={handleSave}
              disabled={!isDirty || isSaving}
            >
              {isSaving ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
