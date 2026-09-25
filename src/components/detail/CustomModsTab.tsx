import { useState, useEffect, useMemo, startTransition } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Icon } from '../Icon';
import { ModNameLink } from './ModNameLink';
import { SOURCE_COLORS } from '../../constants';
import { Instance, InstanceMod, ModSource } from '../../types';
import { useToast } from '../../context/ToastContext';
import { appLog } from '../../lib/appLog';
import {
  getActiveSourcePlugins,
  isServerExporterEnabled,
  SourcePlugin,
  SearchResult,
} from '../../plugins';
import { usePluginSearch } from '../../hooks/usePluginSearch';
import {
  jarLeaf,
  formatBytes,
  displayModVersion,
  compareModName,
  modMatchesQuery,
  modListToText,
} from './modListFormat';
import { checkPackUpdates, loaderFacet } from '../../lib/packUpdates';
import { applyOneCustomModUpdate } from '../../lib/applyPackUpdates';
import {
  installedModIds,
  missingRequiredDependencies,
  conflictingMods,
} from '../../lib/modDependencies';
import type { PackVersionInfo } from '../../plugins';
import { open } from '@tauri-apps/plugin-dialog';

interface CustomModsTabProps {
  instance: Instance;
  onUpdate: (updates: Partial<Instance>) => void;
}

function hashHue(str: string): number {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) >>> 0;
  return h % 360;
}

function pickDefaultSource(sources: SourcePlugin[]): ModSource {
  const withSearch = sources.find(s => !!s.searchMods);
  return ((withSearch ?? sources[0])?.id as ModSource) || 'modrinth';
}

