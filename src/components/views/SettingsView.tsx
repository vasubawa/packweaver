import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useTheme } from '../../context/ThemeContext';
import { useToast } from '../../context/ToastContext';
import { Icon } from '../Icon';

export function SettingsView() {
  const { theme, toggleTheme, accent, setAccent } = useTheme();
  const { addToast } = useToast();
  const [dataDir, setDataDir] = useState<string>('Loading...');
  const [appVersion, setAppVersion] = useState<string>('Unknown');

  useEffect(() => {
    invoke<{ data_dir: string; version: string }>('get_app_info')
      .then(info => {
        if (info?.data_dir) setDataDir(info.data_dir);
        if (info?.version) setAppVersion(`v${info.version}`);
      })
      .catch(() => {
        setDataDir('packweaver-data');
        setAppVersion('Unknown');
      });
  }, []);

  const handleOpenDataDir = async () => {
    try {
      await invoke('open_data_dir');
    } catch {
      addToast('Failed to open data folder', 'error');
    }
  };

  const handleClearCache = () => {
    addToast('Cache clearing is not yet available', 'info');
  };

  return (
    <div className="p-8 max-w-4xl animate-slide-in flex flex-col min-h-full">
      <h2
        className="text-xl font-semibold tracking-tight mb-1"
        style={{ color: 'var(--text-primary)', fontFamily: "'Newsreader', Georgia, serif" }}
      >
        Settings
      </h2>
      <p className="text-xs mb-6" style={{ color: 'var(--text-muted)' }}>
        Configure your Packweaver preferences and storage
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
              role="switch"
              aria-checked={theme === 'dark'}
              aria-label="Toggle dark mode"
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
                  aria-label={`Select ${color} accent`}
                  aria-pressed={accent === color}
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
          Data & Storage
        </h3>
        <div
          className="rounded-xl p-4 flex flex-col gap-4"
          style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}
        >
          <div className="setting-row">
            <div className="flex-1 mr-4 overflow-hidden">
              <div className="text-[13px] font-medium" style={{ color: 'var(--text-primary)' }}>
                Portable Data Directory
              </div>
              <div
                className="text-[11.5px] truncate font-mono mt-0.5"
                style={{ color: 'var(--text-muted)' }}
                title={dataDir}
              >
                {dataDir}
              </div>
            </div>
            <div className="flex gap-2 shrink-0">
              <button
                className="btn-secondary text-[11px] px-3 py-1.5 flex items-center gap-1.5"
                onClick={handleOpenDataDir}
              >
                <Icon name="folder" size={13} />
                Open Folder
              </button>
            </div>
          </div>

          <div className="setting-row pt-4" style={{ borderTop: '1px solid var(--border)' }}>
            <div>
              <div className="text-[13px] font-medium" style={{ color: 'var(--text-primary)' }}>
                Temporary Files
              </div>
              <div className="text-[11.5px]" style={{ color: 'var(--text-muted)' }}>
                Clear downloaded temporary zip and archive cache
              </div>
            </div>
            <button
              className="btn-ghost text-[11px] px-3 py-1.5"
              onClick={handleClearCache}
              disabled
              title="Coming soon"
              style={{ opacity: 0.5, cursor: 'not-allowed' }}
            >
              Clear Cache
            </button>
          </div>
        </div>
      </div>

      <div className="flex-1" />
      <div className="mb-8 text-center mt-12">
        <p className="text-[11px] mb-2" style={{ color: 'var(--text-muted)' }}>
          Packweaver {appVersion}
        </p>
        <div className="flex justify-center gap-4 text-[11.5px]">
          <span style={{ color: 'var(--text-muted)' }}>MIT License</span>
        </div>
      </div>
    </div>
  );
}
