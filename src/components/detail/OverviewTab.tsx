import { useState, useEffect, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { Instance } from '../../types';
import { SOURCE_COLORS, formatBasePackName } from '../../constants';
import { getActiveExporterPlugins } from '../../plugins';
import { Icon } from '../Icon';

interface OverviewTabProps {
  instance: Instance;
  onUpdate: (updates: Partial<Instance>) => void;
}

type StageStatus = 'idle' | 'running' | 'done' | 'error';

interface StageState {
  status: StageStatus;
  message: string;
}

const IDLE_STAGES: Record<string, StageState> = {
  downloadMods: {
    status: 'idle',
    message: 'Download custom mods from Modrinth or copy local files',
  },
  assemble: { status: 'idle', message: 'Slot mods and server files into the workspace' },
  package: { status: 'idle', message: 'Zip workspace into the selected output format' },
};

export function OverviewTab({ instance, onUpdate }: OverviewTabProps) {
  const [isEditingDesc, setIsEditingDesc] = useState(false);
  const [descInput, setDescInput] = useState(instance.description || '');
  const [prevInstanceId, setPrevInstanceId] = useState(instance.id);
  const [stages, setStages] = useState<Record<string, StageState>>(IDLE_STAGES);
  const [pipelineRunning, setPipelineRunning] = useState(false);
  const unlistenRef = useRef<(() => void) | null>(null);

  // Subscribe to export-progress events from the backend
  useEffect(() => {
    let cancelled = false;
    listen<{ instance_id: string; status: string; progress: number; total: number }>(
      'export-progress',
      event => {
        if (cancelled || event.payload.instance_id !== instance.id) return;
        const { status, progress, total } = event.payload;
        setStages(prev => ({
          ...prev,
          downloadMods: {
            status:
              total > 0 && progress < total
                ? 'running'
                : progress === total && total > 0
                  ? 'done'
                  : prev.downloadMods.status,
            message: status,
          },
        }));
      }
    ).then(fn => {
      unlistenRef.current = fn;
    });
    return () => {
      cancelled = true;
      unlistenRef.current?.();
    };
  }, [instance.id]);

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

  const setStage = (key: string, status: StageStatus, message: string) =>
    setStages(prev => ({ ...prev, [key]: { status, message } }));

  const runDownloadMods = async () => {
    if (pipelineRunning) return;
    setPipelineRunning(true);
    setStage('downloadMods', 'running', 'Starting download…');
    try {
      const count = await invoke<number>('download_custom_mods', { instanceId: instance.id });
      setStage(
        'downloadMods',
        'done',
        count === 0
          ? 'No custom mods to download'
          : `${count} mod${count !== 1 ? 's' : ''} downloaded`
      );
    } catch (e) {
      setStage('downloadMods', 'error', String(e));
    } finally {
      setPipelineRunning(false);
    }
  };

  const runAssemble = async () => {
    if (pipelineRunning) return;
    setPipelineRunning(true);
    setStage('assemble', 'running', 'Assembling workspace…');
    // TODO: invoke('assemble_workspace', { instanceId: instance.id })
    await new Promise(r => setTimeout(r, 800)); // stub delay
    setStage('assemble', 'done', 'Workspace assembled (stub)');
    setPipelineRunning(false);
  };

  const runPackage = async () => {
    if (pipelineRunning) return;
    setPipelineRunning(true);
    setStage('package', 'running', 'Packaging…');
    // TODO: invoke('export_instance', { instanceId: instance.id, format: instance.exportSettings.format })
    await new Promise(r => setTimeout(r, 800)); // stub delay
    setStage('package', 'done', 'Packaged (stub — save dialog coming)');
    setPipelineRunning(false);
  };

  const resetPipeline = () => {
    if (pipelineRunning) return;
    setStages(IDLE_STAGES);
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
    <div className="animate-slide-in flex flex-col gap-6">
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
        <div className="grid grid-cols-3 gap-3">
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
          <div className="grid grid-cols-2 gap-4">
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
                  Include server files &amp; configs
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

      {/* Export Pipeline */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
            Export Pipeline
          </h3>
          <button
            className="btn-ghost text-[11px] px-2 py-0.5"
            onClick={resetPipeline}
            disabled={pipelineRunning}
          >
            Reset
          </button>
        </div>
        <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--border)' }}>
          {(
            [
              {
                key: 'downloadMods',
                label: '① Download Custom Mods',
                onRun: runDownloadMods,
              },
              {
                key: 'assemble',
                label: '② Assemble Workspace',
                onRun: runAssemble,
              },
              {
                key: 'package',
                label: '③ Package & Export',
                onRun: runPackage,
              },
            ] as const
          ).map(({ key, label, onRun }, i, arr) => {
            const stage = stages[key];
            const isLast = i === arr.length - 1;
            const iconName =
              stage.status === 'running'
                ? 'refresh'
                : stage.status === 'done'
                  ? 'check'
                  : stage.status === 'error'
                    ? 'x'
                    : 'info';
            const iconColor =
              stage.status === 'running'
                ? 'var(--color-accent)'
                : stage.status === 'done'
                  ? '#22c55e'
                  : stage.status === 'error'
                    ? '#ef4444'
                    : 'var(--text-muted)';

            return (
              <div
                key={key}
                className="flex items-center justify-between gap-3 px-4 py-3"
                style={{
                  background: 'var(--bg-surface)',
                  borderBottom: isLast ? 'none' : '1px solid var(--border)',
                }}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <Icon
                    name={iconName}
                    size={15}
                    style={{
                      color: iconColor,
                      flexShrink: 0,
                      animation: stage.status === 'running' ? 'spin 1s linear infinite' : undefined,
                    }}
                  />
                  <div className="min-w-0">
                    <div className="text-[12.5px] font-medium text-[var(--text-primary)]">
                      {label}
                    </div>
                    <div
                      className="text-[11px] truncate"
                      style={{
                        color: stage.status === 'error' ? '#ef4444' : 'var(--text-muted)',
                      }}
                    >
                      {stage.message}
                    </div>
                  </div>
                </div>
                <button
                  id={`pipeline-run-${key}`}
                  className="btn-secondary text-[11px] px-3 py-1 shrink-0"
                  disabled={pipelineRunning || stage.status === 'running'}
                  onClick={onRun}
                  style={stage.status === 'done' ? { opacity: 0.5 } : {}}
                >
                  {stage.status === 'running'
                    ? 'Running…'
                    : stage.status === 'done'
                      ? 'Re-run'
                      : 'Run'}
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
