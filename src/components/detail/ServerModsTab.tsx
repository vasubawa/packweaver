import { useMemo, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';
import { Icon } from '../Icon';
import { ModNameLink } from './ModNameLink';
import { SOURCE_COLORS } from '../../constants';
import { Instance, InstanceMod } from '../../types';
import { useToast } from '../../context/ToastContext';
import { appLog } from '../../lib/appLog';
import {
  jarLeaf,
  formatBytes,
  compareModName,
  modMatchesQuery,
  displayModVersion,
  modListToText,
} from './modListFormat';
import { ServerFilesTab } from './ServerFilesTab';

const PAGE_SIZE = 50;

interface ServerModsTabProps {
  instance: Instance;
  onUpdate: (updates: Partial<Instance>) => void;
}

function isServerCapable(m: InstanceMod): boolean {
  const side = (m.side || 'both').toLowerCase();
  return side === 'server' || side === 'both';
}

export function ServerModsTab({ instance, onUpdate }: ServerModsTabProps) {
  const sc = SOURCE_COLORS[instance.source] || SOURCE_COLORS.local;
  const { addToast } = useToast();
  const [query, setQuery] = useState('');
  const [showCount, setShowCount] = useState(PAGE_SIZE);
  const [uploading, setUploading] = useState(false);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [sortCol, setSortCol] = useState<
    'name' | 'author' | 'version' | 'side' | 'file' | 'size' | 'enabled'
  >('name');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');

  const serverBaseMods = useMemo(
    () => instance.basePackMods.filter(isServerCapable),
    [instance.basePackMods]
  );

  const filteredMods = useMemo(() => {
    const mods = serverBaseMods.filter(m => modMatchesQuery(m, query));
    mods.sort((a, b) => {
      let cmp = 0;
      if (sortCol === 'name') cmp = compareModName(a.name || '', b.name || '');
      else if (sortCol === 'author') cmp = compareModName(a.author || '', b.author || '');
      else if (sortCol === 'version')
        cmp = displayModVersion(a.version, a.fileName).localeCompare(
          displayModVersion(b.version, b.fileName),
          undefined,
          { sensitivity: 'base' }
        );
      else if (sortCol === 'side') cmp = (a.side || 'both').localeCompare(b.side || 'both');
      else if (sortCol === 'file')
        cmp = (jarLeaf(a.fileName, a.id) || '').localeCompare(jarLeaf(b.fileName, b.id) || '');
      else if (sortCol === 'size') cmp = (a.fileSize ?? 0) - (b.fileSize ?? 0);
      else if (sortCol === 'enabled')
        cmp = ((a.enabledServer ?? true) ? 1 : 0) - ((b.enabledServer ?? true) ? 1 : 0);
      return sortDir === 'asc' ? cmp : -cmp;
    });
    return mods;
  }, [serverBaseMods, query, sortCol, sortDir]);

  const handleSort = (col: typeof sortCol) => {
    if (sortCol === col) setSortDir(d => (d === 'asc' ? 'desc' : 'asc'));
    else {
      setSortCol(col);
      setSortDir('asc');
    }
  };

  const visibleMods = filteredMods.slice(0, showCount);

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

  const setAllFiltered = async (enabled: boolean) => {
    const targets = filteredMods.filter(m => (m.enabledServer ?? true) !== enabled);
    if (targets.length === 0 || bulkBusy) return;
    setBulkBusy(true);
    const changed = new Set<string>();
    const failures: string[] = [];
    try {
      for (const mod of targets) {
        try {
          await invoke('toggle_mod_state', {
            instanceId: instance.id,
            modId: mod.id,
            enabled,
            side: 'server',
          });
          changed.add(mod.id);
        } catch (e) {
          failures.push(`${mod.name}: ${e}`);
        }
      }
      if (changed.size > 0) {
        onUpdate({
          basePackMods: instance.basePackMods.map(m =>
            changed.has(m.id)
              ? { ...m, enabledServer: enabled, onDiskServer: enabled ? m.onDiskServer : false }
              : m
          ),
        });
      }
      if (failures.length > 0) {
        addToast(`Could not toggle ${failures.length} server mod(s)`, 'error');
      } else {
        addToast(
          `${enabled ? 'Enabled' : 'Disabled'} ${changed.size} server mod${changed.size === 1 ? '' : 's'}`,
          'success'
        );
      }
    } finally {
      setBulkBusy(false);
    }
  };

  const serverPackName = instance.serverOriginalFilename?.trim() || '';
  const isLocal = instance.source === 'local';

  const handleUploadServerPack = async () => {
    try {
      const file = await open({
        multiple: false,
        directory: false,
        filters: [
          {
            name: 'Server pack (.mrpack or zip)',
            extensions: ['mrpack', 'zip'],
          },
        ],
      });
      if (!file || typeof file !== 'string') return;
      setUploading(true);
      const leaf = await invoke<string>('set_server_original_archive', {
        instanceId: instance.id,
        sourcePath: file,
      });
      onUpdate({ serverOriginalFilename: leaf });
      addToast(
        `Server pack stored as ${leaf}. Run Rebuild server from Overview to install it.`,
        'success'
      );
    } catch (e) {
      addToast(String(e), 'error');
    } finally {
      setUploading(false);
    }
  };

  const handleClearServerPack = async () => {
    try {
      await invoke('clear_server_original_archive', { instanceId: instance.id });
      onUpdate({ serverOriginalFilename: '' });
      addToast(
        'Dedicated server pack cleared. Rebuild server will use the client archive again.',
        'info'
      );
    } catch (e) {
      addToast(String(e), 'error');
    }
  };

  const toggleServer = async (mod: InstanceMod) => {
    const next = !(mod.enabledServer ?? true);
    try {
      await invoke('toggle_mod_state', {
        instanceId: instance.id,
        modId: mod.id,
        enabled: next,
        side: 'server',
      });
      onUpdate({
        basePackMods: instance.basePackMods.map(m =>
          m.id === mod.id
            ? {
                ...m,
                enabledServer: next,
                onDiskServer: next ? m.onDiskServer : false,
              }
            : m
        ),
      });
      if (next) {
        addToast(
          'Enabled. Rebuild the server workspace from Overview to restore it on disk.',
          'info'
        );
      }
    } catch (e) {
      addToast(String(e), 'error');
    }
  };

  const row = (mod: InstanceMod) => {
    const on = mod.enabledServer ?? true;
    const modSide = (mod.side || 'both').toLowerCase();
    return (
      <tr key={mod.id} style={{ opacity: on ? 1 : 0.55 }}>
        <td className="px-3 py-2.5 text-center">
          <div className="flex flex-col items-center gap-1">
            <button
              role="switch"
              aria-checked={on}
              aria-label={`Server toggle ${mod.name}`}
              className={`theme-toggle-track ${on ? 'on' : ''}`}
              style={on ? { background: sc.accent } : {}}
              onClick={() => toggleServer(mod)}
            >
              <div className="theme-toggle-knob" />
            </button>
            {on && mod.onDiskServer === false ? (
              <span
                className="disk-pending"
                title="Enabled but not on disk yet. Rebuild server from Overview."
              >
                Pending
              </span>
            ) : null}
          </div>
        </td>
        <td className="px-3 py-2.5 overflow-hidden">
          <ModNameLink
            mod={mod}
            label={mod.name}
            className="text-[13px] font-medium truncate"
            instanceId={instance.id}
          />
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
          title={displayModVersion(mod.version, mod.fileName)}
        >
          v{displayModVersion(mod.version, mod.fileName)}
        </td>
        <td
          className="px-3 py-2.5 text-[11px] font-mono text-right tabular-nums"
          style={{ color: 'var(--text-muted)' }}
        >
          {formatBytes(mod.fileSize)}
        </td>
      </tr>
    );
  };

  return (
    <div className="animate-slide-in flex flex-col gap-4">
      <p className="text-[13px]" style={{ color: 'var(--text-secondary)' }}>
        {isLocal
          ? 'Local packs can use a separate server zip. Upload it here, rebuild from Overview, then export from the header.'
          : 'Server mods come from the base pack (client-only mods stay off this list). Rebuild from Overview, then export from the header.'}
      </p>
      {instance.loader ? <div className="font-mono-meta">{instance.loader}</div> : null}

      {isLocal && (
        <div
          className="p-4 rounded-xl flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"
          style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}
        >
          <div className="min-w-0">
            <div className="text-[13px] font-medium" style={{ color: 'var(--text-primary)' }}>
              Server pack archive
            </div>
            <div className="text-[12px] mt-0.5" style={{ color: 'var(--text-muted)' }}>
              {serverPackName
                ? `Using ${serverPackName} (stored under original/server/)`
                : 'None uploaded — Rebuild server uses the client archive when it has server-capable mods'}
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {serverPackName ? (
              <button
                className="btn-ghost text-[12px] px-2.5 py-1.5"
                onClick={handleClearServerPack}
                disabled={uploading}
              >
                Clear
              </button>
            ) : null}
            <button
              className="btn-primary text-[12px] px-3 py-1.5 inline-flex items-center gap-1.5"
              onClick={handleUploadServerPack}
              disabled={uploading}
            >
              <Icon name="upload" size={14} />
              {uploading ? 'Storing…' : serverPackName ? 'Replace zip' : 'Upload zip'}
            </button>
          </div>
        </div>
      )}

      {serverBaseMods.length === 0 ? (
        <div className="p-10 text-center loom-panel">
          <p className="text-xs py-2" style={{ color: 'var(--text-muted)' }}>
            {isLocal && serverPackName
              ? 'Server pack stored. Rebuild server from Overview — the mod list fills after that rebuild.'
              : isLocal
                ? 'No server-capable base mods yet. Upload a server zip above, or rebuild from a client archive that includes server mods.'
                : 'No server-capable base mods yet. Rebuild the client pack first, then rebuild server.'}
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
              aria-label="Search server mods"
              placeholder={`Search ${serverBaseMods.length} mods by name, author, or file…`}
              value={query}
              onChange={e => {
                setQuery(e.target.value);
                setShowCount(PAGE_SIZE);
              }}
            />
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              className="btn-ghost text-[11px] px-2 py-0.5"
              onClick={() => void setAllFiltered(true)}
              disabled={bulkBusy}
              title="Enable all mods matching the current filter on the server"
            >
              Enable {query ? 'matching' : 'all'}
            </button>
            <button
              type="button"
              className="btn-ghost text-[11px] px-2 py-0.5"
              onClick={() => void setAllFiltered(false)}
              disabled={bulkBusy}
              title="Disable all mods matching the current filter on the server"
            >
              Disable {query ? 'matching' : 'all'}
            </button>
            <button
              type="button"
              className="btn-ghost text-[11px] px-2 py-0.5"
              onClick={() => void copyModList(filteredMods, 'server mods')}
              title="Copy the enabled mods in this view as plain text"
            >
              Copy list
            </button>
            {bulkBusy ? (
              <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                Applying…
              </span>
            ) : null}
          </div>

          <div
            className="loom-panel overflow-x-auto"
            style={{ background: 'var(--bg-surface)', borderColor: 'var(--border)' }}
          >
            {filteredMods.length === 0 ? (
              <div className="px-4 py-8 text-center text-xs" style={{ color: 'var(--text-muted)' }}>
                No mods match &ldquo;{query}&rdquo;
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
                      <th
                        className="font-medium px-3 py-2.5 w-12 text-center cursor-pointer hover:text-[var(--text-primary)] select-none"
                        onClick={() => handleSort('enabled')}
                      >
                        On {sortCol === 'enabled' && (sortDir === 'asc' ? '↑' : '↓')}
                      </th>
                      <th
                        className="font-medium px-3 py-2.5 cursor-pointer hover:text-[var(--text-primary)] select-none"
                        onClick={() => handleSort('name')}
                      >
                        Mod {sortCol === 'name' && (sortDir === 'asc' ? '↑' : '↓')}
                      </th>
                      <th
                        className="font-medium px-3 py-2.5 w-28 cursor-pointer hover:text-[var(--text-primary)] select-none"
                        onClick={() => handleSort('author')}
                      >
                        Author {sortCol === 'author' && (sortDir === 'asc' ? '↑' : '↓')}
                      </th>
                      <th
                        className="font-medium px-3 py-2.5 w-16 text-center cursor-pointer hover:text-[var(--text-primary)] select-none"
                        onClick={() => handleSort('side')}
                      >
                        Side {sortCol === 'side' && (sortDir === 'asc' ? '↑' : '↓')}
                      </th>
                      <th
                        className="font-medium px-3 py-2.5 w-40 cursor-pointer hover:text-[var(--text-primary)] select-none"
                        onClick={() => handleSort('file')}
                      >
                        File {sortCol === 'file' && (sortDir === 'asc' ? '↑' : '↓')}
                      </th>
                      <th
                        className="font-medium px-3 py-2.5 w-28 cursor-pointer hover:text-[var(--text-primary)] select-none"
                        onClick={() => handleSort('version')}
                      >
                        Version {sortCol === 'version' && (sortDir === 'asc' ? '↑' : '↓')}
                      </th>
                      <th
                        className="font-medium px-3 py-2.5 w-16 text-right cursor-pointer hover:text-[var(--text-primary)] select-none"
                        onClick={() => handleSort('size')}
                      >
                        Size {sortCol === 'size' && (sortDir === 'asc' ? '↑' : '↓')}
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--border)]">
                    {visibleMods.map(m => row(m))}
                  </tbody>
                </table>
                {filteredMods.length > showCount && (
                  <div className="px-3 py-3 flex items-center justify-center">
                    <button
                      className="text-[11.5px] font-medium"
                      style={{ color: sc.accent }}
                      onClick={() => setShowCount(c => c + PAGE_SIZE)}
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

      <div className="mt-2">
        <ServerFilesTab instance={instance} onUpdate={onUpdate} />
      </div>
    </div>
  );
}
