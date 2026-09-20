import { useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Icon } from '../Icon';
import { SOURCE_COLORS } from '../../constants';
import { Instance, ModSource, ServerFileItem } from '../../types';
import { useToast } from '../../context/ToastContext';

interface ServerFilesTabProps {
  instance: Instance;
  onUpdate: (updates: Partial<Instance>) => void;
}

function toPayload(files: ServerFileItem[]) {
  return files.map(f => ({
    id: f.id,
    name: f.name,
    fileType: f.type,
    source: f.source,
    enabled: f.enabled,
  }));
}

export function ServerFilesTab({ instance, onUpdate }: ServerFilesTabProps) {
  const [newFileName, setNewFileName] = useState('');
  const [addFileSource, setAddFileSource] = useState<ModSource>('local');
  const [busy, setBusy] = useState(false);
  const sc = SOURCE_COLORS[instance.source] || SOURCE_COLORS.local;
  const { addToast } = useToast();

  const persistFiles = async (next: ServerFileItem[]): Promise<boolean> => {
    setBusy(true);
    try {
      await invoke('set_server_files', {
        instanceId: instance.id,
        files: toPayload(next),
      });
      onUpdate({ serverFiles: next });
      return true;
    } catch (e) {
      addToast(`Failed to save server files: ${e}`, 'error');
      return false;
    } finally {
      setBusy(false);
    }
  };

  const toggleFile = (id: string) => {
    if (busy) return;
    void persistFiles(
      instance.serverFiles.map(f => (f.id === id ? { ...f, enabled: !f.enabled } : f))
    );
  };

  const removeFile = (id: string) => {
    if (busy) return;
    void persistFiles(instance.serverFiles.filter(f => f.id !== id));
  };

  const addServerFile = () => {
    if (busy || !newFileName.trim()) return;
    const next: ServerFileItem[] = [
      ...instance.serverFiles,
      {
        id: crypto.randomUUID(),
        name: newFileName.trim(),
        type: 'config',
        source: addFileSource,
        enabled: true,
      },
    ];
    void persistFiles(next).then(ok => {
      if (ok) setNewFileName('');
    });
  };

  const toggleIncludeServer = () => {
    onUpdate({
      exportSettings: {
        ...instance.exportSettings,
        includeServer: !instance.exportSettings.includeServer,
      },
    });
  };

  return (
    <div className="flex flex-col gap-6">
      <div
        className="p-3 rounded-xl flex items-center gap-3"
        style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}
      >
        <select
          className="form-select text-xs"
          style={{ width: 'auto', minWidth: 120 }}
          value={addFileSource}
          disabled={busy}
          onChange={e => setAddFileSource(e.target.value as ModSource)}
        >
          <option value="local">Local File</option>
          <option value="modrinth">Modrinth</option>
          <option value="curseforge">CurseForge</option>
        </select>
        <input
          className="form-input text-xs flex-1"
          placeholder="File path or config name (e.g. server.properties)..."
          value={newFileName}
          disabled={busy}
          onChange={e => setNewFileName(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && addServerFile()}
        />
        <button
          className="btn-accent text-xs px-3.5 py-1.5 font-medium shrink-0"
          style={{ background: sc.accent }}
          disabled={busy || !newFileName.trim()}
          onClick={addServerFile}
        >
          <Icon name="plus" size={13} />
          <span>Add File</span>
        </button>
      </div>

      <div>
        <div className="flex items-center gap-2 mb-3">
          <Icon name="server" size={14} style={{ color: sc.accent }} />
          <span className="section-label mb-0">Server-only files</span>
          <span className="badge badge-mono">{instance.serverFiles.length}</span>
        </div>

        {instance.serverFiles.length === 0 ? (
          <div className="p-8 text-center loom-panel">
            <p className="text-xs font-medium text-[var(--text-primary)] mb-0.5 py-2">
              No server-specific files added
            </p>
            <p className="text-[11px] text-[var(--text-muted)] pb-2">
              Add server configs, start scripts, or JVM overrides to bundle on server export.
            </p>
          </div>
        ) : (
          <div
            className="loom-panel divide-y divide-[var(--border)]"
            style={{ background: 'var(--bg-surface)' }}
          >
            {instance.serverFiles.map(file => {
              const fileSc = SOURCE_COLORS[file.source] || SOURCE_COLORS.local;
              return (
                <div key={file.id} className="p-3 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <Icon
                      name={file.type === 'script' ? 'fileCode' : 'settings'}
                      size={14}
                      style={{ color: 'var(--text-muted)', flexShrink: 0 }}
                    />
                    <div className="min-w-0 flex-1">
                      <div
                        className="text-[13px] font-medium text-[var(--text-primary)] truncate"
                        title={file.name}
                      >
                        {file.name}
                      </div>
                      <div className="font-mono-meta flex items-center gap-2">
                        <span>{file.type === 'script' ? 'Script' : 'Config'}</span>
                        <span aria-hidden>·</span>
                        <span style={{ color: fileSc.accent }}>{fileSc.label}</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 shrink-0">
                    <button
                      role="switch"
                      aria-checked={file.enabled}
                      aria-label={`Toggle ${file.name}`}
                      disabled={busy}
                      className={`theme-toggle-track ${file.enabled ? 'on' : ''}`}
                      style={file.enabled ? { background: fileSc.accent } : {}}
                      onClick={() => toggleFile(file.id)}
                    >
                      <div className="theme-toggle-knob" />
                    </button>
                    <button
                      className="btn-ghost-danger p-1.5 rounded"
                      disabled={busy}
                      onClick={() => removeFile(file.id)}
                      title="Remove file"
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

      <div className="loom-panel">
        <div className="loom-panel-body flex items-center justify-between gap-3">
          <div>
            <div className="text-[13px] font-medium text-[var(--text-primary)]">
              Bundle server files on export
            </div>
            <div className="text-[11.5px] text-[var(--text-muted)]">
              Include these configs when packaging a server release
            </div>
          </div>
          <button
            role="switch"
            aria-checked={instance.exportSettings.includeServer}
            aria-label="Include server files"
            className={`theme-toggle-track ${instance.exportSettings.includeServer ? 'on' : ''}`}
            style={instance.exportSettings.includeServer ? { background: sc.accent } : {}}
            onClick={toggleIncludeServer}
          >
            <div className="theme-toggle-knob" />
          </button>
        </div>
      </div>
    </div>
  );
}
