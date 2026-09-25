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
  onRefreshUpdates?: () => void;
  isRefreshingUpdates?: boolean;
}

export function LibraryView({
  instances,
  isLoading,
  searchQuery,
  onSelectInstance,
  onNewInstance,
  onRefreshUpdates,
  isRefreshingUpdates,
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
        <div className="flex items-center justify-between mb-4">
          {onRefreshUpdates && (
            <button
              type="button"
              className="btn-ghost text-[12px] px-2.5 py-1 flex items-center gap-1.5"
              onClick={onRefreshUpdates}
              disabled={isRefreshingUpdates}
              title="Bypass 24h cache and check all packs for updates"
            >
              <Icon
                name="refresh"
                size={12}
                className={isRefreshingUpdates ? 'animate-spin' : ''}
              />
              <span>{isRefreshingUpdates ? 'Checking updates…' : 'Check updates'}</span>
            </button>
          )}
          <span className="text-[13px] ml-auto" style={{ color: 'var(--text-secondary)' }}>
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
          <p
            className="text-sm font-medium mb-1"
            style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-heading)' }}
          >
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
