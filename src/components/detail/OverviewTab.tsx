import { useState } from 'react';
import { Instance } from '../../types';
import { SOURCE_COLORS, formatBasePackName } from '../../constants';
import { getActiveExporterPlugins } from '../../plugins';
import { Icon } from '../Icon';

interface OverviewTabProps {
  instance: Instance;
  onUpdate: (updates: Partial<Instance>) => void;
}

export function OverviewTab({ instance, onUpdate }: OverviewTabProps) {
  const [isEditingDesc, setIsEditingDesc] = useState(false);
  const [descInput, setDescInput] = useState(instance.description || '');
  const [prevInstanceId, setPrevInstanceId] = useState(instance.id);

  if (instance.id !== prevInstanceId) {
    setPrevInstanceId(instance.id);
    setDescInput(instance.description || '');
  }

  const sc = SOURCE_COLORS[instance.source] || SOURCE_COLORS.local;
  const exporterPlugins = getActiveExporterPlugins();

  const displayBasePack = formatBasePackName(instance.basePack);

  const handleDescSave = () => {
    onUpdate({ description: descInput.trim() });
    setIsEditingDesc(false);
  };

  const statCards = [
    {
      label: 'Base Pack',
      value: displayBasePack,
      sub: instance.basePackVersion ? `v${instance.basePackVersion}` : undefined,
      fullText: instance.basePack,
    },
    { label: 'Mod Loader', value: instance.loader, sub: 'Runtime loader' },
    {
      label: 'Total Mods',
      value: `${instance.totalModCount} mods`,
      sub:
        instance.customModCount > 0 ? `+${instance.customModCount} custom added` : 'From base pack',
    },
    { label: 'Minecraft', value: instance.mcVersion, sub: 'Game target' },
    {
      label: 'Last Exported',
      value: instance.lastExported || 'Never',
      sub: instance.lastExported ? 'Ready to share' : 'Unsaved export',
    },
    {
      label: 'Package Format',
      value: instance.exportSettings?.format?.toUpperCase() || 'ZIP',
      sub: `Pack v${instance.exportSettings?.version || '1.0.0'}`,
    },
  ];

  return (
    <div className="animate-slide-in max-w-3xl flex flex-col gap-6">
      {/* Description Card */}
      <div
        className="p-4 rounded-xl relative group transition-colors"
        style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}
      >
        <div className="flex items-center justify-between mb-2">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
            About this Pack
          </span>
          {!isEditingDesc && (
            <button
              className="btn-ghost text-xs py-0.5 px-2 opacity-0 group-hover:opacity-100 transition-opacity"
              onClick={() => {
                setDescInput(instance.description || '');
                setIsEditingDesc(true);
              }}
            >
              <Icon name="pencil" size={12} />
              <span className="ml-1 text-[11px]">Edit</span>
            </button>
          )}
        </div>

        {isEditingDesc ? (
          <div className="flex flex-col gap-2">
            <textarea
              className="form-input text-xs leading-relaxed"
              rows={3}
              placeholder="Add a description for this modpack..."
              value={descInput}
              onChange={e => setDescInput(e.target.value)}
              autoFocus
            />
            <div className="flex justify-end gap-2">
              <button
                className="btn-ghost text-xs px-2.5 py-1"
                onClick={() => setIsEditingDesc(false)}
              >
                Cancel
              </button>
              <button className="btn-primary text-xs px-3 py-1" onClick={handleDescSave}>
                Save Description
              </button>
            </div>
          </div>
        ) : (
          <p className="text-[13px] leading-relaxed text-[var(--text-secondary)]">
            {instance.description || (
              <span className="italic text-[var(--text-muted)]">
                No description provided. Click edit to add notes or pack instructions.
              </span>
            )}
          </p>
        )}
      </div>

      {/* Grid of Spec Cards */}
      <div>
        <h3 className="text-xs font-semibold uppercase tracking-wider mb-3 text-[var(--text-muted)]">
          Pack Specifications
        </h3>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {statCards.map(item => (
            <div
              key={item.label}
              className="p-3.5 rounded-xl min-w-0 overflow-hidden flex flex-col justify-between"
              style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}
            >
              <span className="text-[11px] font-medium text-[var(--text-muted)] mb-1 block">
                {item.label}
              </span>
              <div
                className="text-[13.5px] font-semibold text-[var(--text-primary)] truncate"
                title={item.fullText || item.value}
              >
                {item.value}
              </div>
              {item.sub && (
                <span className="text-[11px] text-[var(--text-muted)] truncate mt-0.5 block">
                  {item.sub}
                </span>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Export Configuration */}
      <div>
        <h3 className="text-xs font-semibold uppercase tracking-wider mb-3 text-[var(--text-muted)]">
          Export Configuration
        </h3>
        <div
          className="p-4 rounded-xl flex flex-col gap-4"
          style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="form-label mb-1.5 block text-xs font-medium">
                Pack Release Version
              </label>
              <input
                className="form-input text-xs"
                placeholder="1.0.0"
                value={instance.exportSettings.version}
                onChange={e =>
                  onUpdate({
                    exportSettings: { ...instance.exportSettings, version: e.target.value },
                  })
                }
              />
              <p className="text-[11px] mt-1 text-[var(--text-muted)]">
                Included in export manifest and zip naming.
              </p>
            </div>

            <div>
              <label className="form-label mb-1.5 block text-xs font-medium">
                Export Packager Format
              </label>
              <select
                className="form-select text-xs w-full"
                value={instance.exportSettings.format || 'zip'}
                onChange={e =>
                  onUpdate({
                    exportSettings: { ...instance.exportSettings, format: e.target.value as any },
                  })
                }
              >
                {exporterPlugins.length > 0 ? (
                  exporterPlugins.map(exporter => (
                    <option key={exporter.id} value={exporter.targetFormat}>
                      {exporter.name} ({exporter.fileExtension})
                    </option>
                  ))
                ) : (
                  <>
                    <option value="zip">Universal ZIP (.zip)</option>
                    <option value="mrpack">Modrinth (.mrpack)</option>
                    <option value="server">Server Pack (.zip)</option>
                  </>
                )}
              </select>
            </div>
          </div>

          <div className="pt-3" style={{ borderTop: '1px solid var(--border)' }}>
            <div className="flex items-center justify-between">
              <div>
                <div className="text-[13px] font-medium text-[var(--text-primary)]">
                  Include server files & configs
                </div>
                <div className="text-[11.5px] text-[var(--text-muted)]">
                  Bundle server-side scripts, configs, and startup tools alongside mod files
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
        </div>
      </div>
    </div>
  );
}
