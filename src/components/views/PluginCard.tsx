import { ReactNode, type CSSProperties } from 'react';
import { AnyPlugin } from '../../plugins';

interface PluginCardProps {
  plugin: AnyPlugin;
  onToggle: (plugin: AnyPlugin) => void;
  subtitle: ReactNode;
  statusEnabledLabel?: string;
  footerRight?: ReactNode;
  children?: ReactNode;
  stripeColor?: string;
}

export function PluginCard({
  plugin,
  onToggle,
  subtitle,
  statusEnabledLabel = 'Active',
  footerRight,
  children,
  stripeColor,
}: PluginCardProps) {
  const stripe =
    stripeColor ||
    (plugin.enabled ? 'var(--accent)' : plugin.comingSoon ? 'var(--border)' : 'var(--border)');

  return (
    <div
      className={`plugin-card ${plugin.enabled ? 'is-on' : 'is-off'}`}
      style={{ '--plugin-stripe': stripe } as CSSProperties}
    >
      <div>
        <div className="flex items-start justify-between gap-3 mb-2">
          <div className="flex items-center gap-2.5 min-w-0">
            <div
              className="w-8 h-8 flex items-center justify-center text-base shrink-0"
              style={{
                background: 'var(--bg-muted)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius-sm)',
              }}
            >
              {plugin.fallbackEmoji}
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span
                  className="text-[13px] font-semibold"
                  style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-heading)' }}
                >
                  {plugin.name}
                </span>
                <span className="badge badge-mono">v{plugin.version}</span>
              </div>
              <span className="text-[12px]" style={{ color: 'var(--text-secondary)' }}>
                {subtitle}
              </span>
            </div>
          </div>

          {plugin.isCore ? (
            <span
              className="badge shrink-0"
              style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}
            >
              Core
            </span>
          ) : plugin.comingSoon ? (
            <span className="badge shrink-0" style={{ color: 'var(--text-muted)' }}>
              Coming soon
            </span>
          ) : (
            <button
              role="switch"
              aria-checked={plugin.enabled}
              aria-label={`Toggle ${plugin.name}`}
              className={`theme-toggle-track ${plugin.enabled ? 'on' : ''}`}
              onClick={() => onToggle(plugin)}
            >
              <div className="theme-toggle-knob" />
            </button>
          )}
        </div>

        <p className="text-[13px] leading-relaxed mb-3" style={{ color: 'var(--text-secondary)' }}>
          {plugin.description}
        </p>
      </div>

      <div
        className="pt-2 flex items-center justify-between gap-2"
        style={{ borderTop: '1px solid var(--border)' }}
      >
        <span
          className="font-mono-meta"
          style={{ color: plugin.enabled ? 'var(--success)' : 'var(--text-muted)' }}
        >
          {plugin.isCore
            ? 'Always on'
            : plugin.comingSoon
              ? 'Coming soon'
              : plugin.enabled
                ? statusEnabledLabel
                : 'Off'}
        </span>

        {footerRight}
      </div>

      {children}
    </div>
  );
}
