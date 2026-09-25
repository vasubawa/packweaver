import { useState, type CSSProperties } from 'react';
import { Icon } from '../Icon';
import { Instance } from '../../types';
import { SOURCE_COLORS, formatBasePackName } from '../../constants';
import { ConfirmDeleteModal } from '../ConfirmDeleteModal';
import { useDeleteInstance } from '../../hooks/useDeleteInstance';
import { cssUrl, mediaUrl } from '../../lib/mediaUrl';

interface DetailHeaderProps {
  instance: Instance;
  onBack: () => void;
  onExportClient: () => void;
  onExportServer?: () => void;
  serverExporterEnabled?: boolean;
  exportingClient?: boolean;
  exportingServer?: boolean;
  onUpdate: (updates: Partial<Instance>) => void;
  onDelete: (id: string) => void;
}

export function DetailHeader({
  instance,
  onBack,
  onExportClient,
  onExportServer,
  serverExporterEnabled = false,
  exportingClient = false,
  exportingServer = false,
  onUpdate,
  onDelete,
}: DetailHeaderProps) {
  const [isEditingName, setIsEditingName] = useState(false);
  const [editName, setEditName] = useState(instance.name);
  const [prevName, setPrevName] = useState(instance.name);
  const sc = SOURCE_COLORS[instance.source] || SOURCE_COLORS.local;
  const { showDeleteModal, isDeleting, requestDelete, cancelDelete, confirmDelete } =
    useDeleteInstance(instance.id, onDelete);
  const cover = cssUrl(instance.bannerUrl || instance.iconUrl);
  const iconSrc = mediaUrl(instance.iconUrl);

  if (instance.name !== prevName) {
    setPrevName(instance.name);
    setEditName(instance.name);
  }

  const handleNameSave = () => {
    if (editName.trim()) {
      onUpdate({ name: editName.trim() });
    } else {
      setEditName(instance.name);
    }
    setIsEditingName(false);
  };

  const displayBasePack = formatBasePackName(instance.basePack);
  const isInstalling =
    ((instance.status !== 'Ready' && !instance.status.startsWith('Error')) ||
      instance.status === 'syncing') &&
    instance.progress !== undefined;
  const installPct = isInstalling
    ? instance.total
      ? Math.min(100, Math.round((instance.progress! / instance.total) * 100))
      : 0
    : 0;

  return (
    <>
      <div
        className="detail-banner relative overflow-hidden shrink-0"
        style={{
          height: 'clamp(96px, 12vh, 160px)',
          background: cover
            ? `${cover} center/cover no-repeat`
            : instance.bannerGradient || sc.gradient,
        }}
      >
        <div
          className="absolute inset-0"
          style={{
            background: 'linear-gradient(180deg, rgba(0,0,0,0.1) 0%, var(--bg-canvas) 100%)',
          }}
        />
        <button
          className="absolute top-3 left-6 z-10 flex items-center gap-1.5 backdrop-blur-md"
          onClick={onBack}
          style={{
            background: 'var(--bg-surface)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-sm)',
            padding: '6px 12px',
            color: 'var(--text-primary)',
            boxShadow: 'var(--shadow-sm)',
          }}
        >
          <Icon name="arrowLeft" size={14} />
          <span className="text-xs font-medium">Back to Library</span>
        </button>
        <button
          className="absolute top-3 right-6 z-10 btn-ghost-danger backdrop-blur-md"
          onClick={requestDelete}
          title="Delete pack"
          aria-label="Delete pack"
          style={{
            background: 'var(--bg-surface)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-sm)',
            padding: '6px 10px',
            boxShadow: 'var(--shadow-sm)',
          }}
        >
          <Icon name="trash" size={14} />
        </button>
      </div>

      {isInstalling ? (
        <div className="warp-thread shrink-0" aria-hidden>
          <div className="warp-thread-fill" style={{ width: `${installPct}%` }} />
        </div>
      ) : null}

      <div className="px-8 content-pad -mt-8 relative z-10 shrink-0">
        <div className="detail-heading-row flex flex-row items-end justify-between gap-4">
          <div className="min-w-0 flex-1 flex items-end gap-4">
            {iconSrc && (
              <div
                className="w-20 h-20 rounded-2xl shadow-lg shrink-0 overflow-hidden"
                style={{
                  border: '4px solid var(--bg-canvas)',
                  backgroundColor: 'var(--bg-surface)',
                }}
              >
                <img src={iconSrc} alt="" className="w-full h-full object-cover" />
              </div>
            )}
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 mb-2">
                <span
                  className="badge text-[11px] font-medium"
                  style={{
                    background: sc.soft,
                    color: sc.accent,
                    border: `1px solid ${sc.border}`,
                  }}
                >
                  <span
                    className="w-2 h-2 rounded-full mr-1.5 inline-block"
                    style={{ background: sc.dot }}
                  />
                  {sc.label}
                </span>
                <span
                  className="badge text-[11px] font-medium"
                  style={{
                    color: instance.status.startsWith('Error')
                      ? 'var(--danger)'
                      : instance.status === 'Ready'
                        ? 'var(--success)'
                        : sc.accent,
                  }}
                >
                  {instance.status === 'syncing'
                    ? 'Syncing'
                    : instance.status.startsWith('Error')
                      ? instance.status.replace(/^Error:\s*/i, 'Error: ').slice(0, 80)
                      : instance.total && instance.progress !== undefined
                        ? `${instance.status} · ${Math.min(
                            100,
                            Math.round((instance.progress / instance.total) * 100)
                          )}%`
                        : instance.status || 'Ready'}
                </span>
              </div>

              {isEditingName ? (
                <div className="flex items-center gap-2 mb-2">
                  <input
                    className="form-input text-xl font-bold tracking-tight py-1"
                    style={{ fontFamily: 'var(--font-heading)', maxWidth: '360px' }}
                    value={editName}
                    onChange={e => setEditName(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') handleNameSave();
                      if (e.key === 'Escape') {
                        setEditName(instance.name);
                        setIsEditingName(false);
                      }
                    }}
                    autoFocus
                    onBlur={handleNameSave}
                  />
                </div>
              ) : (
                <div className="flex items-center gap-2 mb-2 group min-w-0">
                  <h2
                    className="text-2xl font-bold tracking-tight truncate"
                    style={{
                      color: 'var(--text-primary)',
                      fontFamily: 'var(--font-heading)',
                    }}
                    title={instance.name}
                  >
                    {instance.name}
                  </h2>
                  <button
                    className="btn-ghost shrink-0"
                    onClick={() => setIsEditingName(true)}
                    title="Edit Pack Name"
                    aria-label="Edit pack name"
                  >
                    <Icon name="pencil" size={14} />
                  </button>
                </div>
              )}

              <div className="font-mono-meta flex items-center gap-2 flex-wrap">
                <span
                  className="max-w-full overflow-hidden text-ellipsis whitespace-nowrap"
                  style={{ color: 'var(--text-secondary)' }}
                  title={instance.basePack}
                >
                  {displayBasePack}
                </span>
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
              </div>
            </div>
          </div>

          <div className="detail-actions flex items-center gap-2 shrink-0 flex-wrap">
            <button
              className="export-outline-btn text-xs px-3.5 py-2 font-medium rounded-md border bg-transparent transition-colors disabled:opacity-50 disabled:pointer-events-none"
              onClick={onExportClient}
              disabled={exportingClient}
              title="Package client workspace, then choose where to save"
              style={
                {
                  '--export-accent': sc.accent,
                  color: 'var(--export-accent)',
                  borderColor: 'var(--export-accent)',
                } as CSSProperties
              }
            >
              <span className="inline-flex items-center gap-1.5">
                <Icon name="package" size={14} />
                {exportingClient ? 'Exporting…' : 'Export client'}
              </span>
            </button>
            {serverExporterEnabled && onExportServer && (
              <button
                className="export-outline-btn text-xs px-3.5 py-2 font-medium rounded-md border bg-transparent transition-colors disabled:opacity-50 disabled:pointer-events-none"
                onClick={onExportServer}
                disabled={exportingServer}
                title="Package server workspace, then choose where to save"
                style={
                  {
                    '--export-accent': sc.accent,
                    color: 'var(--export-accent)',
                    borderColor: 'var(--export-accent)',
                  } as CSSProperties
                }
              >
                <span className="inline-flex items-center gap-1.5">
                  <Icon name="package" size={14} />
                  {exportingServer ? 'Exporting…' : 'Export server'}
                </span>
              </button>
            )}
          </div>
        </div>
      </div>

      <ConfirmDeleteModal
        isOpen={showDeleteModal}
        packName={instance.name}
        isDeleting={isDeleting}
        onConfirm={confirmDelete}
        onCancel={cancelDelete}
      />
    </>
  );
}
