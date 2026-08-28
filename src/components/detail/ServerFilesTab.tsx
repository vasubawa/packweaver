import { useState } from 'react';
import { Icon } from '../Icon';
import { SOURCE_COLORS } from '../../constants';
import { Instance, ModSource } from '../../types';

interface ServerFilesTabProps {
  instance: Instance;
  onUpdate: (updates: Partial<Instance>) => void;
}

export function ServerFilesTab({ instance, onUpdate }: ServerFilesTabProps) {
  const [newFileName, setNewFileName] = useState('');
  const [addFileSource, setAddFileSource] = useState<ModSource>('local');
  const sc = SOURCE_COLORS[instance.source] || SOURCE_COLORS.local;

  const toggleFile = (id: string) => {
    onUpdate({
      serverFiles: instance.serverFiles.map(f => (f.id === id ? { ...f, enabled: !f.enabled } : f)),
    });
  };

  const removeFile = (id: string) => {
    onUpdate({
      serverFiles: instance.serverFiles.filter(f => f.id !== id),
    });
  };

  const addServerFile = () => {
    if (!newFileName.trim()) return;
    onUpdate({
      serverFiles: [
        ...instance.serverFiles,
        {
          id: crypto.randomUUID(),
          name: newFileName.trim(),
          type: 'config',
          source: addFileSource,
          enabled: true,
        },
      ],
    });
    setNewFileName('');
  };

  return (
    <div className="animate-slide-in max-w-3xl flex flex-col gap-6">
      {/* Add Server File Bar */}
      <div
        className="p-3 rounded-xl flex items-center gap-3"
        style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}
      >
        <select
          className="form-select text-xs"
          style={{ width: 'auto', minWidth: 120 }}
          value={addFileSource}
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
          onChange={e => setNewFileName(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && addServerFile()}
        />
        <button
          className="btn-accent text-xs px-3.5 py-1.5 font-medium shrink-0"
          style={{ background: sc.accent }}
          onClick={addServerFile}
        >
          <Icon name="plus" size={13} />
          <span>Add File</span>
        </button>
      </div>

      {/* Server Files List */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <Icon name="server" size={14} style={{ color: sc.accent }} />
          <span className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
            Server-Only Files & Overrides
          </span>
          <span className="badge text-[10.5px] px-1.5 py-0.5">{instance.serverFiles.length}</span>
        </div>

        {instance.serverFiles.length === 0 ? (
          <div
            className="p-8 text-center rounded-xl flex flex-col items-center justify-center"
            style={{ background: 'var(--bg-surface)', border: '1px dashed var(--border)' }}
          >
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center mb-2.5"
              style={{ background: 'var(--bg-muted)' }}
            >
              <Icon name="server" size={18} style={{ color: 'var(--text-muted)' }} />
            </div>
            <p className="text-xs font-medium text-[var(--text-primary)] mb-0.5">
              No server-specific files added
            </p>
            <p className="text-[11px] text-[var(--text-muted)]">
              Add server configs, start scripts, or JVM overrides to be bundled during server
              packaging.
            </p>
          </div>
        ) : (
          <div
            className="rounded-xl overflow-hidden divide-y divide-[var(--border)]"
            style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}
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
                      <div className="text-[13px] font-medium text-[var(--text-primary)] truncate">
                        {file.name}
                      </div>
                      <div className="text-[11px] text-[var(--text-muted)] flex items-center gap-2">
                        <span>
                          {file.type === 'script' ? 'Shell/Batch Script' : 'Config Override'}
                        </span>
                        <span>&middot;</span>
                        <span
                          className="px-1.5 py-0.5 text-[10px] rounded font-medium"
                          style={{ background: fileSc.soft, color: fileSc.accent }}
                        >
                          {fileSc.label}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 shrink-0">
                    <button
                      role="switch"
                      aria-checked={file.enabled}
                      aria-label={`Toggle ${file.name}`}
                      className={`theme-toggle-track ${file.enabled ? 'on' : ''}`}
                      style={file.enabled ? { background: fileSc.accent } : {}}
                      onClick={() => toggleFile(file.id)}
                    >
                      <div className="theme-toggle-knob" />
                    </button>
                    <button
                      className="btn-ghost p-1.5 rounded text-red-400 hover:text-red-300 hover:bg-red-500/10"
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

      {/* Export toggle option */}
      <div
        className="p-4 rounded-xl flex items-center justify-between"
        style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}
      >
        <div>
          <div className="text-[13px] font-medium text-[var(--text-primary)]">
            Bundle Server Files on Export
          </div>
          <div className="text-[11.5px] text-[var(--text-muted)]">
            Include these configurations when packaging a server release
          </div>
        </div>
        <button
          role="switch"
          aria-checked={instance.exportSettings.includeServer}
          aria-label="Include server files"
          className={`theme-toggle-track ${instance.exportSettings.includeServer ? 'on' : ''}`}
          style={instance.exportSettings.includeServer ? { background: sc.accent } : {}}
          onClick={() =>
            onUpdate({
              exportSettings: {
                ...instance.exportSettings,
                includeServer: !instance.exportSettings.includeServer,
              },
            })
          }
        >
          <div className="theme-toggle-knob" />
        </button>
      </div>
    </div>
  );
}
