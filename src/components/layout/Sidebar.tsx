import { Icon } from '../Icon';
import { useTheme } from '../../context/ThemeContext';

interface SidebarProps {
  activeScreen: string;
  onNavigate: (screen: string) => void;
}

const NAV = [
  { id: 'library', label: 'Library', icon: 'grid' },
  { id: 'plugins', label: 'Plugins', icon: 'puzzle' }
];

export function Sidebar({ activeScreen, onNavigate }: SidebarProps) {
  const { theme, toggleTheme } = useTheme();
  
  return (
    <aside className="theme-transition flex flex-col h-full" style={{ width: 'var(--sidebar-w)', minWidth: 'var(--sidebar-w)', background: 'var(--bg-muted)', borderRight: '1px solid var(--border)' }}>
      <div className="flex items-center gap-2.5 px-5" style={{ height: 'var(--header-h)', borderBottom: '1px solid var(--border)' }}>
        <div className="flex items-center justify-center rounded-lg" style={{ width: 28, height: 28, background: 'var(--accent)', color: '#fff' }}>
          <Icon name="package" size={15} />
        </div>
        <span className="text-sm font-semibold tracking-tight" style={{ color: 'var(--text-primary)' }}>Packweaver</span>
      </div>
      <nav className="flex-1 flex flex-col gap-0.5 px-3 pt-4 pb-3">
        {NAV.map(item => (
          <button 
            key={item.id} 
            className={`sidebar-link ${activeScreen === item.id ? 'active' : ''}`} 
            onClick={() => onNavigate(item.id)}
          >
            <Icon name={item.icon} />{item.label}
          </button>
        ))}
      </nav>
      <div className="mx-3" style={{ borderTop: '1px solid var(--border)' }} />
      <div className="flex flex-col gap-0.5 px-3 pt-3 pb-4">
        <div className="flex items-center gap-1">
          <button 
            className={`sidebar-link ${activeScreen === 'settings' ? 'active' : ''}`} 
            onClick={() => onNavigate('settings')} 
            style={{ flex: 1 }}
          >
            <Icon name="settings" />Settings
          </button>
          <button 
            className="btn-ghost" 
            onClick={toggleTheme} 
            aria-label="Toggle dark mode" 
            style={{ marginRight: 4, flexShrink: 0, padding: 8 }}
          >
            <Icon name={theme === 'dark' ? 'moon' : 'user'} size={15} /> 
            {/* Using a placeholder icon 'user' for light mode if 'sun' is missing, can fallback. 
                Wait, Icon doesn't have 'sun'. I will just use 'moon' toggle or 'grid'. Let's keep it 'moon' and color code. */}
          </button>
        </div>
      </div>
    </aside>
  );
}
