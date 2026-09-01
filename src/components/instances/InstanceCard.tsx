import { Instance } from '../../types';
import { SOURCE_COLORS } from '../../constants';
interface InstanceCardProps {
  instance: Instance;
  onClick: (instance: Instance) => void;
  onDelete?: (id: string) => void;
}

export function InstanceCard({ instance, onClick }: InstanceCardProps) {
  const sc = SOURCE_COLORS[instance.source] || SOURCE_COLORS.local;

  return (
    <div
      className="instance-card flex flex-col group relative overflow-hidden transition-all duration-200"
      onClick={() => onClick(instance)}
      role="button"
      tabIndex={0}
      style={{
        border: `1px solid ${sc.border || 'var(--border)'}`,
        background: sc.soft,
      }}
      onMouseEnter={e => {
        e.currentTarget.style.borderColor = sc.accent;
        e.currentTarget.style.boxShadow = `0 4px 20px -2px ${sc.soft}`;
      }}
      onMouseLeave={e => {
        e.currentTarget.style.borderColor = sc.border || 'var(--border)';
        e.currentTarget.style.boxShadow = 'none';
      }}
      onKeyDown={e => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick(instance);
        }
      }}
    >
      {/* Banner with source-themed gradient */}
      <div
        className="relative overflow-hidden shrink-0 flex items-start justify-between p-3.5"
        style={{
          height: 86,
          background:
            instance.bannerUrl || instance.iconUrl
              ? `url(${instance.bannerUrl || instance.iconUrl}) center/cover no-repeat`
              : instance.bannerGradient || sc.gradient,
        }}
      >
        <span className="card-banner-badge">
          <span
            className="w-2 h-2 rounded-full mr-1.5 inline-block shrink-0"
            style={{ background: sc.dot }}
          />
          {sc.label}
        </span>
      </div>

      {/* Card Body */}
      <div className="px-4 pb-4 pt-3 flex flex-col flex-1 justify-between gap-3 relative">
        <div>
          <div className="flex items-baseline justify-between gap-2 mb-1">
            <h3
              className="text-[14.5px] font-semibold tracking-tight leading-snug line-clamp-2"
              style={{ color: 'var(--text-primary)', wordBreak: 'break-word' }}
            >
              {instance.name}
            </h3>
            <span
              className="text-[11px] font-medium shrink-0"
              style={{ color: 'var(--text-muted)' }}
            >
              {instance.status === 'syncing' ? 'Syncing...' : 'Ready'}
            </span>
          </div>

          {instance.description ? (
            <p
              className="text-[12px] leading-relaxed line-clamp-2"
              style={{ color: 'var(--text-secondary)' }}
            >
              {instance.description}
            </p>
          ) : (
            <p className="text-[12px] italic" style={{ color: 'var(--text-muted)' }}>
              No description provided
            </p>
          )}
        </div>

        {instance.status === 'syncing' &&
          instance.progress !== undefined &&
          (() => {
            const pct = instance.total
              ? Math.min(100, Math.round((instance.progress! / instance.total) * 100))
              : 0;
            return (
              <div>
                <div className="progress-track">
                  <div
                    className="progress-fill"
                    style={{ width: `${pct}%`, background: sc.accent }}
                  />
                </div>
                <span className="text-[10.5px] mt-1 block" style={{ color: 'var(--text-muted)' }}>
                  {pct}%
                </span>
              </div>
            );
          })()}

        {/* Tags */}
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="badge text-[11px] px-2 py-0.5">{instance.mcVersion}</span>
          <span className="badge text-[11px] px-2 py-0.5">{instance.loader}</span>
          <span className="badge text-[11px] px-2 py-0.5">{instance.totalModCount} mods</span>
          {instance.customModCount > 0 && (
            <span
              className="badge text-[11px] px-2 py-0.5"
              style={{
                background: sc.soft,
                color: sc.accent,
                borderColor: sc.border,
              }}
            >
              +{instance.customModCount} custom
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
