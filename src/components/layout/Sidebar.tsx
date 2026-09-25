import { Icon } from '../Icon';
import { useTheme } from '../../context/ThemeContext';

interface SidebarProps {
  activeScreen: string;
  onNavigate: (screen: string) => void;
  hasAppUpdate?: boolean;
}

const NAV = [
  { id: 'library', label: 'Library', icon: 'grid' },
  { id: 'plugins', label: 'Plugins', icon: 'puzzle' },
];

export function Sidebar({ activeScreen, onNavigate, hasAppUpdate }: SidebarProps) {
  const { theme, toggleTheme } = useTheme();

  return (
    <aside
      className="theme-transition flex flex-col h-full"
      style={{
        width: 'var(--sidebar-w)',
        minWidth: 'var(--sidebar-w)',
        background: 'var(--bg-muted)',
        borderRight: '1px solid var(--border)',
      }}
    >
      <div
        className="flex items-center gap-2.5 px-5"
        style={{ height: 'var(--header-h)', borderBottom: '1px solid var(--border)' }}
      >
        <div
          className="flex items-center justify-center"
          style={{
            width: 28,
            height: 28,
            borderRadius: 6,
            background: 'var(--accent-soft)',
            color: 'var(--accent)',
            border: '1px solid var(--accent)',
          }}
        >
          <Icon name="package" size={15} />
        </div>
        <span
          className="sidebar-brand text-sm tracking-tight"
          style={{ color: 'var(--text-primary)' }}
        >
          Packweaver
        </span>
      </div>
      <nav className="flex-1 flex flex-col gap-0.5 px-3 pt-4 pb-3">
        {NAV.map(item => {
          const isActive =
            activeScreen === item.id || (item.id === 'library' && activeScreen === 'detail');
          return (
            <button
              key={item.id}
              className={`sidebar-link ${isActive ? 'active' : ''}`}
              onClick={() => onNavigate(item.id)}
            >
              <Icon name={item.icon} />
              {item.label}
            </button>
          );
        })}
      </nav>
      <div className="mx-3" style={{ borderTop: '1px solid var(--border)' }} />
      <div className="flex flex-col gap-0.5 px-3 pt-3 pb-4">
        <div className="flex items-center gap-1">
          <button
            className={`sidebar-link ${activeScreen === 'settings' ? 'active' : ''} flex items-center gap-2`}
            onClick={() => onNavigate('settings')}
            style={{ flex: 1 }}
          >
            <Icon name="settings" />
            <span className="flex-1 text-left">Settings</span>
            {hasAppUpdate && (
              <span
                className="w-2 h-2 rounded-full shrink-0"
                style={{ background: 'var(--accent)' }}
                title="Application update available"
              />
            )}
          </button>
          <button
            className="btn-ghost"
            onClick={toggleTheme}
            aria-label="Toggle dark mode"
            style={{ marginRight: 4, flexShrink: 0, padding: 8 }}
          >
            <Icon name={theme === 'dark' ? 'sun' : 'moon'} size={15} />
          </button>
        </div>
      </div>
    </aside>
  );
}
