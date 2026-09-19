import { useMemo } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Icon } from '../Icon';
import { SOURCE_COLORS } from '../../constants';
import { Instance, InstanceMod } from '../../types';
import { useToast } from '../../context/ToastContext';
import { jarLeaf, formatBytes } from './modListFormat';

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

  const baseMods = useMemo(
    () => instance.basePackMods.filter(isServerCapable),
    [instance.basePackMods]
  );

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
          m.id === mod.id ? { ...m, enabledServer: next } : m
        ),
      });
    } catch (e) {
      addToast(String(e), 'error');
    }
  };

  const rebuildServer = async () => {
    try {
      addToast('Rebuilding server workspace…', 'info');
      await invoke('rebuild_server_workspace', { instanceId: instance.id });
      addToast('Server workspace ready', 'success');
    } catch (e) {
      addToast(String(e), 'error');
    }
  };

  const exportServer = async () => {
    try {
      const path = await invoke<string>('export_instance', {
        instanceId: instance.id,
        format: 'server',
      });
      onUpdate({
        lastExported: new Date().toLocaleString(),
      });
      addToast(`Saved ${path}`, 'success');
    } catch (e) {
      const msg = String(e);
      if (!msg.toLowerCase().includes('cancelled')) addToast(msg, 'error');
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
        <td className="px-3 py-2.5 text-[11px] text-center" style={{ color: 'var(--text-muted)' }}>
          {[mod.onDiskClient ? 'C' : null, mod.onDiskServer ? 'S' : null]
            .filter(Boolean)
            .join('+') || '—'}
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
      <div className="flex items-center gap-2 flex-wrap">
        <button className="btn-secondary text-xs px-3 py-1.5" onClick={rebuildServer}>
          <Icon name="refresh" size={13} />
          Rebuild server workspace
        </button>
        <button
          className="btn-accent text-xs px-3 py-1.5"
          style={{ background: sc.accent }}
          onClick={exportServer}
        >
          <Icon name="package" size={13} />
          Export server ZIP
        </button>
      </div>
      <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
        Base pack mods for the server workspace. Custom mods (with Server toggle) live under Custom
        Mods. Disable the Server Pack Packager plugin to hide this tab.
      </p>

      <div
        className="rounded-xl border overflow-x-auto"
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
              <th className="font-medium px-3 py-2.5 w-12 text-center">On</th>
              <th className="font-medium px-3 py-2.5">Mod</th>
              <th className="font-medium px-3 py-2.5 w-28">Author</th>
              <th className="font-medium px-3 py-2.5 w-16 text-center">Side</th>
              <th className="font-medium px-3 py-2.5 w-40">File</th>
              <th className="font-medium px-3 py-2.5 w-28">MC / Loader</th>
              <th className="font-medium px-3 py-2.5 w-24">Version</th>
              <th className="font-medium px-3 py-2.5 w-16 text-center">On disk</th>
              <th className="font-medium px-3 py-2.5 w-16 text-right">Size</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border)]">
            {baseMods.map(m => row(m))}
            {baseMods.length === 0 && (
              <tr>
                <td colSpan={9} className="px-4 py-8 text-center text-xs text-[var(--text-muted)]">
                  No server-capable base mods yet. Rebuild the client pack first, then rebuild
                  server.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
