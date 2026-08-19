import { Icon } from '../Icon';

interface HeaderProps {
  searchQuery?: string;
  onSearchChange?: (query: string) => void;
  onNewInstance?: () => void;
  title: string;
  subtitle?: string | null;
  showSearchAndActions?: boolean;
}

export function Header({ searchQuery = '', onSearchChange, onNewInstance, title, subtitle, showSearchAndActions = false }: HeaderProps) {
  return (
    <header className="theme-transition flex items-center justify-between px-6" style={{ height: 'var(--header-h)', minHeight: 'var(--header-h)', borderBottom: '1px solid var(--border)', background: 'var(--bg-surface)' }}>
      <div className="flex items-center gap-6 flex-1">
        <div className="flex flex-col justify-center min-w-0">
          <h1 className="text-[15px] font-semibold tracking-tight truncate" style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-heading)' }}>{title}</h1>
          {subtitle && <p className="text-[11.5px] truncate" style={{ color: 'var(--text-muted)' }}>{subtitle}</p>}
        </div>
        
        {showSearchAndActions && onSearchChange && (
          <div className="relative flex-1 max-w-sm">
            <div className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-muted)' }}>
              <Icon name="search" size={15} />
            </div>
            <input 
              className="search-pill" 
              type="text" 
              placeholder="Search packs..." 
              value={searchQuery} 
              onChange={e => onSearchChange(e.target.value)} 
            />
          </div>
        )}
      </div>
      
      {showSearchAndActions && onNewInstance && (
        <button className="btn-primary" onClick={onNewInstance}>
          <Icon name="plus" size={14} />New Pack
        </button>
      )}
    </header>
  );
}
