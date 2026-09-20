import { Icon } from '../Icon';
import { InstanceCard } from '../instances/InstanceCard';
import { Instance } from '../../types';

const MAX_COLS = 4;

interface LibraryViewProps {
  instances: Instance[];
  isLoading: boolean;
  searchQuery: string;
  onSelectInstance: (instance: Instance) => void;
  onNewInstance: () => void;
}

export function LibraryView({
  instances,
  isLoading,
  searchQuery,
  onSelectInstance,
  onNewInstance,
}: LibraryViewProps) {
  const filteredInstances = instances.filter(
    i =>
      i.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (i.description ?? '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (i.basePack ?? '').toLowerCase().includes(searchQuery.toLowerCase())
  );

  const colCount = Math.min(MAX_COLS, Math.max(1, filteredInstances.length));

  return (
    <div className="p-8 content-pad animate-slide-in">
      {!isLoading && filteredInstances.length > 0 && (
        <div className="flex justify-end mb-4">
          <span className="text-[13px]" style={{ color: 'var(--text-secondary)' }}>
            {filteredInstances.length} pack{filteredInstances.length !== 1 ? 's' : ''}
          </span>
        </div>
      )}

      {isLoading ? (
        <div className="library-grid library-grid-cols-3" aria-label="Loading packs">
          {[0, 1, 2].map(index => (
            <div
              key={index}
              className="h-56 rounded-xl animate-pulse"
              style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}
            />
          ))}
        </div>
      ) : filteredInstances.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24">
          <div
            className="flex items-center justify-center rounded-2xl mb-4"
            style={{
              width: 56,
              height: 56,
              background: 'var(--bg-muted)',
              border: '1px solid var(--border)',
            }}
          >
            <Icon name="folder" size={22} />
          </div>
          <p className="text-sm font-medium mb-1" style={{ color: 'var(--text-primary)' }}>
            {searchQuery ? 'No matching packs' : 'No packs yet'}
          </p>
          <p className="text-[13px] mb-4" style={{ color: 'var(--text-secondary)' }}>
            {searchQuery
              ? `Nothing matches “${searchQuery}”. Try another search.`
              : 'Create your first pack to get started'}
          </p>
          {!searchQuery && (
            <button className="btn-accent text-[13px] px-4 py-2" onClick={onNewInstance}>
              <Icon name="plus" size={14} />
              New Pack
            </button>
          )}
        </div>
      ) : (
        <div className={`library-grid library-grid-cols-${colCount}`}>
          {filteredInstances.map(instance => (
            <InstanceCard key={instance.id} instance={instance} onClick={onSelectInstance} />
          ))}
        </div>
      )}
    </div>
  );
}
