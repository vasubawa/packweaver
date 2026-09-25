import { useState, useEffect, useRef, useMemo } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { Instance } from '../../types';
import { formatBasePackName, SOURCE_COLORS, formatExportedAt } from '../../constants';
import { Icon } from '../Icon';
import { UpdatesCard } from './UpdatesCard';
import { getClientExportFormats } from '../../plugins';

interface OverviewTabProps {
  instance: Instance;
  onUpdate: (updates: Partial<Instance>) => void;
  serverExporterEnabled?: boolean;
  onExportClient?: () => void;
  onExportServer?: () => void;
  exportingClient?: boolean;
  exportingServer?: boolean;
}

type StageStatus = 'idle' | 'running' | 'done' | 'error';

interface StageState {
  status: StageStatus;
  message: string;
}

const PIPELINE_TITLES: Record<string, string> = {
  rebuild:
    'Wipes and reinstalls the base pack, then re-applies enabled customs. Use to repair or after a base pack change.',
  layer:
    'Downloads enabled custom mods into the workspace. Use after adding or turning mods back on.',
  serverRebuild:
    'Wipes and reinstalls the server workspace from the base pack, then re-layers server-enabled customs.',
};

const IDLE_STAGES: Record<string, StageState> = {
  rebuild: {
    status: 'idle',
    message: 'Reinstall base pack and re-apply enabled custom mods',
  },
  layer: {
    status: 'idle',
    message: 'Download enabled customs into the client workspace (toggles alone do not download)',
  },
  serverRebuild: {
    status: 'idle',
    message: 'Rebuild the server workspace and re-apply server-enabled customs',
  },
};

