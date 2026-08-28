import { useEffect } from 'react';
import { Icon } from './Icon';

interface ConfirmDeleteModalProps {
  isOpen: boolean;
  packName: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDeleteModal({
  isOpen,
  packName,
  onConfirm,
  onCancel,
}: ConfirmDeleteModalProps) {
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [isOpen, onCancel]);

  if (!isOpen) return null;

  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div
        className="modal-content"
        style={{ maxWidth: 440, height: 'auto' }}
        onClick={e => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <div
          className="flex items-center justify-between px-6 py-4"
          style={{ borderBottom: '1px solid var(--border)' }}
        >
          <div className="flex items-center gap-2.5">
            <div
              className="w-8 h-8 rounded-lg flex items-center justify-center"
              style={{ background: 'rgba(239, 68, 68, 0.12)', color: 'var(--danger)' }}
            >
              <Icon name="trash" size={16} />
            </div>
            <h3 className="text-[15px] font-semibold" style={{ color: 'var(--text-primary)' }}>
              Delete Pack
            </h3>
          </div>
          <button className="btn-ghost" onClick={onCancel}>
            <Icon name="x" size={16} />
          </button>
        </div>

        <div className="p-6">
          <p className="text-[13px] leading-relaxed mb-1" style={{ color: 'var(--text-primary)' }}>
            Are you sure you want to delete{' '}
            <span className="font-semibold" style={{ color: 'var(--danger)' }}>
              "{packName}"
            </span>
            ?
          </p>
          <p className="text-[12px] leading-relaxed" style={{ color: 'var(--text-muted)' }}>
            This action will remove all custom mods, server files, and workspace configuration for
            this instance. This cannot be undone.
          </p>
        </div>

        <div
          className="flex items-center justify-end gap-3 px-6 py-4"
          style={{ borderTop: '1px solid var(--border)', background: 'var(--bg-muted)' }}
        >
          <button className="btn-secondary text-[13px] px-4 py-2" onClick={onCancel}>
            Cancel
          </button>
          <button
            className="btn-danger text-[13px] px-4 py-2 flex items-center gap-1.5"
            onClick={onConfirm}
          >
            <Icon name="trash" size={14} />
            Delete Pack
          </button>
        </div>
      </div>
    </div>
  );
}
