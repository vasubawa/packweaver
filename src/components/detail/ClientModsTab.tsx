import { useState, useMemo } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Icon } from '../Icon';
import { SOURCE_COLORS } from '../../constants';
import { Instance } from '../../types';
import { useToast } from '../../context/ToastContext';
import { jarLeaf, formatBytes, compareModName, modMatchesQuery } from './modListFormat';

const BASE_MODS_PAGE_SIZE = 50;

interface ClientModsTabProps {
  instance: Instance;
  onUpdate: (updates: Partial<Instance>) => void;
}

function parseModJar(raw: string): { name: string; version: string | null; initials: string } {
  const base = raw.replace(/\.(jar|zip)$/i, '');
  const parts = base.split(/[-+]/);
  const nameParts: string[] = [];
  let version: string | null = null;
  let foundVersion = false;
  for (const part of parts) {
    const isVerLike = /^\d+(\.\d+)+/.test(part);
    if (!foundVersion && isVerLike) {
      foundVersion = true;
      version = part;
    } else if (!foundVersion) {
      nameParts.push(part);
    }
  }
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
  const words = name.split(' ').filter(Boolean);
  const initials =
    words.length >= 2 ? (words[0][0] + words[1][0]).toUpperCase() : name.slice(0, 2).toUpperCase();
  return { name, version, initials };
}

function hashHue(str: string): number {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) >>> 0;
  return h % 360;
}

function isClientCapable(side?: string): boolean {
  const s = (side || 'both').toLowerCase();
  return s === 'client' || s === 'both';
}

