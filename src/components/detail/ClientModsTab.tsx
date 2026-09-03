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

  const [baseSortCol, setBaseSortCol] = useState<'name' | 'author' | 'version' | 'source'>('name');
  const [baseSortDir, setBaseSortDir] = useState<'asc' | 'desc'>('asc');

  const [customSortCol, setCustomSortCol] = useState<
    'name' | 'author' | 'version' | 'source' | 'enabled'
  >('name');
  const [customSortDir, setCustomSortDir] = useState<'asc' | 'desc'>('asc');

  const filteredBaseMods = useMemo(() => {
    const q = baseFilter.trim().toLowerCase();
    const mods = q
      ? instance.basePackMods.filter(m => m.name.toLowerCase().includes(q))
      : [...instance.basePackMods];

    mods.sort((a, b) => {
      let aVal = '';
      let bVal = '';
      if (baseSortCol === 'name') {
        aVal = a.name || '';
        bVal = b.name || '';
      } else if (baseSortCol === 'author') {
        aVal = a.author || '';
        bVal = b.author || '';
      } else if (baseSortCol === 'version') {
        aVal = a.version || '';
        bVal = b.version || '';
      } else if (baseSortCol === 'source') {
        aVal = 'base';
        bVal = 'base';
      }
      const cmp = aVal.localeCompare(bVal, undefined, { sensitivity: 'base' });
      return baseSortDir === 'asc' ? cmp : -cmp;
    });
    return mods;
  }, [instance.basePackMods, baseFilter, baseSortCol, baseSortDir]);

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

  const addCustomMod = async (
    modId: string,
    name: string,
    iconUrl?: string,
    author?: string,
    description?: string
  ) => {
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
        author,
        description,
      };

      await invoke('add_custom_mod', {
        instanceId: instance.id,
        modId: newMod.id,
        name: newMod.name,
        version: newMod.version,
        source: newMod.source,
        iconUrl: newMod.iconUrl || undefined,
        author: newMod.author || undefined,
        description: newMod.description || undefined,
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
                className="rounded-xl overflow-hidden border"
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
                    <table className="w-full table-fixed text-left border-collapse">
                      <thead>
                        <tr
                          className="text-[11px] uppercase tracking-wider"
                          style={{
                            background: 'var(--bg-muted)',
                            color: 'var(--text-muted)',
                            borderBottom: '1px solid var(--border)',
                          }}
                        >
                          <th
                            className="font-medium p-0"
                            aria-sort={
                              baseSortCol === 'name'
                                ? baseSortDir === 'asc'
                                  ? 'ascending'
                                  : 'descending'
                                : 'none'
                            }
                          >
                            <button
                              type="button"
                              className="w-full text-left font-medium px-4 py-2.5 cursor-pointer hover:text-[var(--text-primary)] select-none outline-none focus-visible:bg-[var(--bg-surface)] focus-visible:ring-inset focus-visible:ring-1 focus-visible:ring-[var(--text-muted)]"
                              onClick={() => {
                                if (baseSortCol === 'name')
                                  setBaseSortDir(d => (d === 'asc' ? 'desc' : 'asc'));
                                else {
                                  setBaseSortCol('name');
                                  setBaseSortDir('asc');
                                }
                              }}
                            >
                              Mod {baseSortCol === 'name' && (baseSortDir === 'asc' ? '↑' : '↓')}
                            </button>
                          </th>
                          <th
                            className="font-medium p-0 w-32"
                            aria-sort={
                              baseSortCol === 'author'
                                ? baseSortDir === 'asc'
                                  ? 'ascending'
                                  : 'descending'
                                : 'none'
                            }
                          >
                            <button
                              type="button"
                              className="w-full text-left font-medium px-4 py-2.5 cursor-pointer hover:text-[var(--text-primary)] select-none outline-none focus-visible:bg-[var(--bg-surface)] focus-visible:ring-inset focus-visible:ring-1 focus-visible:ring-[var(--text-muted)]"
                              onClick={() => {
                                if (baseSortCol === 'author')
                                  setBaseSortDir(d => (d === 'asc' ? 'desc' : 'asc'));
                                else {
                                  setBaseSortCol('author');
                                  setBaseSortDir('asc');
                                }
                              }}
                            >
                              Author{' '}
                              {baseSortCol === 'author' && (baseSortDir === 'asc' ? '↑' : '↓')}
                            </button>
                          </th>
                          <th
                            className="font-medium p-0 w-32"
                            aria-sort={
                              baseSortCol === 'version'
                                ? baseSortDir === 'asc'
                                  ? 'ascending'
                                  : 'descending'
                                : 'none'
                            }
                          >
                            <button
                              type="button"
                              className="w-full text-left font-medium px-4 py-2.5 cursor-pointer hover:text-[var(--text-primary)] select-none outline-none focus-visible:bg-[var(--bg-surface)] focus-visible:ring-inset focus-visible:ring-1 focus-visible:ring-[var(--text-muted)]"
                              onClick={() => {
                                if (baseSortCol === 'version')
                                  setBaseSortDir(d => (d === 'asc' ? 'desc' : 'asc'));
                                else {
                                  setBaseSortCol('version');
                                  setBaseSortDir('asc');
                                }
                              }}
                            >
                              Version{' '}
                              {baseSortCol === 'version' && (baseSortDir === 'asc' ? '↑' : '↓')}
                            </button>
                          </th>
                          <th className="font-medium px-4 py-2.5 w-24 text-right">Source</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[var(--border)]">
                        {visibleBaseMods.map((mod, i) => {
                          const parsed = parseModJar(mod.name);
                          const isJarName = mod.name.endsWith('.jar') || mod.name.endsWith('.zip');
                          const displayName = isJarName ? parsed.name : mod.name;
                          const displayVersion =
                            mod.version && mod.version !== 'latest' && mod.version !== 'local'
                              ? mod.version
                              : parsed.version || 'Unknown';
                          const hue = hashHue(displayName);
                          const initials = parsed.initials || displayName.slice(0, 2).toUpperCase();

                          return (
                            <tr
                              key={`base-${i}`}
                              className="group transition-colors"
                              style={{ ':hover': { background: 'var(--bg-muted)' } } as any}
                              title={mod.description || mod.name}
                            >
                              <td className="px-4 py-2.5 flex items-center gap-3">
                                {/* Colour avatar or official icon */}
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
                                    initials
                                  )}
                                </div>
                                <div className="min-w-0 flex-1">
                                  <div className="flex items-center gap-2">
                                    <div
                                      className="text-[12.5px] font-medium truncate"
                                      style={{ color: 'var(--text-primary)' }}
                                    >
                                      {displayName}
                                    </div>
                                  </div>
                                  {mod.description && (
                                    <div
                                      className="text-[11px] truncate"
                                      style={{ color: 'var(--text-muted)', opacity: 0.75 }}
                                    >
                                      {mod.description}
                                    </div>
                                  )}
                                </div>
                              </td>
                              <td
                                className="px-4 py-2.5 text-[11px]"
                                style={{ color: 'var(--text-muted)' }}
                              >
                                {mod.author || '-'}
                              </td>
                              <td
                                className="px-4 py-2.5 text-[11px]"
                                style={{ color: 'var(--text-muted)' }}
                              >
                                v{displayVersion}
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
                    if (
                      e.key === 'Enter' &&
                      !isSearchingMods &&
                      modQuery.length > 2 &&
                      modResults.length > 0
                    ) {
                      const first = modResults[0];
                      addCustomMod(
                        first.id,
                        first.name,
                        first.iconUrl,
                        first.author,
                        first.description
                      );
                    }
                  }}
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
                    {modResults.map((r: SearchResult) => {
                      const resultSc = SOURCE_COLORS[addModSource] || SOURCE_COLORS.local;
                      return (
                        <button
                          key={r.id}
                          className="search-result-item flex items-center justify-between w-full text-left"
                          onClick={() => {
                            addCustomMod(r.id, r.name, r.iconUrl, r.author, r.description);
                          }}
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            {r.iconUrl ? (
                              <img
                                src={r.iconUrl}
                                alt=""
                                className="w-6 h-6 rounded object-cover shrink-0"
                              />
                            ) : (
                              <div
                                className="w-6 h-6 rounded flex items-center justify-center shrink-0 text-[10px] font-bold"
                                style={{
                                  background: 'var(--bg-muted)',
                                  color: 'var(--text-muted)',
                                }}
                              >
                                <Icon name="package" size={12} />
                              </div>
                            )}
                            <div className="min-w-0">
                              <div
                                className="font-medium text-xs truncate"
                                style={{ color: 'var(--text-primary)' }}
                              >
                                {r.name}
                              </div>
                              {r.author && (
                                <div
                                  className="text-[11px] truncate"
                                  style={{ color: 'var(--text-muted)' }}
                                >
                                  by {r.author}
                                </div>
                              )}
                            </div>
                          </div>
                          <div
                            className="text-[11px] px-2.5 py-1 rounded-md flex items-center gap-1 shrink-0 font-medium transition-all"
                            style={{
                              background: resultSc.soft,
                              color: resultSc.accent,
                              border: `1px solid ${resultSc.border}`,
                            }}
                          >
                            <Icon name="plus" size={11} />
                            Add
                          </div>
                        </button>
                      );
                    })}
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
                  className="text-xs px-3.5 py-1.5 font-medium rounded-lg shrink-0 flex items-center gap-1.5 transition-all"
                  style={{
                    background: (SOURCE_COLORS[addModSource] || SOURCE_COLORS.local).soft,
                    color: (SOURCE_COLORS[addModSource] || SOURCE_COLORS.local).accent,
                    border: `1px solid ${(SOURCE_COLORS[addModSource] || SOURCE_COLORS.local).border}`,
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
              className="rounded-xl overflow-hidden border"
              style={{ background: 'var(--bg-surface)', borderColor: 'var(--border)' }}
            >
              <table className="w-full table-fixed text-left border-collapse">
                <thead>
                  <tr
                    className="text-[11px] uppercase tracking-wider"
                    style={{
                      background: 'var(--bg-muted)',
                      color: 'var(--text-muted)',
                      borderBottom: '1px solid var(--border)',
                    }}
                  >
                    <th
                      className="font-medium px-4 py-2.5 w-12 text-center cursor-pointer hover:text-[var(--text-primary)] select-none"
                      onClick={() => {
                        if (customSortCol === 'enabled')
                          setCustomSortDir(d => (d === 'asc' ? 'desc' : 'asc'));
                        else {
                          setCustomSortCol('enabled');
                          setCustomSortDir('asc');
                        }
                      }}
                    >
                      Enable {customSortCol === 'enabled' && (customSortDir === 'asc' ? '↑' : '↓')}
                    </th>
                    <th
                      className="font-medium px-4 py-2.5 cursor-pointer hover:text-[var(--text-primary)] select-none"
                      onClick={() => {
                        if (customSortCol === 'name')
                          setCustomSortDir(d => (d === 'asc' ? 'desc' : 'asc'));
                        else {
                          setCustomSortCol('name');
                          setCustomSortDir('asc');
                        }
                      }}
                    >
                      Mod {customSortCol === 'name' && (customSortDir === 'asc' ? '↑' : '↓')}
                    </th>
                    <th
                      className="font-medium px-4 py-2.5 w-32 cursor-pointer hover:text-[var(--text-primary)] select-none"
                      onClick={() => {
                        if (customSortCol === 'author')
                          setCustomSortDir(d => (d === 'asc' ? 'desc' : 'asc'));
                        else {
                          setCustomSortCol('author');
                          setCustomSortDir('asc');
                        }
                      }}
                    >
                      Author {customSortCol === 'author' && (customSortDir === 'asc' ? '↑' : '↓')}
                    </th>
                    <th
                      className="font-medium px-4 py-2.5 w-32 cursor-pointer hover:text-[var(--text-primary)] select-none"
                      onClick={() => {
                        if (customSortCol === 'version')
                          setCustomSortDir(d => (d === 'asc' ? 'desc' : 'asc'));
                        else {
                          setCustomSortCol('version');
                          setCustomSortDir('asc');
                        }
                      }}
                    >
                      Version {customSortCol === 'version' && (customSortDir === 'asc' ? '↑' : '↓')}
                    </th>
                    <th
                      className="font-medium px-4 py-2.5 w-32 text-center cursor-pointer hover:text-[var(--text-primary)] select-none"
                      onClick={() => {
                        if (customSortCol === 'source')
                          setCustomSortDir(d => (d === 'asc' ? 'desc' : 'asc'));
                        else {
                          setCustomSortCol('source');
                          setCustomSortDir('asc');
                        }
                      }}
                    >
                      Source {customSortCol === 'source' && (customSortDir === 'asc' ? '↑' : '↓')}
                    </th>
                    <th className="font-medium px-4 py-2.5 w-16 text-center">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border)]">
                  {[...instance.customMods]
                    .sort((a, b) => {
                      let cmp = 0;
                      if (customSortCol === 'name')
                        cmp = (a.name || '').localeCompare(b.name || '');
                      else if (customSortCol === 'author')
                        cmp = (a.author || '').localeCompare(b.author || '');
                      else if (customSortCol === 'version')
                        cmp = (a.version || '').localeCompare(b.version || '');
                      else if (customSortCol === 'source')
                        cmp = (a.source || '').localeCompare(b.source || '');
                      else if (customSortCol === 'enabled')
                        cmp = (a.enabled ? 1 : 0) - (b.enabled ? 1 : 0);
                      return customSortDir === 'asc' ? cmp : -cmp;
                    })
                    .map(mod => {
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
                                {mod.description && (
                                  <div
                                    className="text-[11px] truncate"
                                    style={{ color: 'var(--text-muted)', opacity: 0.75 }}
                                  >
                                    {mod.description}
                                  </div>
                                )}
                              </div>
                            </div>
                          </td>
                          <td
                            className="px-4 py-2.5 text-[11px]"
                            style={{ color: 'var(--text-muted)' }}
                          >
                            {mod.author || '-'}
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
                              className="btn-ghost-danger p-1.5 rounded"
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
