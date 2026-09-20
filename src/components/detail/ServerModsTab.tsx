import { useMemo, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';
import { Icon } from '../Icon';
import { SOURCE_COLORS } from '../../constants';
import { Instance, InstanceMod } from '../../types';
import { useToast } from '../../context/ToastContext';
import { jarLeaf, formatBytes, compareModName, modMatchesQuery } from './modListFormat';

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

  const serverBaseMods = useMemo(
    () => instance.basePackMods.filter(isServerCapable),
    [instance.basePackMods]
  );

  const filteredMods = useMemo(() => {
    const mods = serverBaseMods.filter(m => modMatchesQuery(m, query));
    mods.sort((a, b) => compareModName(a.name || '', b.name || ''));
    return mods;
  }, [serverBaseMods, query]);

  const visibleMods = filteredMods.slice(0, showCount);
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
        </td>
        <td
          className="px-3 py-2.5 text-[13px] font-medium truncate overflow-hidden"
          style={{ color: 'var(--text-primary)' }}
          title={mod.name}
        >
          {mod.name}
        </td>
        <td
          className="px-3 py-2.5 text-[11px] truncate overflow-hidden"
          style={{ color: 'var(--text-muted)' }}
          title={mod.author || undefined}
        >
          {mod.author || '—'}
        </td>
        <td className="px-3 py-2.5 text-center">
          <span
            className="px-1.5 py-0.5 text-[10px] rounded font-medium inline-block capitalize"
            style={{ background: 'var(--bg-muted)', color: 'var(--text-muted)' }}
          >
            {modSide}
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
          style={{ color: 'var(--text-muted)' }}
        >
          {instance.mcVersion} / {instance.loader}
        </td>
        <td
          className="px-3 py-2.5 text-[11px] truncate overflow-hidden"
          style={{ color: 'var(--text-muted)' }}
          title={mod.version}
        >
          v{mod.version}
        </td>
        <td
          className="px-3 py-2.5 text-[11px] text-right tabular-nums"
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
        <div
          className="p-10 text-center rounded-xl"
          style={{ background: 'var(--bg-surface)', border: '1px dashed var(--border)' }}
        >
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
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

          <div
            className="rounded-xl border overflow-x-auto"
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
                      <th className="font-medium px-3 py-2.5 w-12 text-center">On</th>
                      <th className="font-medium px-3 py-2.5">Mod</th>
                      <th className="font-medium px-3 py-2.5 w-28">Author</th>
                      <th className="font-medium px-3 py-2.5 w-16 text-center">Side</th>
                      <th className="font-medium px-3 py-2.5 w-40">File</th>
                      <th className="font-medium px-3 py-2.5 w-28">MC / Loader</th>
                      <th className="font-medium px-3 py-2.5 w-24">Version</th>
                      <th className="font-medium px-3 py-2.5 w-16 text-right">Size</th>
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
    </div>
  );
}
