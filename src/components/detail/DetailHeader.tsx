import { useState } from 'react';
import { Icon } from '../Icon';
import { Instance } from '../../types';
import { SOURCE_COLORS, formatBasePackName } from '../../constants';
import { ConfirmDeleteModal } from '../ConfirmDeleteModal';
import { useDeleteInstance } from '../../hooks/useDeleteInstance';

interface DetailHeaderProps {
  instance: Instance;
  onBack: () => void;
  onExport: () => void;
  onUpdate: (updates: Partial<Instance>) => void;
  onDelete: (id: string) => void;
}

export function DetailHeader({
  instance,
  onBack,
  onExport,
  onUpdate,
  onDelete,
}: DetailHeaderProps) {
  const [isEditingName, setIsEditingName] = useState(false);
  const [editName, setEditName] = useState(instance.name);
  const [prevName, setPrevName] = useState(instance.name);
  const sc = SOURCE_COLORS[instance.source] || SOURCE_COLORS.local;
  const { showDeleteModal, isDeleting, requestDelete, cancelDelete, confirmDelete } =
    useDeleteInstance(instance.id, onDelete);

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

  return (
    <>
      <div
        className="detail-banner relative overflow-hidden shrink-0"
        style={{
          height: 'clamp(140px, 25vh, 360px)',
          background:
            instance.bannerUrl || instance.iconUrl
              ? `url(${instance.bannerUrl || instance.iconUrl}) center/cover no-repeat`
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
          className="absolute top-4 left-6 z-10 flex items-center gap-1.5 backdrop-blur-md"
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
      </div>

      <div className="px-8 -mt-8 relative z-10 shrink-0">
        <div className="flex flex-row items-end justify-between gap-4">
          <div className="min-w-0 flex-1 flex items-end gap-4">
            {instance.iconUrl && (
              <div
                className="w-20 h-20 rounded-2xl shadow-lg shrink-0 overflow-hidden"
                style={{
                  border: '4px solid var(--bg-canvas)',
                  backgroundColor: 'var(--bg-surface)',
                }}
              >
                <img src={instance.iconUrl} alt="" className="w-full h-full object-cover" />
              </div>
            )}
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 mb-2">
                <span
                  className="badge text-[11px] font-medium px-2.5 py-0.5 rounded-full"
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
              </div>

              {isEditingName ? (
                <div className="flex items-center gap-2 mb-2">
                  <input
                    className="form-input text-xl font-bold tracking-tight py-1"
                    style={{ fontFamily: "'Newsreader', Georgia, serif", maxWidth: '360px' }}
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
                      fontFamily: "'Newsreader', Georgia, serif",
                    }}
                  >
                    {instance.name}
                  </h2>
                  <button
                    className="btn-ghost opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                    onClick={() => setIsEditingName(true)}
                    title="Edit Pack Name"
                  >
                    <Icon name="pencil" size={14} />
                  </button>
                </div>
              )}

              <div
                className="flex items-center gap-2 text-xs flex-wrap"
                style={{ color: 'var(--text-muted)' }}
              >
                <span
                  className="font-medium max-w-full overflow-hidden text-ellipsis whitespace-nowrap"
                  style={{ color: 'var(--text-secondary)', maxWidth: '300px' }}
                >
                  {displayBasePack}
                </span>
                <span>&middot;</span>
                <span>{instance.mcVersion}</span>
                <span>&middot;</span>
                <span>{instance.loader}</span>
                <span>&middot;</span>
                <span>{instance.totalModCount} mods</span>
                {instance.customModCount > 0 && (
                  <>
                    <span>&middot;</span>
                    <span style={{ color: sc.accent }}>+{instance.customModCount} custom</span>
                  </>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0 flex-wrap">
            {instance.hasUpdate && (
              <span className="badge update-badge text-[11px]">Update Available</span>
            )}
            <button
              className="btn-secondary text-xs px-3 py-2"
              disabled
              title="Coming soon"
              style={{ opacity: 0.5, cursor: 'not-allowed' }}
            >
              <Icon name="refresh" size={14} />
              <span>Check Updates</span>
            </button>
            <button
              className="btn-accent text-xs px-3.5 py-2 font-medium"
              onClick={onExport}
              disabled
              title="Coming soon"
              style={{
                background: sc.accent,
                borderColor: sc.accent,
                boxShadow: `0 2px 10px ${sc.soft}`,
                opacity: 0.5,
                cursor: 'not-allowed',
              }}
            >
              <Icon name="package" size={14} />
              <span>Export Pack</span>
            </button>
            <button
              className="btn-danger text-xs px-3.5 py-2 font-medium rounded-md"
              onClick={requestDelete}
              title="Delete pack"
            >
              <Icon name="trash" size={15} />
            </button>
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
