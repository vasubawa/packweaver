import { Instance } from '../../types';

interface OverviewTabProps {
  instance: Instance;
  onUpdate: (updates: Partial<Instance>) => void;
}

export function OverviewTab({ instance, onUpdate }: OverviewTabProps) {
  return (
    <div className="animate-slide-in max-w-2xl">
      <p className="text-[13.5px] leading-relaxed mb-6" style={{ color: 'var(--text-secondary)' }}>
        {instance.description}
      </p>
      <div className="grid grid-cols-3 gap-4 mb-6">
        {[
          { label: 'Base Pack', value: `${instance.basePack} ${instance.basePackVersion}` },
          { label: 'Mod Loader', value: instance.loader },
          {
            label: 'Total Mods',
            value: `${instance.totalModCount} (${instance.customModCount} custom)`,
          },
          { label: 'MC Version', value: instance.mcVersion },
          { label: 'Last Exported', value: instance.lastExported },
          { label: 'File Size', value: instance.fileSize },
        ].map(item => (
          <div
            key={item.label}
            className="p-3 rounded-lg"
            style={{ background: 'var(--bg-muted)', border: '1px solid var(--border)' }}
          >
            <div className="text-[11px] font-medium mb-1" style={{ color: 'var(--text-muted)' }}>
              {item.label}
            </div>
            <div className="text-[13.5px] font-semibold" style={{ color: 'var(--text-primary)' }}>
              {item.value}
            </div>
          </div>
        ))}
      </div>

      <h3 className="text-sm font-semibold mb-3">Export Configuration</h3>
      <div
        className="p-4 rounded-lg flex flex-col gap-4"
        style={{ background: 'var(--bg-muted)', border: '1px solid var(--border)' }}
      >
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="form-label">Pack Version</label>
            <input
              className="form-input"
              value={instance.exportSettings.version}
              onChange={e =>
                onUpdate({
                  exportSettings: { ...instance.exportSettings, version: e.target.value },
                })
              }
            />
            <p className="text-[11px] mt-1" style={{ color: 'var(--text-muted)' }}>
              Bump this version before exporting an update.
            </p>
          </div>
          <div>
            <label className="form-label">Export Format</label>
            <select
              className="form-select"
              value={instance.exportSettings.format || 'zip'}
              onChange={e =>
                onUpdate({
                  exportSettings: { ...instance.exportSettings, format: e.target.value as any },
                })
              }
            >
              <option value="zip">Universal ZIP</option>
              <option value="mrpack">Modrinth (.mrpack)</option>
              <option value="curseforge">CurseForge (.zip)</option>
            </select>
          </div>
        </div>

        <div className="pt-4" style={{ borderTop: '1px solid var(--border)' }}>
          <div className="setting-row" style={{ borderBottom: 'none', padding: '0' }}>
            <div>
              <div className="text-[13px] font-medium" style={{ color: 'var(--text-primary)' }}>
                Include server files
              </div>
              <div className="text-[11.5px]" style={{ color: 'var(--text-muted)' }}>
                Bundle server-side configs and scripts
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
    </div>
  );
}