export function OverviewTab({
  instance,
  onUpdate,
  serverExporterEnabled = false,
  onExportClient,
  onExportServer,
  exportingClient = false,
  exportingServer = false,
}: OverviewTabProps) {
  const [isEditingDesc, setIsEditingDesc] = useState(false);
  const [descInput, setDescInput] = useState(instance.description || '');
  const [prevInstanceId, setPrevInstanceId] = useState(instance.id);
  const [stages, setStages] = useState<Record<string, StageState>>(IDLE_STAGES);
  const [runningKeys, setRunningKeys] = useState<Set<string>>(() => new Set());
  const [versionInput, setVersionInput] = useState(instance.exportSettings?.version ?? '');

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
  const anyBusy = runningKeys.size > 0;
  const unlistenRef = useRef<(() => void) | null>(null);

  // onUpdate's identity changes on every progress tick. Holding it in a ref lets
  // the listener effect key on the instance alone, instead of tearing down and
  // re-registering constantly and dropping terminal events landing in the gap.
  const onUpdateRef = useRef(onUpdate);
  useEffect(() => {
    onUpdateRef.current = onUpdate;
  }, [onUpdate]);

  useEffect(() => {
    let cancelled = false;
    const unlisteners: (() => void)[] = [];

    listen<{
      instance_id: string;
      status: string;
      progress: number;
      total: number;
      stage?: string;
    }>('export-progress', event => {
      if (cancelled || event.payload.instance_id !== instance.id) return;
      const { status, progress, total, stage } = event.payload;
      if (stage !== 'layer') return;
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
    }).then(fn => {
      if (cancelled) {
        fn();
        return;
      }
      unlisteners.push(fn);
      unlistenRef.current = () => unlisteners.forEach(u => u());
    });

    listen<{
      instance_id: string;
      status: string;
      progress: number;
      total: number;
      stage?: string;
    }>('instance-progress', event => {
      if (cancelled || event.payload.instance_id !== instance.id) return;
      const { status, progress, total, stage } = event.payload;
      const isError = status.toLowerCase().startsWith('error');
      const stageStatus: StageStatus = isError
        ? 'error'
        : total > 0 && progress >= total
          ? 'done'
          : 'running';
      const targetKey =
        stage === 'server' ? 'serverRebuild' : stage === 'layer' ? 'layer' : 'rebuild';

      setStages(prev => ({
        ...prev,
        [targetKey]: {
          status: stageStatus,
          message: status,
        },
      }));
      if (status === 'Ready' || (total > 0 && progress >= total && !isError)) {
        onUpdateRef.current({ status: 'Ready' });
      } else if (isError) {
        onUpdateRef.current({ status });
      }
    }).then(fn => {
      if (cancelled) {
        fn();
        return;
      }
      unlisteners.push(fn);
      unlistenRef.current = () => unlisteners.forEach(u => u());
    });

    return () => {
      cancelled = true;
      unlistenRef.current?.();
    };
  }, [instance.id]);

  if (instance.id !== prevInstanceId) {
    setPrevInstanceId(instance.id);
    setDescInput(instance.description || '');
    setVersionInput(instance.exportSettings?.version ?? '');
    setIsEditingDesc(false);
    setStages({ ...IDLE_STAGES });
    setRunningKeys(new Set());
  }

  useEffect(() => {
    const handle = window.setTimeout(() => {
      const prev = instance.exportSettings ?? {
        includeServer: false,
        version: '',
      };
      if ((prev.version ?? '') === versionInput) return;
      onUpdate({
        exportSettings: { ...prev, version: versionInput },
      });
    }, 400);
    return () => window.clearTimeout(handle);
    // Persist debounced version only; intentionally omit onUpdate/exportSettings object identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [versionInput, instance.id]);

  const displayBasePack = formatBasePackName(instance.basePack);
  const sourceLabel = (SOURCE_COLORS[instance.source] || SOURCE_COLORS.local).label;
  const baseModCount = Math.max(0, instance.totalModCount - instance.customModCount);

  const handleDescSave = () => {
    onUpdate({ description: descInput.trim() });
    setIsEditingDesc(false);
  };

  const setStage = (key: string, status: StageStatus, message: string) =>
    setStages(prev => ({ ...prev, [key]: { status, message } }));

  const runRebuild = async () => {
    if (anyBusy) return;
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
    if (anyBusy) return;
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

  const runServerRebuild = async () => {
    if (anyBusy) return;
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

  const resetPipeline = () => {
    if (anyBusy) return;
    setStages(IDLE_STAGES);
  };

  return (
    <div className="animate-slide-in flex flex-col gap-6">
      <div>
        <h3 className="section-label">Pack info</h3>
        <div
          className="grid gap-3"
          style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}
        >
          <div className="info-card">
            <div className="info-card-label">Base pack</div>
            <div className="info-card-value" title={instance.basePack}>
              {displayBasePack}
            </div>
            <div className="info-card-meta">
              {instance.basePackVersionLabel ||
              (instance.basePackVersion && !/^[A-Za-z0-9]{8}$/.test(instance.basePackVersion))
                ? `Pinned version ${instance.basePackVersionLabel || instance.basePackVersion}`
                : instance.basePackVersion
                  ? `Pinned version id ${instance.basePackVersion}`
                  : 'No version pin recorded'}
            </div>
          </div>

          <div className="info-card">
            <div className="info-card-label">Loader</div>
            <div className="info-card-value">{instance.loader || '—'}</div>
            <div className="info-card-meta">
              {instance.mcVersion || '—'} · {sourceLabel}
            </div>
          </div>

          <div className="info-card">
            <div className="info-card-label">Mods</div>
            <div className="info-card-value">{instance.totalModCount} total</div>
            <div className="info-card-meta">
              {baseModCount} from base
              {instance.customModCount > 0
                ? ` · ${instance.customModCount} custom`
                : ' · no customs yet'}
            </div>
          </div>

          <div className="info-card">
            <div className="info-card-label">Last export</div>
            <div className="info-card-value" title={instance.lastExported || undefined}>
              {formatExportedAt(instance.lastExported)}
            </div>
            <div className="info-card-meta">
              {serverExporterEnabled
                ? 'Client ZIP / .mrpack and server ZIP'
                : 'Client ZIP / .mrpack'}
            </div>
          </div>
        </div>
      </div>

      <div className="loom-panel">
        <div className="loom-panel-body">
          <div className="flex items-center justify-between mb-2">
            <span className="section-label mb-0">Description</span>
            {!isEditingDesc && (
              <button
                className="btn-ghost text-[13px] py-0.5 px-2"
                onClick={() => {
                  setDescInput(instance.description || '');
                  setIsEditingDesc(true);
                }}
              >
                <Icon name="pencil" size={12} />
                <span className="ml-1">Edit</span>
              </button>
            )}
          </div>

          {isEditingDesc ? (
            <div className="flex flex-col gap-2">
              <textarea
                className="form-input text-[13px] leading-relaxed"
                rows={3}
                placeholder="Pack description…"
                value={descInput}
                onChange={e => setDescInput(e.target.value)}
                autoFocus
              />
              <div className="flex justify-end gap-2">
                <button
                  className="btn-ghost text-[13px] px-2.5 py-1"
                  onClick={() => setIsEditingDesc(false)}
                >
                  Cancel
                </button>
                <button className="btn-accent text-[13px] px-3 py-1" onClick={handleDescSave}>
                  Save
                </button>
              </div>
            </div>
          ) : (
            <p className="text-[14px] leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
              {instance.description || (
                <span style={{ color: 'var(--text-muted)' }}>No description yet.</span>
              )}
            </p>
          )}
        </div>
      </div>

      <div className="loom-panel">
        <div className="loom-panel-body flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0 flex-1">
            <label className="form-label mb-1.5 block">Pack release version</label>
            <input
              className="form-input text-[13px] max-w-xs font-mono"
              placeholder="1.0.0"
              value={versionInput}
              onChange={e => setVersionInput(e.target.value)}
              onBlur={() => {
                const prev = instance.exportSettings ?? {
                  includeServer: false,
                  version: '',
                };
                if ((prev.version ?? '') === versionInput) return;
                onUpdate({
                  exportSettings: { ...prev, version: versionInput },
                });
              }}
            />
            <p className="text-[13px] mt-1.5" style={{ color: 'var(--text-secondary)' }}>
              Used in the export filename when set (stem-version-MODIFIED.zip / .mrpack
              {serverExporterEnabled ? ' / stem-version-MODIFIED-server.zip' : ''}).
            </p>
          </div>
          <ClientFormatPicker instance={instance} onUpdate={onUpdate} />
        </div>
      </div>

      <UpdatesCard
        instance={instance}
        onUpdate={onUpdate}
        serverExporterEnabled={serverExporterEnabled}
      />

      <div id="export-pipeline" className="flex flex-col gap-4">
        <div
          className="flex flex-wrap items-center justify-between gap-3"
          style={{
            position: 'sticky',
            top: 0,
            zIndex: 5,
            padding: '10px 0',
            background: 'var(--bg-canvas)',
          }}
        >
          <h3 className="section-label mb-0">Workspace</h3>
          <div className="flex items-center gap-2 flex-wrap">
            {onExportClient && (
              <button
                className="btn-accent text-[12px] px-3 py-1.5"
                onClick={onExportClient}
                disabled={exportingClient || anyBusy}
                title="Package client workspace, then choose where to save"
              >
                <Icon name="package" size={13} />
                {exportingClient ? 'Exporting…' : 'Export client'}
              </button>
            )}
            {serverExporterEnabled && onExportServer && (
              <button
                className="btn-secondary text-[12px] px-3 py-1.5"
                onClick={onExportServer}
                disabled={exportingServer || anyBusy}
                title="Package server workspace, then choose where to save"
              >
                <Icon name="package" size={13} />
                {exportingServer ? 'Exporting…' : 'Export server'}
              </button>
            )}
            <button
              className="btn-ghost text-[13px] px-2 py-0.5"
              onClick={resetPipeline}
              disabled={anyBusy}
            >
              Reset status
            </button>
          </div>
        </div>

        <div id="pipeline-client">
          <h3 className="section-label">Client workspace</h3>
          <div className="loom-panel">
            {(
              [
                {
                  key: 'rebuild' as const,
                  label: 'Rebuild client workspace',
                  onRun: runRebuild,
                },
                {
                  key: 'layer' as const,
                  label: 'Layer custom mods',
                  onRun: runLayer,
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
                  busy={anyBusy}
                  title={PIPELINE_TITLES[key]}
                  onRun={onRun}
                />
              );
            })}
          </div>
        </div>

        {serverExporterEnabled && (
          <div id="pipeline-server">
            <div className="flex items-center justify-between mb-3">
              <h3 className="section-label mb-0">Server workspace</h3>
              <p className="text-[13px]" style={{ color: 'var(--text-secondary)' }}>
                Optional — skip for client-only
              </p>
            </div>
            <div className="loom-panel">
              <PipelineRow
                stageKey="serverRebuild"
                label="Rebuild server workspace"
                stage={stages.serverRebuild}
                isLast
                busy={anyBusy}
                title={PIPELINE_TITLES.serverRebuild}
                onRun={runServerRebuild}
              />
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
  title,
  onRun,
}: {
  stageKey: string;
  label: string;
  stage: StageState;
  isLast: boolean;
  busy: boolean;
  title?: string;
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
      ? 'var(--accent)'
      : stage.status === 'done'
        ? 'var(--success)'
        : stage.status === 'error'
          ? 'var(--danger)'
          : 'var(--text-muted)';

  return (
    <div
      className={`pipeline-row flex items-center justify-between gap-3 px-4 py-3 ${
        stage.status === 'running' ? 'is-running' : ''
      }`}
      style={{
        background: 'var(--bg-surface)',
        borderBottom: isLast ? 'none' : '1px solid var(--border)',
      }}
      title={title}
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
          <div className="text-[13px] font-medium text-[var(--text-primary)]">{label}</div>
          <div
            className="text-[12.5px]"
            style={{
              color: stage.status === 'error' ? 'var(--danger)' : 'var(--text-secondary)',
            }}
            title={stage.message}
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
        title={title}
        style={stage.status === 'done' ? { opacity: 0.5 } : {}}
      >
        {stage.status === 'running' ? 'Running…' : stage.status === 'done' ? 'Re-run' : 'Run'}
      </button>
      {stage.status === 'running' ? (
        <div className="warp-thread" aria-hidden>
          <div className="warp-thread-fill is-indeterminate" />
        </div>
      ) : null}
    </div>
  );
}

function ClientFormatPicker({
  instance,
  onUpdate,
}: {
  instance: Instance;
  onUpdate: (updates: Partial<Instance>) => void;
}) {
  const [formats, setFormats] = useState(() => getClientExportFormats());

  useEffect(() => {
    const sync = () => setFormats(getClientExportFormats());
    sync();
    window.addEventListener('packweaver_plugins_changed', sync);
    return () => window.removeEventListener('packweaver_plugins_changed', sync);
  }, []);

  const current = useMemo(() => {
    const preferred = instance.exportSettings?.clientFormat ?? 'zip';
    return formats.includes(preferred) ? preferred : (formats[0] ?? 'zip');
  }, [formats, instance.exportSettings?.clientFormat]);

  if (formats.length < 2) {
    return (
      <div className="shrink-0">
        <div className="form-label mb-1.5">Client format</div>
        <div className="text-[13px] font-mono" style={{ color: 'var(--text-muted)' }}>
          {current === 'mrpack' ? '.mrpack' : '.zip'}
        </div>
      </div>
    );
  }

  return (
    <div className="shrink-0">
      <div className="form-label mb-1.5" id="client-format-label">
        Client format
      </div>
      <div className="flex gap-1" role="group" aria-labelledby="client-format-label">
        {formats.map(fmt => (
          <button
            key={fmt}
            type="button"
            className={`btn-secondary text-[11px] px-3 py-1.5 ${current === fmt ? 'ring-1' : ''}`}
            style={
              current === fmt
                ? { borderColor: 'var(--accent)', color: 'var(--text-primary)' }
                : undefined
            }
            aria-pressed={current === fmt}
            onClick={() => {
              const prev = instance.exportSettings ?? {
                includeServer: false,
                version: '',
              };
              onUpdate({
                exportSettings: { ...prev, clientFormat: fmt },
              });
            }}
          >
            {fmt === 'mrpack' ? '.mrpack' : '.zip'}
          </button>
        ))}
      </div>
    </div>
  );
}
