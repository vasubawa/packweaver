import { useState } from 'react';
import { Icon } from '../Icon';
import { SOURCE_COLORS } from '../instances/InstanceCard';
import { Instance, ModSource } from '../../types';

interface ServerFilesTabProps {
  instance: Instance;
  onUpdate: (updates: Partial<Instance>) => void;
}

export function ServerFilesTab({ instance, onUpdate }: ServerFilesTabProps) {
  const [newFileName, setNewFileName] = useState('');
  const [addFileSource, setAddFileSource] = useState<ModSource>('local');

  const toggleFile = (idx: number) => {
    onUpdate({
      serverFiles: instance.serverFiles.map((f, i) =>
        i === idx ? { ...f, enabled: !f.enabled } : f
      ),
    });
  };

  const removeFile = (idx: number) => {
    onUpdate({
      serverFiles: instance.serverFiles.filter((_, i) => i !== idx),
    });
  };

  const addServerFile = () => {
    if (!newFileName.trim()) return;
    onUpdate({
      serverFiles: [
        ...instance.serverFiles,
        { name: newFileName.trim(), type: 'config', source: addFileSource, enabled: true },
      ],
    });
    setNewFileName('');
  };

  return (
    <div className="animate-slide-in max-w-2xl">
      <div className="add-mod-bar">
        <select
          className="form-select"
          value={addFileSource}
          onChange={e => setAddFileSource(e.target.value as ModSource)}
        >
          <option value="local">Local File</option>
          <option value="modrinth">Modrinth</option>
          <option value="curseforge">CurseForge</option>
        </select>
        <input
          className="form-input"
          placeholder="Add server file..."
          value={newFileName}
          onChange={e => setNewFileName(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && addServerFile()}
        />
        <button
          className="btn-accent"
          onClick={addServerFile}
          style={{ padding: '5px 12px', fontSize: 12 }}
        >
          <Icon name="plus" size={13} />
          Add
        </button>
      </div>

      <div>
        <div className="flex items-center gap-2 mb-3">
          <Icon name="server" size={14} style={{ color: 'var(--text-muted)' }} />
          <span
            className="text-xs font-semibold uppercase tracking-wider"
            style={{ color: 'var(--text-muted)' }}
          >
            Server Files
          </span>
          <span className="badge" style={{ fontSize: 10 }}>
            {instance.serverFiles.length}
          </span>
        </div>
        {instance.serverFiles.length === 0 ? (
          <div className="py-8 text-center">
            <div
              className="flex items-center justify-center rounded-2xl mb-3 mx-auto"
              style={{
                width: 48,
                height: 48,
                background: 'var(--bg-muted)',
                border: '1px solid var(--border)',
              }}
            >
              <Icon name="server" size={20} />
            </div>
            <p className="text-sm font-medium mb-1" style={{ color: 'var(--text-primary)' }}>
              No server files
            </p>
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
              Add config files or scripts for your server
            </p>
          </div>
        ) : (
          instance.serverFiles.map((file, idx) => (
            <div key={idx} className="mod-row">
              <div className="flex items-center gap-3">
                <Icon
                  name={file.type === 'script' ? 'fileCode' : 'settings'}
                  size={14}
                  style={{ color: 'var(--text-muted)', flexShrink: 0 }}
                />
                <div className="flex items-center gap-2.5">
                  <div>
                    <div
                      className="text-[13px] font-medium"
                      style={{ color: 'var(--text-primary)' }}
                    >
                      {file.name}
                    </div>
                    <div className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                      {file.type === 'script' ? 'Script' : 'Config'} &middot;{' '}
                      {SOURCE_COLORS[file.source]?.label || 'Local'}
                    </div>
                  </div>
                  <span className={`source-badge source-badge-${file.source}`}>
                    <span className="source-badge-dot" />
                    {SOURCE_COLORS[file.source]?.label || 'Local'}
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  className={`toggle-track ${file.enabled ? SOURCE_COLORS[file.source]?.toggleClass || 'on-local' : ''}`}
                  onClick={() => toggleFile(idx)}
                >
                  <div className="toggle-knob" />
                </button>
                <button className="btn-ghost" onClick={() => removeFile(idx)} title="Remove file">
                  <Icon name="trash" size={13} />
                </button>
              </div>
            </div>
          ))
        )}
      </div>
      <div className="mt-6 pt-4" style={{ borderTop: '1px solid var(--border)' }}>
        <div className="setting-row" style={{ borderBottom: 'none', padding: '10px 0' }}>
          <div>
            <div className="text-[13px] font-medium" style={{ color: 'var(--text-primary)' }}>
              Include server files in Export
            </div>
            <div className="text-[11.5px]" style={{ color: 'var(--text-muted)' }}>
              Bundle server-side configs and scripts with your exported pack
            </div>
          </div>
          <button
            className={`toggle-track ${instance.exportSettings.includeServer ? 'on' : ''}`}
            onClick={() =>
              onUpdate({
                exportSettings: {
                  ...instance.exportSettings,
                  includeServer: !instance.exportSettings.includeServer,
                },
              })
            }
          >
            <div className="toggle-knob" />
          </button>
        </div>
      </div>
    </div>
  );
}
