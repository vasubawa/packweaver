import { ReactNode } from 'react';
import { AnyPlugin } from '../../plugins';

interface PluginCardProps {
  plugin: AnyPlugin;
  onToggle: (plugin: AnyPlugin) => void;
  subtitle: ReactNode;
  statusEnabledLabel?: string;
  footerRight?: ReactNode;
  children?: ReactNode;
}

export function PluginCard({
  plugin,
  onToggle,
  subtitle,
  statusEnabledLabel = 'Active',
  footerRight,
  children,
}: PluginCardProps) {
  return (
    <div
      className="rounded-xl p-4 flex flex-col justify-between transition-all"
      style={{
        background: 'var(--bg-surface)',
        border: `1px solid ${plugin.enabled ? 'var(--border)' : 'var(--border-subtle, var(--border))'}`,
        opacity: plugin.enabled ? 1 : 0.75,
      }}
    >
      <div>
        <div className="flex items-start justify-between gap-3 mb-2">
          <div className="flex items-center gap-2.5">
            <div
              className="w-8 h-8 rounded-lg flex items-center justify-center text-base shrink-0"
              style={{ background: 'var(--bg-muted)', border: '1px solid var(--border)' }}
            >
              {plugin.fallbackEmoji}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span
                  className="text-[13px] font-semibold"
                  style={{ color: 'var(--text-primary)' }}
                >
                  {plugin.name}
                </span>
                <span
                  className="text-[10px] px-1.5 py-0.5 rounded font-mono"
                  style={{ background: 'var(--bg-muted)', color: 'var(--text-muted)' }}
                >
                  v{plugin.version}
                </span>
              </div>
              <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                {subtitle}
              </span>
            </div>
          </div>

          {plugin.isCore ? (
            <span
              className="text-[10.5px] font-semibold px-2 py-0.5 rounded-full"
              style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}
            >
              Core
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

        <p className="text-[12px] leading-relaxed mb-3" style={{ color: 'var(--text-muted)' }}>
          {plugin.description}
        </p>
      </div>

      <div
        className="pt-2 flex items-center justify-between"
        style={{ borderTop: '1px solid var(--border)' }}
      >
        <span
          className="text-[11px] font-medium"
          style={{ color: plugin.enabled ? 'var(--accent)' : 'var(--text-muted)' }}
        >
          {plugin.isCore
            ? '● Always Active'
            : plugin.enabled
              ? `● ${statusEnabledLabel}`
              : '○ Disabled'}
        </span>

        {footerRight}
      </div>

      {children}
    </div>
  );
}
