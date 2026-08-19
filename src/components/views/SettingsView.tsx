import { useTheme } from '../../context/ThemeContext';
import { useToast } from '../../context/ToastContext';

export function SettingsView() {
  const { theme, toggleTheme, accent, setAccent } = useTheme();
  const { addToast } = useToast();

  const handleClearCache = () => {
    addToast('Cache cleared successfully', 'success');
  };

  return (
    <div className="p-6 max-w-2xl animate-slide-in">
      <h2
        className="text-xl font-semibold tracking-tight mb-1"
        style={{ color: 'var(--text-primary)', fontFamily: "'Newsreader', Georgia, serif" }}
      >
        Settings
      </h2>
      <p className="text-xs mb-6" style={{ color: 'var(--text-muted)' }}>
        Configure your Packweaver preferences
      </p>

      <div className="mb-8">
        <h3
          className="text-xs font-semibold uppercase tracking-wider mb-3"
          style={{ color: 'var(--text-muted)' }}
        >
          Appearance
        </h3>
        <div
          className="rounded-xl p-4 flex flex-col gap-4"
          style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}
        >
          <div className="setting-row">
            <div>
              <div className="text-[13px] font-medium" style={{ color: 'var(--text-primary)' }}>
                Dark Mode
              </div>
              <div className="text-[11.5px]" style={{ color: 'var(--text-muted)' }}>
                Switch between light and dark theme
              </div>
            </div>
            <button
              className={`theme-toggle-track ${theme === 'dark' ? 'on' : ''}`}
              onClick={toggleTheme}
            >
              <div className="theme-toggle-knob" />
            </button>
          </div>

          <div className="setting-row pt-4" style={{ borderTop: '1px solid var(--border)' }}>
            <div>
              <div className="text-[13px] font-medium" style={{ color: 'var(--text-primary)' }}>
                Accent Color
              </div>
              <div className="text-[11.5px]" style={{ color: 'var(--text-muted)' }}>
                Choose your preferred highlight color
              </div>
            </div>
            <div className="flex gap-2">
              {(['packweaver', 'modrinth', 'curseforge', 'deepslate'] as const).map(color => (
                <button
                  key={color}
                  className={`w-6 h-6 rounded-full border-2 transition-transform ${accent === color ? 'scale-110 border-white shadow-sm' : 'border-transparent hover:scale-105'}`}
                  style={{
                    backgroundColor:
                      color === 'packweaver'
                        ? '#d97355'
                        : color === 'modrinth'
                          ? '#1bd96a'
                          : color === 'curseforge'
                            ? '#f16436'
                            : '#64748b',
                  }}
                  onClick={() => setAccent(color)}
                  title={color}
                />
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="mb-8">
        <h3
          className="text-xs font-semibold uppercase tracking-wider mb-3"
          style={{ color: 'var(--text-muted)' }}
        >
          Java Environment
        </h3>
        <div
          className="rounded-xl p-4 flex flex-col gap-4"
          style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}
        >
          <div className="setting-row">
            <div>
              <div className="text-[13px] font-medium" style={{ color: 'var(--text-primary)' }}>
                Java Runtime
              </div>
              <div className="text-[11.5px]" style={{ color: 'var(--text-muted)' }}>
                Detected: Java 21 (Eclipse Adoptium)
              </div>
            </div>
            <button className="btn-secondary text-[11px] px-3 py-1.5">Change...</button>
          </div>
          <div className="setting-row pt-4" style={{ borderTop: '1px solid var(--border)' }}>
            <div className="flex-1 mr-8">
              <div
                className="text-[13px] font-medium mb-1"
                style={{ color: 'var(--text-primary)' }}
              >
                Memory Allocation
              </div>
              <div className="flex items-center gap-4">
                <input
                  type="range"
                  min="2"
                  max="16"
                  defaultValue="8"
                  className="w-full accent-[var(--accent)]"
                />
                <span
                  className="text-[12px] font-mono font-medium"
                  style={{ color: 'var(--text-muted)' }}
                >
                  8 GB
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="mb-8">
        <h3
          className="text-xs font-semibold uppercase tracking-wider mb-3"
          style={{ color: 'var(--text-muted)' }}
        >
          Downloads & Storage
        </h3>
        <div
          className="rounded-xl p-4 flex flex-col gap-4"
          style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}
        >
          <div className="setting-row">
            <div>
              <div className="text-[13px] font-medium" style={{ color: 'var(--text-primary)' }}>
                Cache Directory
              </div>
              <div
                className="text-[11.5px] truncate max-w-[200px]"
                style={{ color: 'var(--text-muted)' }}
              >
                ~/.packweaver/cache
              </div>
            </div>
            <div className="flex gap-2">
              <button className="btn-ghost text-[11px] px-3 py-1.5" onClick={handleClearCache}>
                Clear Cache
              </button>
              <button className="btn-secondary text-[11px] px-3 py-1.5">Browse...</button>
            </div>
          </div>
        </div>
      </div>

      <div className="mb-8 text-center mt-12">
        <p className="text-[11px] mb-2" style={{ color: 'var(--text-muted)' }}>
          Packweaver v0.1.0-alpha
        </p>
        <div className="flex justify-center gap-4 text-[11.5px]">
          <a href="#" className="hover:underline" style={{ color: 'var(--accent)' }}>
            GitHub
          </a>
          <a href="#" className="hover:underline" style={{ color: 'var(--text-muted)' }}>
            License
          </a>
        </div>
      </div>
    </div>
  );
}
