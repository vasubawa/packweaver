import { useState, useEffect, useMemo, startTransition } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Icon } from '../Icon';
import { SOURCE_COLORS } from '../../constants';
import { Instance, InstanceMod, ModSource } from '../../types';
import { useToast } from '../../context/ToastContext';
import {
  getActiveSourcePlugins,
  isServerExporterEnabled,
  SourcePlugin,
  SearchResult,
} from '../../plugins';
import { usePluginSearch } from '../../hooks/usePluginSearch';
import { jarLeaf, formatBytes, displayModVersion } from './modListFormat';
import { checkPackUpdates } from '../../lib/packUpdates';
import type { PackVersionInfo } from '../../plugins';

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
  const [manualModName, setManualModName] = useState('');
  const [sortCol, setSortCol] = useState<'name' | 'author' | 'version' | 'source' | 'enabled'>(
    'name'
  );
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
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

  const refreshCustomUpdates = async () => {
    if (checkingUpdates) return;
    setCheckingUpdates(true);
    try {
      const result = await checkPackUpdates(instance);
      const map: Record<string, PackVersionInfo> = {};
      for (const c of result.customs) map[c.mod.id] = c.latest;
      setModUpdates(map);
    } catch (e) {
      console.error(e);
    } finally {
      setCheckingUpdates(false);
    }
  };

  useEffect(() => {
    // startTransition: avoid react-hooks/set-state-in-effect on sync setState
    if (instance.customMods.some(m => m.source === 'modrinth')) {
      startTransition(() => {
        void refreshCustomUpdates();
      });
    } else {
      startTransition(() => setModUpdates({}));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- re-scan when custom list identity changes
  }, [instance.id, instance.customMods.length, instance.mcVersion, instance.loader]);

  const updateOneCustom = async (mod: InstanceMod, latest: PackVersionInfo) => {
    if (updatingId) return;
    setUpdatingId(mod.id);
    try {
      await invoke('update_custom_mod_versions', {
        instanceId: instance.id,
        updates: [
          {
            modId: mod.id,
            version: latest.versionId,
            fileName: latest.primaryFilename || undefined,
          },
        ],
      });
      onUpdate({
        customMods: instance.customMods.map(m =>
          m.id === mod.id
            ? {
                ...m,
                version: latest.versionNumber,
                fileName: latest.primaryFilename || m.fileName,
              }
            : m
        ),
      });
      await invoke('layer_custom_mods', { instanceId: instance.id, forServer: false });
      if (serverPluginOn) {
        try {
          await invoke('layer_custom_mods', { instanceId: instance.id, forServer: true });
        } catch {
          /* server workspace may not exist yet */
        }
      }
      setModUpdates(prev => {
        const next = { ...prev };
        delete next[mod.id];
        return next;
      });
      addToast(
        serverPluginOn
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
  const { results: modResults, isSearching: isSearchingMods } = usePluginSearch(
    currentSourcePlugin,
    modQuery,
    'mod'
  );

  const sorted = useMemo(() => {
    const mods = [...instance.customMods];
    mods.sort((a, b) => {
      let cmp = 0;
      if (sortCol === 'name') cmp = (a.name || '').localeCompare(b.name || '');
      else if (sortCol === 'author') cmp = (a.author || '').localeCompare(b.author || '');
      else if (sortCol === 'version') cmp = (a.version || '').localeCompare(b.version || '');
      else if (sortCol === 'source') cmp = (a.source || '').localeCompare(b.source || '');
      else if (sortCol === 'enabled') cmp = (a.enabled ? 1 : 0) - (b.enabled ? 1 : 0);
      return sortDir === 'asc' ? cmp : -cmp;
    });
    return mods;
  }, [instance.customMods, sortCol, sortDir]);

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
      let version = 'latest';
      let fileName: string | undefined;
      let side: 'client' | 'server' | 'both' = 'both';
      let enabledClient = true;
      let enabledServer = true;

      if (currentSourcePlugin?.getLatestVersion) {
        const info = await currentSourcePlugin.getLatestVersion(modId);
        if (info) {
          version = info.versionNumber;
          fileName = info.primaryFilename;
        }
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
        enabled: enabledClient,
        enabledServer,
        side,
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
        version, // human-readable (e.g. 2.2.3), not provider version GUID
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
      setManualModName('');
      setShowModResults(false);
      addToast(`Added "${name}"`, 'success');
    } catch (e) {
      console.error('Failed to resolve/add custom mod:', e);
      addToast(`Failed to add "${name}": ${e}`, 'error');
    } finally {
      setIsAddingMod(false);
    }
  };

  const handleAddManual = () => {
    if (!manualModName.trim()) return;
    addCustomMod(`custom-${Date.now()}`, manualModName.trim());
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
              ? { ...m, enabledServer: next }
              : { ...m, enabled: next }
            : m
        ),
      });
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
            <input
              className="form-input text-xs flex-1"
              placeholder="Mod name..."
              value={manualModName}
              disabled={isAddingMod}
              onChange={e => setManualModName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleAddManual()}
            />
            <button
              className="text-xs px-3.5 py-1.5 font-medium rounded-lg shrink-0 flex items-center gap-1.5"
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

      {instance.customMods.length === 0 ? (
        <div
          className="p-10 text-center rounded-xl"
          style={{ background: 'var(--bg-surface)', border: '1px dashed var(--border)' }}
        >
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
            No custom mods yet. Search above to layer mods on the base pack (client and/or server).
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[11px] text-[var(--text-muted)]">
              {Object.keys(modUpdates).length > 0
                ? `${Object.keys(modUpdates).length} update${Object.keys(modUpdates).length === 1 ? '' : 's'} available`
                : 'Modrinth customs can be updated without touching the base pack'}
            </p>
            <button
              className="btn-ghost text-[11px] px-2 py-0.5"
              onClick={() => void refreshCustomUpdates()}
              disabled={checkingUpdates}
              title="Looks for newer versions of custom mods on Modrinth. Doesn't download until you click Update."
            >
              <Icon name="refresh" size={12} />
              {checkingUpdates ? 'Checking…' : 'Check updates'}
            </button>
          </div>
          <div
            className="rounded-xl border overflow-x-auto"
            style={{ background: 'var(--bg-surface)', borderColor: 'var(--border)' }}
          >
            <table className="w-full min-w-[960px] table-fixed text-left border-collapse">
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
                  <th className="font-medium px-3 py-2.5 w-14 text-center">Disk</th>
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
                            ...(mod.enabled && !clientLocked ? { background: modSc.accent } : {}),
                            ...(clientLocked ? { opacity: 0.35, cursor: 'not-allowed' } : {}),
                          }}
                          onClick={() => toggleSide(mod.id, 'client', mod.enabled)}
                        >
                          <div className="theme-toggle-knob" />
                        </button>
                      </td>
                      {serverPluginOn && (
                        <td className="px-3 py-2.5 text-center">
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
                              ...(serverOn && !serverLocked ? { background: modSc.accent } : {}),
                              ...(serverLocked ? { opacity: 0.35, cursor: 'not-allowed' } : {}),
                            }}
                            onClick={() => toggleSide(mod.id, 'server', serverOn)}
                          >
                            <div className="theme-toggle-knob" />
                          </button>
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
                          <div
                            className="text-[13px] font-medium truncate min-w-0"
                            style={{ color: 'var(--text-primary)' }}
                            title={mod.name}
                          >
                            {mod.name}
                          </div>
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
                        <span
                          className="px-1.5 py-0.5 text-[10px] rounded font-medium inline-block capitalize"
                          style={{ background: 'var(--bg-muted)', color: 'var(--text-muted)' }}
                        >
                          {modSide}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-center overflow-hidden">
                        <span
                          className="px-1.5 py-0.5 text-[10px] rounded font-medium inline-block"
                          style={{ background: modSc.soft, color: modSc.accent }}
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
                        className="px-3 py-2.5 text-[11px] truncate overflow-hidden"
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
                        className="px-3 py-2.5 text-[11px] text-center"
                        style={{ color: 'var(--text-muted)' }}
                        title="C = client workspace, S = server workspace"
                      >
                        {[mod.onDiskClient ? 'C' : null, mod.onDiskServer ? 'S' : null]
                          .filter(Boolean)
                          .join('+') || '—'}
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
          </div>
        </div>
      )}
    </div>
  );
}