export function CustomModsTab({ instance, onUpdate }: CustomModsTabProps) {
  const sc = SOURCE_COLORS[instance.source] || SOURCE_COLORS.local;
  const { addToast } = useToast();
  const [serverPluginOn, setServerPluginOn] = useState(() => isServerExporterEnabled());

  const [activeSources, setActiveSources] = useState<SourcePlugin[]>(() =>
    getActiveSourcePlugins()
  );
  const [addModSource, setAddModSource] = useState<ModSource>(() =>
    pickDefaultSource(getActiveSourcePlugins())
  );
  const [modQuery, setModQuery] = useState('');
  const [showModResults, setShowModResults] = useState(false);
  const [isAddingMod, setIsAddingMod] = useState(false);
  const [sortCol, setSortCol] = useState<'name' | 'author' | 'version' | 'source' | 'enabled'>(
    'name'
  );
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [listQuery, setListQuery] = useState('');
  const [modUpdates, setModUpdates] = useState<Record<string, PackVersionInfo>>({});
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [checkingUpdates, setCheckingUpdates] = useState(false);

  useEffect(() => {
    const sync = () => {
      const sources = getActiveSourcePlugins();
      setActiveSources(sources);
      setServerPluginOn(isServerExporterEnabled());
      setAddModSource(prev =>
        sources.some(s => s.id === prev) ? prev : pickDefaultSource(sources)
      );
    };
    sync();
    window.addEventListener('packweaver_plugins_changed', sync);
    return () => window.removeEventListener('packweaver_plugins_changed', sync);
  }, []);

  const refreshCustomUpdates = async (isStale?: () => boolean) => {
    if (checkingUpdates) return;
    setCheckingUpdates(true);
    try {
      const result = await checkPackUpdates(instance);
      if (isStale?.()) return;
      const map: Record<string, PackVersionInfo> = {};
      for (const c of result.customs) map[c.mod.id] = c.latest;
      setModUpdates(map);
    } catch (e) {
      if (isStale?.()) return;
      appLog('error', 'updates', `Update scan failed for ${instance.id}: ${String(e)}`);
      addToast(`Could not check for mod updates: ${String(e)}`, 'error');
    } finally {
      if (!isStale?.()) setCheckingUpdates(false);
    }
  };

  useEffect(() => {
    // A scan started for pack A must not write into pack B's state.
    let cancelled = false;
    const isStale = () => cancelled;
    // startTransition: avoid react-hooks/set-state-in-effect on sync setState
    if (instance.customMods.some(m => m.source === 'modrinth')) {
      startTransition(() => {
        void refreshCustomUpdates(isStale);
      });
    } else {
      startTransition(() => setModUpdates({}));
    }
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- re-scan when custom list identity changes
  }, [instance.id, instance.customMods.length, instance.mcVersion, instance.loader]);

  /**
   * Tell the user when a freshly added mod needs something the pack does not
   * have. Modrinth reports this per version, so a pack can otherwise be
   * exported missing a hard requirement and only fail at launch.
   */
  const reportDependencyIssues = async (
    version: PackVersionInfo | null,
    modName: string,
    customsAfterAdd: InstanceMod[]
  ) => {
    try {
      const installed = installedModIds({
        basePackMods: instance.basePackMods,
        customMods: customsAfterAdd,
      });
      const missing = missingRequiredDependencies(version, installed);
      const conflicts = conflictingMods(version, [...instance.basePackMods, ...customsAfterAdd]);

      if (conflicts.length > 0) {
        addToast(
          `"${modName}" is marked incompatible with ${conflicts.map(m => m.name).join(', ')}`,
          'error'
        );
      }
      if (missing.length === 0) return;

      // Ids alone are useless in a toast; ask the provider for titles, but do
      // not let a failed lookup swallow the warning itself.
      const plugin = getActiveSourcePlugins().find(p => p.id === 'modrinth');
      const named = await Promise.all(
        missing.map(async dep => {
          if (!plugin?.getProjectDetails) return dep.projectId;
          try {
            const details = await plugin.getProjectDetails(dep.projectId);
            return details?.title || dep.projectId;
          } catch {
            return dep.projectId;
          }
        })
      );
      addToast(
        `"${modName}" requires ${named.join(', ')} — add ${named.length === 1 ? 'it' : 'them'} or the pack will not launch`,
        'error'
      );
    } catch (e) {
      appLog('warn', 'mods', `Dependency check failed for ${modName}: ${String(e)}`);
    }
  };

  const updateOneCustom = async (mod: InstanceMod, latest: PackVersionInfo) => {
    if (updatingId) return;
    setUpdatingId(mod.id);
    try {
      const applied = await applyOneCustomModUpdate({
        instance,
        mod,
        latest,
        serverOn: serverPluginOn,
      });
      onUpdate({ customMods: applied.updatedMods });
      setModUpdates(prev => {
        const next = { ...prev };
        delete next[mod.id];
        return next;
      });
      addToast(
        serverPluginOn && applied.serverLayered > 0
          ? `Updated ${mod.name} → ${latest.versionNumber} (client + server if present)`
          : `Updated ${mod.name} → ${latest.versionNumber}`,
        'success'
      );
    } catch (e) {
      addToast(`Update failed: ${e}`, 'error');
    } finally {
      setUpdatingId(null);
    }
  };

  const currentSourcePlugin = activeSources.find(s => s.id === addModSource);
  const loaders = instance.loader ? [loaderFacet(instance.loader)] : undefined;
  const { results: modResults, isSearching: isSearchingMods } = usePluginSearch(
    currentSourcePlugin,
    modQuery,
    'mod',
    {
      loaders,
      gameVersions: instance.mcVersion ? [instance.mcVersion] : undefined,
    }
  );

  const copyModList = async (mods: { enabled?: boolean }[], label: string) => {
    const text = modListToText(mods as Parameters<typeof modListToText>[0], {
      includeDisabled: false,
    });
    try {
      await navigator.clipboard.writeText(text || '(no enabled mods)');
      addToast(`Copied ${mods.filter(m => m.enabled !== false).length} ${label}`, 'success');
    } catch (e) {
      appLog('error', 'mods', `Clipboard write failed: ${String(e)}`);
      addToast('Could not copy to clipboard', 'error');
    }
  };

  const sorted = useMemo(() => {
    const mods = instance.customMods.filter(m => modMatchesQuery(m, listQuery));
    mods.sort((a, b) => {
      let cmp = 0;
      if (sortCol === 'name') cmp = compareModName(a.name || '', b.name || '');
      else if (sortCol === 'author') cmp = compareModName(a.author || '', b.author || '');
      else if (sortCol === 'version')
        cmp = (a.version || '').localeCompare(b.version || '', undefined, { sensitivity: 'base' });
      else if (sortCol === 'source')
        cmp = (a.source || '').localeCompare(b.source || '', undefined, { sensitivity: 'base' });
      else if (sortCol === 'enabled') cmp = (a.enabled ? 1 : 0) - (b.enabled ? 1 : 0);
      return sortDir === 'asc' ? cmp : -cmp;
    });
    return mods;
  }, [instance.customMods, sortCol, sortDir, listQuery]);

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
    if (instance.basePackMods.some(m => m.id === modId)) {
      addToast(`"${name}" is already in the base pack — toggle it there`, 'info');
      return;
    }
    setIsAddingMod(true);
    try {
      let version = '';
      let versionId: string | undefined;
      let fileName: string | undefined;
      let side: 'client' | 'server' | 'both' = 'both';
      let enabledClient = true;
      let enabledServer = true;

      let resolved: PackVersionInfo | null = null;
      if (currentSourcePlugin?.getLatestVersion) {
        resolved = await currentSourcePlugin.getLatestVersion(modId);
        if (resolved) {
          version = resolved.versionNumber;
          versionId = resolved.versionId;
          fileName = resolved.primaryFilename;
        }
      }
      if (!version.trim()) {
        addToast(`Could not resolve a version for "${name}" — try again later`, 'error');
        return;
      }
      if (currentSourcePlugin?.getProjectDetails) {
        const details = await currentSourcePlugin.getProjectDetails(modId);
        if (details) {
          const clientOk = details.clientSide !== 'unsupported';
          const serverOk = details.serverSide !== 'unsupported';
          if (clientOk && serverOk) side = 'both';
          else if (clientOk) side = 'client';
          else if (serverOk) side = 'server';
          enabledClient = clientOk;
          enabledServer = serverOk;
        }
      }

      const newMod: InstanceMod = {
        id: modId,
        name,
        version,
        versionId,
        enabled: enabledClient,
        enabledServer,
        side,
        isBase: false,
        source: addModSource,
        iconUrl,
        author,
        description,
        fileName,
      };

      await invoke('add_custom_mod', {
        instanceId: instance.id,
        modId: newMod.id,
        name: newMod.name,
        version,
        versionId,
        source: newMod.source,
        iconUrl: newMod.iconUrl || undefined,
        author: newMod.author || undefined,
        description: newMod.description || undefined,
        fileName: fileName || undefined,
        side,
      });

      onUpdate({
        customMods: [...instance.customMods, newMod],
        customModCount: instance.customModCount + 1,
        totalModCount: instance.totalModCount + 1,
      });
      setModQuery('');
      setShowModResults(false);
      addToast(`Added "${name}"`, 'success');
      void reportDependencyIssues(resolved, name, [...instance.customMods, newMod]);
    } catch (e) {
      console.error('Failed to resolve/add custom mod:', e);
      addToast(`Failed to add "${name}": ${e}`, 'error');
    } finally {
      setIsAddingMod(false);
    }
  };

  const handleAddManual = async () => {
    try {
      const file = await open({
        multiple: false,
        filters: [{ name: 'Minecraft mod', extensions: ['jar'] }],
      });
      if (!file || Array.isArray(file)) return;
      const path = String(file);
      const leaf = path.replace(/\\/g, '/').split('/').pop() || path;
      const name = leaf.replace(/\.jar$/i, '') || leaf;
      const modId = `local-${crypto.randomUUID()}`;
      setIsAddingMod(true);
      try {
        await invoke('add_custom_mod', {
          instanceId: instance.id,
          modId,
          name,
          version: 'local',
          source: 'local',
          fileName: path,
          side: 'both',
        });
        onUpdate({
          customMods: [
            ...instance.customMods,
            {
              id: modId,
              name,
              version: 'local',
              enabled: true,
              enabledServer: true,
              side: 'both',
              isBase: false,
              source: 'local',
              fileName: leaf,
            },
          ],
          customModCount: instance.customModCount + 1,
          totalModCount: instance.totalModCount + 1,
        });
        addToast(`Added "${name}" — run Layer custom mods to place it on disk`, 'success');
      } catch (e) {
        addToast(`Failed to add jar: ${e}`, 'error');
      } finally {
        setIsAddingMod(false);
      }
    } catch (e) {
      addToast(`Could not open file picker: ${e}`, 'error');
    }
  };

  const toggleSide = async (id: string, side: 'client' | 'server', current: boolean) => {
    const mod = instance.customMods.find(m => m.id === id);
    const modSide = (mod?.side || 'both').toLowerCase();
    if (side === 'client' && modSide === 'server') return;
    if (side === 'server' && modSide === 'client') return;
    try {
      const next = !current;
      await invoke('toggle_mod_state', {
        instanceId: instance.id,
        modId: id,
        enabled: next,
        side,
      });
      onUpdate({
        customMods: instance.customMods.map(m =>
          m.id === id
            ? side === 'server'
              ? {
                  ...m,
                  enabledServer: next,
                  onDiskServer: next ? m.onDiskServer : false,
                }
              : {
                  ...m,
                  enabled: next,
                  onDiskClient: next ? m.onDiskClient : false,
                }
            : m
        ),
      });
      if (next) {
        addToast(
          `Enabled for ${side}. Run ${side === 'server' ? 'Rebuild server' : 'Layer custom mods'} from Overview to place it on disk.`,
          'info'
        );
      }
    } catch (e) {
      addToast(`Failed to toggle: ${e}`, 'error');
    }
  };

  const removeCustomMod = async (id: string) => {
    try {
      await invoke('remove_custom_mod', { instanceId: instance.id, modId: id });
      onUpdate({
        customMods: instance.customMods.filter(m => m.id !== id),
        customModCount: Math.max(0, instance.customModCount - 1),
        totalModCount: Math.max(0, instance.totalModCount - 1),
      });
      addToast('Mod removed', 'success');
    } catch (e) {
      addToast(`Failed to remove: ${e}`, 'error');
    }
  };

  return (
    <div className="animate-slide-in flex flex-col gap-3">
      {activeSources.length > 1 && (
        <div className="flex items-center gap-1.5 flex-wrap">
          {activeSources.map(s => {
            const psc = SOURCE_COLORS[s.id as ModSource] || SOURCE_COLORS.local;
            const isActive = addModSource === s.id;
            return (
              <button
                key={s.id}
                className="flex items-center gap-1.5 px-2.5 py-1 text-[11.5px] font-medium transition-all"
                style={
                  isActive
                    ? {
                        background: psc.soft,
                        color: psc.accent,
                        border: `1px solid ${psc.border}`,
                        borderRadius: 'var(--radius-sm)',
                      }
                    : {
                        background: 'var(--bg-surface)',
                        color: 'var(--text-muted)',
                        border: '1px solid var(--border)',
                        borderRadius: 'var(--radius-sm)',
                      }
                }
                onClick={() => {
                  setAddModSource(s.id as ModSource);
                  setModQuery('');
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
                      onMouseDown={e => e.preventDefault()}
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
                        className="text-[11px] px-2.5 py-1 rounded-md flex items-center gap-1 shrink-0 font-medium"
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
            <button
              className="form-input text-xs flex-1 text-left"
              disabled={isAddingMod}
              onClick={() => void handleAddManual()}
              style={{ color: 'var(--text-secondary)' }}
            >
              Choose a .jar file…
            </button>
            <button
              className="text-xs px-3.5 py-1.5 font-medium rounded-lg shrink-0 flex items-center gap-1.5"
              style={{
                background: (SOURCE_COLORS[addModSource] || SOURCE_COLORS.local).soft,
                color: (SOURCE_COLORS[addModSource] || SOURCE_COLORS.local).accent,
                border: `1px solid ${(SOURCE_COLORS[addModSource] || SOURCE_COLORS.local).border}`,
              }}
              onClick={() => void handleAddManual()}
              disabled={isAddingMod}
            >
              <Icon name="plus" size={13} />
              <span>Add jar</span>
            </button>
          </>
        )}
      </div>

      {instance.customMods.length === 0 ? (
        <div className="p-10 text-center loom-panel">
          <p className="text-[13px] py-2" style={{ color: 'var(--text-secondary)' }}>
            No custom mods yet. Search above to layer mods on the base pack (client and/or server).
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
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
              aria-label="Search custom mods"
              placeholder={`Search ${instance.customMods.length} custom mods by name, author, or file…`}
              value={listQuery}
              onChange={e => setListQuery(e.target.value)}
            />
          </div>
          <div className="flex items-center justify-between gap-2">
            <button
              type="button"
              className="btn-ghost text-[11px] px-2 py-0.5 shrink-0"
              onClick={() => void copyModList(instance.customMods, 'custom mods')}
              title="Copy the enabled custom mods as plain text"
            >
              Copy list
            </button>
            <p className="text-[12.5px] text-[var(--text-secondary)]">
              {Object.keys(modUpdates).length > 0
                ? `${Object.keys(modUpdates).length} update${Object.keys(modUpdates).length === 1 ? '' : 's'} available — use Update on a row, or Overview for base + customs`
                : 'Row Update applies one custom. Base pack updates live on Overview.'}
            </p>
          </div>
          <div
            className="loom-panel overflow-x-auto"
            style={{ background: 'var(--bg-surface)', borderColor: 'var(--border)' }}
          >
            {sorted.length === 0 ? (
              <div className="px-4 py-8 text-center text-xs" style={{ color: 'var(--text-muted)' }}>
                No mods match &ldquo;{listQuery}&rdquo;
              </div>
            ) : (
              <table className="data-table w-full min-w-[960px] table-fixed text-left border-collapse">
                <thead>
                  <tr
                    className="text-[11px] uppercase tracking-wider"
                    style={{
                      background: 'var(--bg-muted)',
                      color: 'var(--text-muted)',
                      borderBottom: '1px solid var(--border)',
                    }}
                  >
                    <th className="font-medium px-3 py-2.5 w-14 text-center">Client</th>
                    {serverPluginOn && (
                      <th className="font-medium px-3 py-2.5 w-14 text-center">Server</th>
                    )}
                    <th
                      className="font-medium px-3 py-2.5 cursor-pointer hover:text-[var(--text-primary)] select-none"
                      onClick={() => {
                        if (sortCol === 'name') setSortDir(d => (d === 'asc' ? 'desc' : 'asc'));
                        else {
                          setSortCol('name');
                          setSortDir('asc');
                        }
                      }}
                    >
                      Mod {sortCol === 'name' && (sortDir === 'asc' ? '↑' : '↓')}
                    </th>
                    <th className="font-medium px-3 py-2.5 w-24">Author</th>
                    <th className="font-medium px-3 py-2.5 w-16 text-center">Side</th>
                    <th className="font-medium px-3 py-2.5 w-24 text-center">Source</th>
                    <th className="font-medium px-3 py-2.5 w-44">File</th>
                    <th className="font-medium px-3 py-2.5 w-24">Version</th>
                    <th className="font-medium px-3 py-2.5 w-16 text-right">Size</th>
                    <th className="font-medium px-3 py-2.5 w-24 text-center">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border)]">
                  {sorted.map(mod => {
                    const initials = mod.name.match(/[A-Z]/g)?.join('').slice(0, 2) || '';
                    const modSc = SOURCE_COLORS[mod.source] || SOURCE_COLORS.local;
                    const hue = hashHue(mod.name);
                    const serverOn = mod.enabledServer ?? true;
                    const modSide = (mod.side || 'both').toLowerCase();
                    const clientLocked = modSide === 'server';
                    const serverLocked = modSide === 'client';
                    return (
                      <tr key={mod.id} className="group">
                        <td className="px-3 py-2.5 text-center">
                          <div className="flex flex-col items-center gap-1">
                            <button
                              role="switch"
                              aria-checked={mod.enabled}
                              aria-disabled={clientLocked}
                              disabled={clientLocked}
                              title={
                                clientLocked
                                  ? 'Server-only mod — cannot enable on client'
                                  : 'Include in client workspace'
                              }
                              className={`theme-toggle-track ${mod.enabled && !clientLocked ? 'on' : ''}`}
                              style={{
                                ...(mod.enabled && !clientLocked
                                  ? { background: modSc.accent }
                                  : {}),
                                ...(clientLocked ? { opacity: 0.35, cursor: 'not-allowed' } : {}),
                              }}
                              onClick={() => toggleSide(mod.id, 'client', mod.enabled)}
                            >
                              <div className="theme-toggle-knob" />
                            </button>
                            {mod.enabled && !clientLocked && mod.onDiskClient === false ? (
                              <span
                                className="disk-pending"
                                title="Not on disk yet. Layer from Overview."
                              >
                                Pending
                              </span>
                            ) : null}
                          </div>
                        </td>
                        {serverPluginOn && (
                          <td className="px-3 py-2.5 text-center">
                            <div className="flex flex-col items-center gap-1">
                              <button
                                role="switch"
                                aria-checked={serverOn}
                                aria-disabled={serverLocked}
                                disabled={serverLocked}
                                title={
                                  serverLocked
                                    ? 'Client-only mod — cannot enable on server'
                                    : 'Include in server workspace'
                                }
                                className={`theme-toggle-track ${serverOn && !serverLocked ? 'on' : ''}`}
                                style={{
                                  ...(serverOn && !serverLocked
                                    ? { background: modSc.accent }
                                    : {}),
                                  ...(serverLocked ? { opacity: 0.35, cursor: 'not-allowed' } : {}),
                                }}
                                onClick={() => toggleSide(mod.id, 'server', serverOn)}
                              >
                                <div className="theme-toggle-knob" />
                              </button>
                              {serverOn && !serverLocked && mod.onDiskServer === false ? (
                                <span
                                  className="disk-pending"
                                  title="Not on disk yet. Rebuild/layer server from Overview."
                                >
                                  Pending
                                </span>
                              ) : null}
                            </div>
                          </td>
                        )}
                        <td className="px-3 py-2.5 overflow-hidden">
                          <div className="flex items-center gap-2.5 min-w-0">
                            <div
                              className="w-7 h-7 rounded-md flex items-center justify-center shrink-0 text-[10px] font-bold overflow-hidden"
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
                            <ModNameLink
                              mod={mod}
                              label={mod.name}
                              className="text-[13px] font-medium truncate min-w-0"
                            />
                          </div>
                        </td>
                        <td
                          className="px-3 py-2.5 text-[11px] truncate overflow-hidden"
                          style={{ color: 'var(--text-muted)' }}
                          title={mod.author || undefined}
                        >
                          {mod.author || '—'}
                        </td>
                        <td className="px-3 py-2.5 text-center overflow-hidden">
                          <span className="badge badge-mono capitalize">{modSide}</span>
                        </td>
                        <td className="px-3 py-2.5 text-center overflow-hidden">
                          <span
                            className="badge badge-mono"
                            style={{
                              background: modSc.soft,
                              color: modSc.accent,
                              borderColor: modSc.border,
                            }}
                            title={`Downloaded from ${modSc.label}`}
                          >
                            {modSc.label}
                          </span>
                        </td>
                        <td
                          className="px-3 py-2.5 text-[11px] font-mono truncate overflow-hidden"
                          style={{ color: 'var(--text-muted)' }}
                          title={mod.fileName || undefined}
                        >
                          {jarLeaf(mod.fileName, mod.id)}
                        </td>
                        <td
                          className="px-3 py-2.5 text-[11px] font-mono truncate overflow-hidden"
                          style={{
                            color: modUpdates[mod.id] ? modSc.accent : 'var(--text-muted)',
                            cursor: modUpdates[mod.id] ? 'help' : undefined,
                          }}
                          title={
                            modUpdates[mod.id]
                              ? `Installed: v${displayModVersion(mod.version, mod.fileName)} · Available: v${modUpdates[mod.id].versionNumber}`
                              : `v${displayModVersion(mod.version, mod.fileName)}`
                          }
                        >
                          v{displayModVersion(mod.version, mod.fileName)}
                          {modUpdates[mod.id] && (
                            <span className="ml-1 opacity-70" aria-hidden>
                              ↑
                            </span>
                          )}
                        </td>
                        <td
                          className="px-3 py-2.5 text-[11px] text-right tabular-nums whitespace-nowrap"
                          style={{ color: 'var(--text-muted)' }}
                        >
                          {formatBytes(mod.fileSize)}
                        </td>
                        <td className="px-2 py-2.5 text-center">
                          <div className="inline-flex items-center gap-0.5">
                            {modUpdates[mod.id] && (
                              <button
                                className="btn-ghost text-[10px] px-1.5 py-1 rounded"
                                style={{ color: modSc.accent }}
                                disabled={updatingId === mod.id}
                                onClick={() => void updateOneCustom(mod, modUpdates[mod.id])}
                                title={`Update to ${modUpdates[mod.id].versionNumber} (custom only — base pack unchanged)`}
                              >
                                {updatingId === mod.id ? '…' : 'Update'}
                              </button>
                            )}
                            <button
                              className="btn-ghost-danger p-1.5 rounded"
                              onClick={() => removeCustomMod(mod.id)}
                              title="Remove mod"
                            >
                              <Icon name="trash" size={13} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
