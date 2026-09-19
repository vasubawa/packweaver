import { useState, useEffect, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { Instance } from '../../types';
import { formatBasePackName } from '../../constants';
import { Icon } from '../Icon';

interface OverviewTabProps {
  instance: Instance;
  onUpdate: (updates: Partial<Instance>) => void;
  serverExporterEnabled?: boolean;
}

type StageStatus = 'idle' | 'running' | 'done' | 'error';

interface StageState {
  status: StageStatus;
  message: string;
}

const IDLE_STAGES: Record<string, StageState> = {
  rebuild: {
    status: 'idle',
    message: 'Wipe workspace/client, install base pack under {stem}, re-layer enabled customs',
  },
  layer: {
    status: 'idle',
    message:
      'Download/copy enabled customs into workspace/client/{stem}/mods (toggles alone do not download)',
  },
  package: {
    status: 'idle',
    message: 'Zip workspace/client/{stem} as {stem}-MODIFIED.zip',
  },
  serverRebuild: {
    status: 'idle',
    message: 'Wipe workspace/server, install under {stem}, re-layer enabled_server customs',
  },
  serverPackage: {
    status: 'idle',
    message: 'Zip workspace/server/{stem} as {stem}-MODIFIED-server.zip',
  },
};

export function OverviewTab({
  instance,
  onUpdate,
  serverExporterEnabled = false,
}: OverviewTabProps) {
  const [isEditingDesc, setIsEditingDesc] = useState(false);
  const [descInput, setDescInput] = useState(instance.description || '');
  const [prevInstanceId, setPrevInstanceId] = useState(instance.id);
  const [stages, setStages] = useState<Record<string, StageState>>(IDLE_STAGES);
  const [runningKeys, setRunningKeys] = useState<Set<string>>(() => new Set());

  const startRun = (key: string) =>
    setRunningKeys(prev => {
      if (prev.has(key)) return prev;
      const next = new Set(prev);
      next.add(key);
      return next;
    });
  const endRun = (key: string) =>
    setRunningKeys(prev => {
      if (!prev.has(key)) return prev;
      const next = new Set(prev);
      next.delete(key);
      return next;
    });
  const isBusy = (key: string) => runningKeys.has(key);
  const anyBusy = runningKeys.size > 0;
  const unlistenRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    let cancelled = false;
    const unlisteners: (() => void)[] = [];

    listen<{ instance_id: string; status: string; progress: number; total: number }>(
      'export-progress',
      event => {
        if (cancelled || event.payload.instance_id !== instance.id) return;
        const { status, progress, total } = event.payload;
        setStages(prev => ({
          ...prev,
          layer: {
            status:
              total > 0 && progress < total
                ? 'running'
                : progress === total && total > 0
                  ? 'done'
                  : prev.layer.status,
            message: status,
          },
        }));
      }
    ).then(fn => {
      unlisteners.push(fn);
      unlistenRef.current = () => unlisteners.forEach(u => u());
    });

    listen<{ instance_id: string; status: string; progress: number; total: number }>(
      'instance-progress',
      event => {
        if (cancelled || event.payload.instance_id !== instance.id) return;
        const { status, progress, total } = event.payload;
        const isError = status.toLowerCase().startsWith('error');
        setStages(prev => ({
          ...prev,
          rebuild: {
            status: isError ? 'error' : total > 0 && progress >= total ? 'done' : 'running',
            message: status,
          },
        }));
        if (status === 'Ready' || (total > 0 && progress >= total && !isError)) {
          onUpdate({ status: 'Ready' });
        } else if (isError) {
          onUpdate({ status });
        }
      }
    ).then(fn => {
      unlisteners.push(fn);
      unlistenRef.current = () => unlisteners.forEach(u => u());
    });

    return () => {
      cancelled = true;
      unlistenRef.current?.();
    };
  }, [instance.id, onUpdate]);

  if (instance.id !== prevInstanceId) {
    setPrevInstanceId(instance.id);
    setDescInput(instance.description || '');
  }

  const displayBasePack = formatBasePackName(instance.basePack);

  const handleDescSave = () => {
    onUpdate({ description: descInput.trim() });
    setIsEditingDesc(false);
  };

  const setStage = (key: string, status: StageStatus, message: string) =>
    setStages(prev => ({ ...prev, [key]: { status, message } }));

  const runRebuild = async () => {
    if (isBusy('rebuild')) return;
    startRun('rebuild');
    setStage('rebuild', 'running', 'Rebuilding workspace…');
    onUpdate({ status: 'Installing...' });
    try {
      await invoke('rebuild_workspace', { instanceId: instance.id });
      setStage('rebuild', 'done', 'Workspace rebuilt');
      onUpdate({ status: 'Ready' });
    } catch (e) {
      setStage('rebuild', 'error', String(e));
      onUpdate({ status: `Error: ${e}` });
    } finally {
      endRun('rebuild');
    }
  };

  const runLayer = async () => {
    if (isBusy('layer')) return;
    startRun('layer');
    setStage('layer', 'running', 'Layering custom mods…');
    try {
      const count = await invoke<number>('layer_custom_mods', { instanceId: instance.id });
      setStage(
        'layer',
        'done',
        count === 0
          ? 'No enabled custom mods to layer'
          : `${count} custom mod${count !== 1 ? 's' : ''} layered`
      );
    } catch (e) {
      setStage('layer', 'error', String(e));
    } finally {
      endRun('layer');
    }
  };

  const runPackage = async () => {
    if (isBusy('package')) return;
    startRun('package');
    setStage('package', 'running', 'Packaging…');
    try {
      const path = await invoke<string>('export_instance', {
        instanceId: instance.id,
        format: 'zip',
      });
      const exportedAt = new Date().toLocaleString();
      onUpdate({
        lastExported: exportedAt,
      });
      setStage('package', 'done', `Saved ${path}`);
    } catch (e) {
      const msg = String(e);
      if (msg.toLowerCase().includes('cancelled')) {
        setStage('package', 'idle', 'Export cancelled');
      } else {
        setStage('package', 'error', msg);
      }
    } finally {
      endRun('package');
    }
  };

  const runServerRebuild = async () => {
    if (isBusy('serverRebuild')) return;
    startRun('serverRebuild');
    setStage('serverRebuild', 'running', 'Rebuilding server workspace…');
    try {
      await invoke('rebuild_server_workspace', { instanceId: instance.id });
      setStage('serverRebuild', 'done', 'Server workspace rebuilt');
    } catch (e) {
      setStage('serverRebuild', 'error', String(e));
    } finally {
      endRun('serverRebuild');
    }
  };

  const runServerPackage = async () => {
    if (isBusy('serverPackage')) return;
    startRun('serverPackage');
    setStage('serverPackage', 'running', 'Packaging server…');
    try {
      const path = await invoke<string>('export_instance', {
        instanceId: instance.id,
        format: 'server',
      });
      onUpdate({
        lastExported: new Date().toLocaleString(),
      });
      setStage('serverPackage', 'done', `Saved ${path}`);
    } catch (e) {
      const msg = String(e);
      if (msg.toLowerCase().includes('cancelled')) {
        setStage('serverPackage', 'idle', 'Export cancelled');
      } else {
        setStage('serverPackage', 'error', msg);
      }
    } finally {
      endRun('serverPackage');
    }
  };

  const resetPipeline = () => {
    if (anyBusy) return;
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
      label: 'Exports',
      value: serverExporterEnabled ? 'Client · Server' : 'Client ZIP',
      sub: `Pack v${instance.exportSettings?.version || '1.0.0'}`,
    },
  ];

  return (
    <div className="animate-slide-in flex flex-col gap-6">
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

      <div>
        <h3 className="text-xs font-semibold uppercase tracking-wider mb-3 text-[var(--text-muted)]">
          Export Configuration
        </h3>
        <div
          className="p-4 rounded-xl flex flex-col gap-4"
          style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}
        >
          <div>
            <label className="form-label mb-1.5 block text-xs font-medium">
              Pack Release Version
            </label>
            <input
              className="form-input text-xs max-w-xs"
              placeholder="1.0.0"
              value={instance.exportSettings.version}
              onChange={e =>
                onUpdate({
                  exportSettings: { ...instance.exportSettings, version: e.target.value },
                })
              }
            />
            <p className="text-[11px] mt-1 text-[var(--text-muted)]">
              Client and server exports are independent — run whichever this pack needs. Zip names
              use the original pack stem + -MODIFIED / -MODIFIED-server.
              {!serverExporterEnabled &&
                ' Enable Server Pack Packager in Plugins to unlock server export.'}
            </p>
          </div>
        </div>
      </div>

      <div id="export-pipeline" className="flex flex-col gap-4">
        <div id="pipeline-client">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
              Client pipeline
            </h3>
            <button
              className="btn-ghost text-[11px] px-2 py-0.5"
              onClick={resetPipeline}
              disabled={anyBusy}
            >
              Reset
            </button>
          </div>
          <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--border)' }}>
            {(
              [
                {
                  key: 'rebuild' as const,
                  label: '① Rebuild client workspace',
                  onRun: runRebuild,
                },
                {
                  key: 'layer' as const,
                  label: '② Layer custom mods (client)',
                  onRun: runLayer,
                },
                {
                  key: 'package' as const,
                  label: '③ Export client ZIP',
                  onRun: runPackage,
                },
              ] as const
            ).map(({ key, label, onRun }, i, arr) => {
              const stage = stages[key];
              const isLast = i === arr.length - 1;
              return (
                <PipelineRow
                  key={key}
                  stageKey={key}
                  label={label}
                  stage={stage}
                  isLast={isLast}
                  busy={isBusy(key)}
                  onRun={onRun}
                />
              );
            })}
          </div>
        </div>

        {serverExporterEnabled && (
          <div id="pipeline-server">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                Server pipeline
              </h3>
              <p className="text-[11px] text-[var(--text-muted)]">
                Optional — skip for client-only packs
              </p>
            </div>
            <div
              className="rounded-xl overflow-hidden"
              style={{ border: '1px solid var(--border)' }}
            >
              {(
                [
                  {
                    key: 'serverRebuild' as const,
                    label: '① Rebuild server workspace',
                    onRun: runServerRebuild,
                  },
                  {
                    key: 'serverPackage' as const,
                    label: '② Export server ZIP',
                    onRun: runServerPackage,
                  },
                ] as const
              ).map(({ key, label, onRun }, i, arr) => {
                const stage = stages[key];
                const isLast = i === arr.length - 1;
                return (
                  <PipelineRow
                    key={key}
                    stageKey={key}
                    label={label}
                    stage={stage}
                    isLast={isLast}
                    busy={isBusy(key)}
                    onRun={onRun}
                  />
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function PipelineRow({
  stageKey,
  label,
  stage,
  isLast,
  busy,
  onRun,
}: {
  stageKey: string;
  label: string;
  stage: StageState;
  isLast: boolean;
  busy: boolean;
  onRun: () => void;
}) {
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
          <div className="text-[12.5px] font-medium text-[var(--text-primary)]">{label}</div>
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
        id={`pipeline-run-${stageKey}`}
        className="btn-secondary text-[11px] px-3 py-1 shrink-0"
        disabled={busy || stage.status === 'running'}
        onClick={onRun}
        style={stage.status === 'done' ? { opacity: 0.5 } : {}}
      >
        {stage.status === 'running' ? 'Running…' : stage.status === 'done' ? 'Re-run' : 'Run'}
      </button>
    </div>
  );
}
