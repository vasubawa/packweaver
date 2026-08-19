import { useState, useRef, useEffect } from 'react';
import { Icon } from '../Icon';
import { Instance } from '../../types';
import { SOURCE_COLORS } from '../../constants';
import { ConfirmDeleteModal } from '../ConfirmDeleteModal';
import { invoke } from '@tauri-apps/api/core';

interface InstanceCardProps {
  instance: Instance;
  onClick: (instance: Instance) => void;
  onDelete?: (id: string) => void;
}

export function InstanceCard({ instance, onClick, onDelete }: InstanceCardProps) {
  const [showMenu, setShowMenu] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const sc = SOURCE_COLORS[instance.source] || SOURCE_COLORS.local;

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setShowMenu(false);
      }
    };
    if (showMenu) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showMenu]);

  const handleDeleteConfirm = async () => {
    try {
      await invoke('delete_instance', { id: instance.id });
      setShowDeleteModal(false);
      if (onDelete) onDelete(instance.id);
    } catch (e) {
      console.error('Failed to delete instance:', e);
    }
  };

  return (
    <>
      <div
        className="instance-card flex flex-col group relative overflow-hidden transition-all duration-200"
        onClick={() => onClick(instance)}
        role="button"
        tabIndex={0}
        style={{
          border: '1px solid var(--border)',
        }}
        onMouseEnter={e => {
          e.currentTarget.style.borderColor = sc.accent;
          e.currentTarget.style.boxShadow = `0 4px 20px -2px ${sc.soft}`;
        }}
        onMouseLeave={e => {
          e.currentTarget.style.borderColor = 'var(--border)';
          e.currentTarget.style.boxShadow = 'none';
        }}
        onKeyDown={e => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onClick(instance);
          }
        }}
      >
        {/* Banner with source-themed gradient */}
        <div
          className="relative overflow-hidden shrink-0 flex items-start justify-between p-3.5"
          style={{ height: 86, background: instance.bannerGradient || sc.gradient }}
        >
          <span
            className="badge font-medium text-[11px] px-2.5 py-1 rounded-md backdrop-blur-md"
            style={{
              background: 'rgba(0, 0, 0, 0.45)',
              color: sc.accent,
              borderColor: sc.border,
            }}
          >
            <span
              className="w-2 h-2 rounded-full mr-1.5 inline-block"
              style={{ background: sc.dot }}
            />
            {sc.label}
          </span>

          <div className="flex items-center gap-1.5" onClick={e => e.stopPropagation()}>
            <div className="relative" ref={menuRef}>
              <button
                className="w-7 h-7 rounded-md flex items-center justify-center bg-black/40 hover:bg-black/70 text-white/80 hover:text-white transition-colors"
                onClick={() => setShowMenu(!showMenu)}
                title="Options"
              >
                <Icon name="moreH" size={14} />
              </button>

              {showMenu && (
                <div
                  className="absolute right-0 top-full mt-1.5 w-40 py-1.5 rounded-lg shadow-xl z-30 animate-fade-in"
                  style={{
                    background: 'var(--bg-surface)',
                    border: '1px solid var(--border)',
                  }}
                >
                  <button
                    className="w-full text-left px-3.5 py-1.5 text-xs text-[var(--text-primary)] hover:bg-[var(--bg-muted)] flex items-center gap-2"
                    onClick={() => {
                      setShowMenu(false);
                      onClick(instance);
                    }}
                  >
                    <Icon name="pencil" size={13} />
                    View Details
                  </button>
                  <div className="my-1 border-t" style={{ borderColor: 'var(--border)' }} />
                  <button
                    className="w-full text-left px-3.5 py-1.5 text-xs text-red-500 hover:bg-red-500/10 flex items-center gap-2"
                    onClick={() => {
                      setShowMenu(false);
                      setShowDeleteModal(true);
                    }}
                  >
                    <Icon name="trash" size={13} />
                    Delete Pack
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Card Body */}
        <div className="px-4 pb-4 pt-3 flex flex-col flex-1 justify-between gap-3">
          <div>
            <div className="flex items-baseline justify-between gap-2 mb-1">
              <h3
                className="text-[14.5px] font-semibold tracking-tight leading-snug truncate"
                style={{ color: 'var(--text-primary)' }}
              >
                {instance.name}
              </h3>
              <span
                className="text-[11px] font-medium shrink-0"
                style={{ color: 'var(--text-muted)' }}
              >
                {instance.status === 'syncing' ? 'Syncing...' : 'Ready'}
              </span>
            </div>

            {instance.description ? (
              <p
                className="text-[12px] leading-relaxed line-clamp-2"
                style={{ color: 'var(--text-secondary)' }}
              >
                {instance.description}
              </p>
            ) : (
              <p className="text-[12px] italic" style={{ color: 'var(--text-muted)' }}>
                No description provided
              </p>
            )}
          </div>

          {instance.status === 'syncing' && instance.progress !== undefined && (
            <div>
              <div className="progress-track">
                <div
                  className="progress-fill"
                  style={{ width: `${instance.progress}%`, background: sc.accent }}
                />
              </div>
              <span className="text-[10.5px] mt-1 block" style={{ color: 'var(--text-muted)' }}>
                {instance.progress}%
              </span>
            </div>
          )}

          {/* Tags */}
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="badge text-[11px] px-2 py-0.5">{instance.mcVersion}</span>
            <span className="badge text-[11px] px-2 py-0.5">{instance.loader}</span>
            <span className="badge text-[11px] px-2 py-0.5">{instance.totalModCount} mods</span>
            {instance.customModCount > 0 && (
              <span
                className="badge text-[11px] px-2 py-0.5"
                style={{
                  background: sc.soft,
                  color: sc.accent,
                  borderColor: sc.border,
                }}
              >
                +{instance.customModCount} custom
              </span>
            )}
          </div>

          {/* Card Footer */}
          <div
            className="flex items-center justify-between pt-2.5 text-[11px]"
            style={{ borderTop: '1px solid var(--border)', color: 'var(--text-muted)' }}
          >
            <span>v{instance.exportSettings?.version || instance.basePackVersion || '1.0.0'}</span>
            <span>
              {instance.lastExported ? `Exported ${instance.lastExported}` : 'Not exported'}
            </span>
          </div>
        </div>
      </div>

      <ConfirmDeleteModal
        isOpen={showDeleteModal}
        packName={instance.name}
        onConfirm={handleDeleteConfirm}
        onCancel={() => setShowDeleteModal(false)}
      />
    </>
  );
}
