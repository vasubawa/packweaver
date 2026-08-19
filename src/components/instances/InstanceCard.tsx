import { Icon } from '../Icon';
import { Instance } from '../../types';
import { SOURCE_COLORS } from '../../constants';

interface InstanceCardProps {
  instance: Instance;
  onClick: (instance: Instance) => void;
  onExport: (instance: Instance) => void;
}

export function InstanceCard({ instance, onClick, onExport }: InstanceCardProps) {
  const sc = SOURCE_COLORS[instance.source] || SOURCE_COLORS.local;
  return (
    <div
      className="instance-card flex flex-col"
      onClick={() => onClick(instance)}
      role="button"
      tabIndex={0}
      onKeyDown={e => e.key === 'Enter' && onClick(instance)}
    >
      <div
        className="relative overflow-hidden shrink-0"
        style={{ height: 100, background: instance.bannerGradient || 'var(--bg-muted)' }}
      >
        <div
          className="absolute inset-0"
          style={{ background: 'linear-gradient(180deg, transparent 30%, var(--bg-surface) 100%)' }}
        />
      </div>
      <div className="px-4 pb-4 pt-2 flex flex-col flex-1">
        <div className="flex items-start justify-between gap-2 mb-1.5">
          <h3
            className="text-[14px] font-semibold leading-snug truncate"
            style={{ color: 'var(--text-primary)' }}
          >
            {instance.name}
          </h3>
          <div className="flex items-center gap-1.5 flex-shrink-0 mt-0.5">
            <span className="status-dot" style={{ background: sc.dot }} />
            <span className="text-[11px] font-medium" style={{ color: 'var(--text-muted)' }}>
              {instance.status === 'syncing' ? 'Syncing' : 'Ready'}
            </span>
          </div>
        </div>
        <p
          className="text-[12px] leading-relaxed mb-3 line-clamp-2 flex-1"
          style={{ color: 'var(--text-secondary)' }}
        >
          {instance.description}
        </p>

        {instance.status === 'syncing' && instance.progress !== undefined && (
          <div className="mb-3">
            <div className="progress-track">
              <div
                className="progress-fill"
                style={{ width: `${instance.progress}%`, background: sc.accent }}
              />
            </div>
            <span className="text-[10.5px] mt-1 block" style={{ color: 'var(--text-muted)' }}>
              {instance.progress}%
            </span>
          </div>
        )}

        <div className="flex items-center gap-2 flex-wrap">
          <span
            className="badge"
            style={{ background: sc.soft, color: sc.accent, borderColor: 'transparent' }}
          >
            Base: {instance.basePack}
          </span>
          <span className="badge">{instance.mcVersion}</span>
          <span className="badge">{instance.loader}</span>
          <span className="badge">{instance.totalModCount} mods</span>
          {instance.customModCount > 0 && (
            <span
              className="badge"
              style={{
                background: 'var(--accent-soft)',
                color: 'var(--accent)',
                borderColor: 'transparent',
              }}
            >
              +{instance.customModCount} custom
            </span>
          )}
          {instance.hasUpdate && <span className="badge update-badge">Update Available</span>}
        </div>

        <div
          className="flex items-center justify-between mt-3 pt-3"
          style={{ borderTop: '1px solid var(--border)' }}
        >
          <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
            Exported {instance.lastExported}
          </span>
          <div className="flex items-center gap-1">
            <button
              className="btn-ghost"
              onClick={e => {
                e.stopPropagation();
                onExport(instance);
              }}
              title="Export pack"
              style={{ color: sc.accent }}
            >
              <Icon name="package" size={14} />
            </button>
            <button className="btn-ghost" onClick={e => e.stopPropagation()} title="More options">
              <Icon name="moreH" size={14} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