export function ClientModsTab({ instance, onUpdate }: ClientModsTabProps) {
  const sc = SOURCE_COLORS[instance.source] || SOURCE_COLORS.local;
  const { addToast } = useToast();
  const [baseFilter, setBaseFilter] = useState('');
  const [baseShowCount, setBaseShowCount] = useState(BASE_MODS_PAGE_SIZE);

  const clientBaseMods = useMemo(
    () => instance.basePackMods.filter(m => isClientCapable(m.side)),
    [instance.basePackMods]
  );

  const filteredBaseMods = useMemo(() => {
    const mods = clientBaseMods.filter(m => modMatchesQuery(m, baseFilter));
    mods.sort((a, b) => compareModName(a.name || '', b.name || ''));
    return mods;
  }, [clientBaseMods, baseFilter]);

  const visibleBaseMods = filteredBaseMods.slice(0, baseShowCount);

  const toggleBaseMod = async (id: string, currentEnabled: boolean) => {
    try {
      const nextEnabled = !currentEnabled;
      await invoke('toggle_mod_state', {
        instanceId: instance.id,
        modId: id,
        enabled: nextEnabled,
        side: 'client',
      });
      onUpdate({
        basePackMods: instance.basePackMods.map(m =>
          m.id === id
            ? {
                ...m,
                enabled: nextEnabled,
                // Disable removes the jar immediately; enable waits for Rebuild.
                onDiskClient: nextEnabled ? m.onDiskClient : false,
              }
            : m
        ),
      });
      if (nextEnabled) {
        addToast(
          'Enabled. Rebuild the client workspace from Overview to restore it on disk.',
          'info'
        );
      }
    } catch (e) {
      addToast(`Failed to toggle: ${e}`, 'error');
    }
  };

  return (
    <div className="animate-slide-in flex flex-col gap-3">
      <p className="text-[13px]" style={{ color: 'var(--text-secondary)' }}>
        Choose which base-pack mods belong in the client workspace. Add extras under Custom Mods.
      </p>
      {instance.loader ? <div className="font-mono-meta">{instance.loader}</div> : null}
      {clientBaseMods.length === 0 ? (
        <div className="p-10 text-center loom-panel">
          <p className="text-xs py-2" style={{ color: 'var(--text-muted)' }}>
            {instance.status !== 'Ready'
              ? 'Base pack is currently downloading or processing...'
              : 'This pack has no client base mods listed.'}
          </p>
        </div>
      ) : (
        <>
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
              aria-label="Search client mods"
              placeholder={`Search ${clientBaseMods.length} mods by name, author, or file…`}
              value={baseFilter}
              onChange={e => {
                setBaseFilter(e.target.value);
                setBaseShowCount(BASE_MODS_PAGE_SIZE);
              }}
            />
          </div>

          <div
            className="loom-panel overflow-x-auto"
            style={{ background: 'var(--bg-surface)', borderColor: 'var(--border)' }}
          >
            {filteredBaseMods.length === 0 ? (
              <div className="px-4 py-8 text-center text-xs" style={{ color: 'var(--text-muted)' }}>
                No mods match &ldquo;{baseFilter}&rdquo;
              </div>
            ) : (
              <>
                <table className="data-table w-full table-fixed text-left border-collapse">
                  <thead>
                    <tr
                      className="text-[11px] uppercase tracking-wider"
                      style={{
                        background: 'var(--bg-muted)',
                        color: 'var(--text-muted)',
                        borderBottom: '1px solid var(--border)',
                      }}
                    >
                      <th className="font-medium px-3 py-2.5 w-12 text-center">On</th>
                      <th className="font-medium px-3 py-2.5">Mod</th>
                      <th className="font-medium px-3 py-2.5 w-28">Author</th>
                      <th className="font-medium px-3 py-2.5 w-16 text-center">Side</th>
                      <th className="font-medium px-3 py-2.5 w-40">File</th>
                      <th className="font-medium px-3 py-2.5 w-28">Version</th>
                      <th className="font-medium px-3 py-2.5 w-16 text-right">Size</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--border)]">
                    {visibleBaseMods.map(mod => {
                      const parsed = parseModJar(mod.name);
                      const isJarName = mod.name.endsWith('.jar') || mod.name.endsWith('.zip');
                      const displayName = isJarName ? parsed.name : mod.name;
                      const displayVersion =
                        mod.version && mod.version !== 'latest' && mod.version !== 'local'
                          ? mod.version
                          : parsed.version || 'Unknown';
                      const hue = hashHue(displayName);
                      const initials = parsed.initials || displayName.slice(0, 2).toUpperCase();
                      const modSide = (mod.side || 'both').toLowerCase();
                      return (
                        <tr
                          key={mod.id}
                          style={{ opacity: mod.enabled ? 1 : 0.55 }}
                          title={mod.description || mod.name}
                        >
                          <td className="px-3 py-2.5 text-center">
                            <div className="flex flex-col items-center gap-1">
                              <button
                                role="switch"
                                aria-checked={mod.enabled}
                                aria-label={`Client toggle ${mod.name}`}
                                className={`theme-toggle-track ${mod.enabled ? 'on' : ''}`}
                                style={mod.enabled ? { background: sc.accent } : {}}
                                onClick={() => toggleBaseMod(mod.id, mod.enabled)}
                              >
                                <div className="theme-toggle-knob" />
                              </button>
                              {mod.enabled && mod.onDiskClient === false ? (
                                <span
                                  className="disk-pending"
                                  title="Enabled but not on disk yet. Rebuild or layer from Overview."
                                >
                                  Pending
                                </span>
                              ) : null}
                            </div>
                          </td>
                          <td className="px-3 py-2.5 overflow-hidden">
                            <div className="flex items-center gap-3 min-w-0">
                              <div
                                className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 text-[10px] font-bold overflow-hidden"
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
                              <div
                                className="text-[12.5px] font-medium truncate min-w-0"
                                style={{ color: 'var(--text-primary)' }}
                                title={displayName}
                              >
                                {displayName}
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
                          <td className="px-3 py-2.5 text-center">
                            <span className="badge badge-mono capitalize">{modSide}</span>
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
                            style={{ color: 'var(--text-muted)' }}
                            title={displayVersion}
                          >
                            v{displayVersion}
                          </td>
                          <td
                            className="px-3 py-2.5 text-[11px] font-mono text-right tabular-nums"
                            style={{ color: 'var(--text-muted)' }}
                          >
                            {formatBytes(mod.fileSize)}
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
                      Show more
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}
