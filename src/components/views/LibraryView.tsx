import { Icon } from '../Icon';
import { InstanceCard } from '../instances/InstanceCard';
import { Instance } from '../../types';

interface LibraryViewProps {
  instances: Instance[];
  searchQuery: string;
  onSelectInstance: (instance: Instance) => void;
  onExportInstance: (instance: Instance) => void;
  onNewInstance: () => void;
}

export function LibraryView({ instances, searchQuery, onSelectInstance, onExportInstance, onNewInstance }: LibraryViewProps) {
  const filteredInstances = instances.filter(i => 
    i.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
    i.description.toLowerCase().includes(searchQuery.toLowerCase()) || 
    i.basePack.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="p-6 animate-slide-in">
      <div className="flex items-baseline justify-between mb-5">
        <h2 className="text-xl font-semibold tracking-tight" style={{ color: 'var(--text-primary)', fontFamily: "'Newsreader', Georgia, serif" }}>Your Packs</h2>
        <span className="text-xs" style={{ color: 'var(--text-muted)' }}>{filteredInstances.length} pack{filteredInstances.length !== 1 ? 's' : ''}</span>
      </div>
      
      {filteredInstances.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24">
          <div className="flex items-center justify-center rounded-2xl mb-4" style={{ width: 56, height: 56, background: 'var(--bg-muted)', border: '1px solid var(--border)' }}>
            <Icon name="folder" size={22} />
          </div>
          <p className="text-sm font-medium mb-1" style={{ color: 'var(--text-primary)' }}>No packs found</p>
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{searchQuery ? 'Try a different search term' : 'Create your first pack to get started'}</p>
        </div>
      ) : (
        <div className="grid gap-4 scrollbar-thin" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))' }}>
          {filteredInstances.map(instance => (
            <InstanceCard key={instance.id} instance={instance} onClick={onSelectInstance} onExport={onExportInstance} />
          ))}
          {filteredInstances.length <= 3 && !searchQuery && (
            <div 
              className="instance-card flex flex-col items-center justify-center cursor-pointer opacity-70 hover:opacity-100 transition-opacity" 
              style={{ minHeight: 180, borderStyle: 'dashed', backgroundColor: 'transparent' }}
              onClick={onNewInstance}
            >
              <div className="flex items-center justify-center rounded-full mb-3" style={{ width: 40, height: 40, background: 'var(--accent-soft)', color: 'var(--accent)' }}>
                <Icon name="plus" size={18} />
              </div>
              <span className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>Create another pack</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
