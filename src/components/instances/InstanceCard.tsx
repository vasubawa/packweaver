import { Instance } from '../../types';
import { SOURCE_COLORS, formatBasePackName } from '../../constants';
import { mediaUrl } from '../../lib/mediaUrl';

interface InstanceCardProps {
  instance: Instance;
  onClick: (instance: Instance) => void;
}

export function InstanceCard({ instance, onClick }: InstanceCardProps) {
  const sc = SOURCE_COLORS[instance.source] || SOURCE_COLORS.local;
  const cover = mediaUrl(instance.bannerUrl || instance.iconUrl);
  const baseLabel = formatBasePackName(instance.basePack);
  const isInstalling =
    ((instance.status !== 'Ready' && !instance.status.startsWith('Error')) ||
      instance.status === 'syncing') &&
    instance.progress !== undefined;
  const pct = isInstalling
    ? instance.total
      ? Math.min(100, Math.round((instance.progress! / instance.total) * 100))
      : 0
    : 0;
  const statusLabel = instance.status.startsWith('Error')
    ? 'Error'
    : instance.status === 'syncing'
      ? 'Syncing...'
      : instance.status === 'Ready'
        ? 'Ready'
        : instance.status || 'Starting…';

  return (
    <div
      className="instance-card flex flex-col group relative overflow-hidden w-full h-full"
      onClick={() => onClick(instance)}
      role="button"
      tabIndex={0}
      style={{
        border: `1px solid ${sc.border || 'var(--border)'}`,
        background: 'var(--bg-surface)',
      }}
      onMouseEnter={e => {
        e.currentTarget.style.borderColor = sc.accent;
      }}
      onMouseLeave={e => {
        e.currentTarget.style.borderColor = sc.border || 'var(--border)';
      }}
      onKeyDown={e => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick(instance);
        }
      }}
    >
      <span className="instance-card-warp" style={{ background: sc.accent }} aria-hidden />

      <div
        className="relative overflow-hidden shrink-0 flex items-start justify-between p-3.5"
        style={{
          height: 86,
          background: cover
            ? `url(${cover}) center/cover no-repeat`
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
        {instance.hasUpdate ? (
          <span
            className="badge badge-mono"
            style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}
          >
            Update
          </span>
        ) : null}
      </div>

      {isInstalling ? (
        <div className="warp-thread" aria-hidden>
          <div className="warp-thread-fill" style={{ width: `${pct}%` }} />
        </div>
      ) : null}

      <div className="px-4 pb-4 pt-3 flex flex-col flex-1 justify-between gap-3 relative">
        <div>
          <div className="flex items-baseline justify-between gap-2 mb-1">
            <h3
              className="text-[14.5px] font-semibold tracking-tight leading-snug line-clamp-2"
              style={{
                color: 'var(--text-primary)',
                wordBreak: 'break-word',
                fontFamily: 'var(--font-heading)',
              }}
              title={instance.name}
            >
              {instance.name}
            </h3>
            <span
              className="text-[11px] font-medium shrink-0"
              title={instance.status.startsWith('Error') ? instance.status : undefined}
              style={{
                color: instance.status.startsWith('Error')
                  ? 'var(--danger)'
                  : instance.status === 'Ready'
                    ? 'var(--success)'
                    : instance.status !== 'syncing'
                      ? 'var(--accent)'
                      : 'var(--text-muted)',
              }}
            >
              {statusLabel}
            </span>
          </div>

          {instance.description ? (
            <p
              className="text-[13px] leading-relaxed line-clamp-2"
              style={{ color: 'var(--text-secondary)' }}
              title={instance.description}
            >
              {instance.description}
            </p>
          ) : (
            <p className="text-[13px]" style={{ color: 'var(--text-muted)' }}>
              No description provided
            </p>
          )}
        </div>

        <div className="font-mono-meta flex items-center gap-2 flex-wrap">
          <span title={instance.basePack}>{baseLabel}</span>
          {instance.loader ? (
            <>
              <span aria-hidden>·</span>
              <span>{instance.loader}</span>
            </>
          ) : null}
          <span aria-hidden>·</span>
          <span>{instance.totalModCount} mods</span>
          {instance.customModCount > 0 && (
            <>
              <span aria-hidden>·</span>
              <span style={{ color: sc.accent }}>+{instance.customModCount} custom</span>
            </>
          )}
          {isInstalling ? (
            <>
              <span aria-hidden>·</span>
              <span>{pct}%</span>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}
