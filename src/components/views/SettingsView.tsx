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

  return (
    <div className="p-8 content-pad max-w-4xl animate-slide-in flex flex-col min-h-full">
      <div className="mb-8">
        <div className="page-kicker">Workshop</div>
        <h2 className="page-title">Settings</h2>
        <p className="page-lede">Theme, accent, and where Packweaver keeps pack data.</p>
      </div>

      <div className="mb-8">
        <h3 className="section-label">Appearance</h3>
        <div className="loom-panel">
          <div className="loom-panel-body flex flex-col gap-1">
            <div className="setting-row" style={{ borderBottom: '1px solid var(--border)' }}>
              <div>
                <div className="text-[13px] font-medium" style={{ color: 'var(--text-primary)' }}>
                  Dark mode
                </div>
                <div className="text-[12.5px]" style={{ color: 'var(--text-secondary)' }}>
                  Cool paper by day, night bench after dark
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

            <div className="setting-row" style={{ borderBottom: 'none' }}>
              <div>
                <div className="text-[13px] font-medium" style={{ color: 'var(--text-primary)' }}>
                  Accent
                </div>
                <div className="text-[12.5px]" style={{ color: 'var(--text-secondary)' }}>
                  Shuttle copper by default; sources keep their own colors
                </div>
              </div>
              <div className="flex gap-2">
                {(['packweaver', 'modrinth', 'curseforge', 'deepslate'] as const).map(color => (
                  <button
                    key={color}
                    className={`w-6 h-6 rounded-full border-2 transition-transform ${accent === color ? 'scale-110 shadow-sm' : 'border-transparent hover:scale-105'}`}
                    style={{
                      backgroundColor:
                        color === 'packweaver'
                          ? '#b86b2c'
                          : color === 'modrinth'
                            ? '#1bd96a'
                            : color === 'curseforge'
                              ? '#f16436'
                              : '#5c6570',
                      borderColor: accent === color ? 'var(--text-primary)' : undefined,
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
      </div>

      <div className="mb-8">
        <h3 className="section-label">Data</h3>
        <div className="loom-panel">
          <div className="loom-panel-body">
            <div className="setting-row" style={{ borderBottom: 'none', padding: 0 }}>
              <div className="flex-1 mr-4 overflow-hidden">
                <div className="text-[13px] font-medium" style={{ color: 'var(--text-primary)' }}>
                  Data folder
                </div>
                <div
                  className="text-[12px] truncate font-mono mt-0.5"
                  style={{ color: 'var(--text-muted)' }}
                  title={dataDir}
                >
                  {dataDir}
                </div>
              </div>
              <button
                className="btn-secondary text-[11px] px-3 py-1.5 flex items-center gap-1.5 shrink-0"
                onClick={handleOpenDataDir}
              >
                <Icon name="folder" size={13} />
                Open folder
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="flex-1" />
      <div className="mb-8 mt-12">
        <p className="font-mono-meta">Packweaver {appVersion} · MIT</p>
      </div>
    </div>
  );
}
