import { useState } from 'react';
import { Icon } from '../Icon';
import { Instance } from '../../types';
import { SOURCE_COLORS } from '../instances/InstanceCard';

interface DetailHeaderProps {
  instance: Instance;
  onBack: () => void;
  onExport: () => void;
  onUpdate: (updates: Partial<Instance>) => void;
}

export function DetailHeader({ instance, onBack, onExport, onUpdate }: DetailHeaderProps) {
  const [isEditingName, setIsEditingName] = useState(false);
  const [editName, setEditName] = useState(instance.name);
  const sc = SOURCE_COLORS[instance.source] || SOURCE_COLORS.local;

  const handleNameSave = () => {
    if (editName.trim()) {
      onUpdate({ name: editName.trim() });
    } else {
      setEditName(instance.name);
    }
    setIsEditingName(false);
  };

  return (
    <>
      <div
        className="detail-banner"
        style={{ background: instance.bannerGradient || 'var(--bg-muted)', flexShrink: 0 }}
      >
        <div className="detail-banner-gradient" />
        <button
          className="btn-ghost absolute top-4 left-4 z-10"
          onClick={onBack}
          style={{
            background: 'var(--bg-surface)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-sm)',
            padding: '6px 10px',
          }}
        >
          <Icon name="arrowLeft" size={15} />
          <span className="text-xs font-medium ml-1">Back</span>
        </button>
      </div>

      <div className="px-6 -mt-10 relative z-10 flex-shrink-0">
        <div className="flex items-end justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="status-dot" style={{ background: sc.dot }} />
              <span className="text-[11px] font-medium" style={{ color: sc.accent }}>
                {sc.label}
              </span>
            </div>

            {isEditingName ? (
              <div className="flex items-center gap-2 mb-1">
                <input
                  className="form-input text-xl font-bold tracking-tight py-1"
                  style={{ fontFamily: "'Newsreader', Georgia, serif", width: '300px' }}
                  value={editName}
                  onChange={e => setEditName(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') handleNameSave();
                    if (e.key === 'Escape') {
                      setEditName(instance.name);
                      setIsEditingName(false);
                    }
                  }}
                  autoFocus
                  onBlur={handleNameSave}
                />
              </div>
            ) : (
              <div className="flex items-center gap-2 mb-1 group">
                <h2
                  className="text-2xl font-bold tracking-tight"
                  style={{
                    color: 'var(--text-primary)',
                    fontFamily: "'Newsreader', Georgia, serif",
                  }}
                >
                  {instance.name}
                </h2>
                <button
                  className="btn-ghost opacity-0 group-hover:opacity-100 transition-opacity"
                  onClick={() => setIsEditingName(true)}
                >
                  <Icon name="pencil" size={14} />
                </button>
              </div>
            )}

            <div className="flex items-center gap-2 text-xs" style={{ color: 'var(--text-muted)' }}>
              <span>
                {instance.basePack} {instance.basePackVersion}
              </span>
              <span className="text-zinc-400">&middot;</span>
              <span>{instance.mcVersion}</span>
              <span className="text-zinc-400">&middot;</span>
              <span>{instance.loader}</span>
              <span className="text-zinc-400">&middot;</span>
              <span>{instance.totalModCount} mods</span>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-shrink-0">
            {instance.hasUpdate && (
              <span className="badge update-badge" style={{ fontSize: 11 }}>
                Update Available
              </span>
            )}
            <button className="btn-secondary">
              <Icon name="refresh" size={14} />
              Update Pack
            </button>
            <button className="btn-accent" onClick={onExport} style={{ background: sc.accent }}>
              <Icon name="package" size={14} />
              Export Pack
            </button>
            <button
              className="btn-ghost"
              style={{
                padding: '8px',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius-sm)',
              }}
            >
              <Icon name="trash" size={15} style={{ color: 'var(--danger)' }} />
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
