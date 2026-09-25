import { useState, useEffect, useSyncExternalStore } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useTheme } from '../../context/ThemeContext';
import { useToast } from '../../context/ToastContext';
import { Icon } from '../Icon';
import {
  checkAppUpdate,
  installAppUpdate,
  getUpdateChannel,
  setUpdateChannel,
  restartApp,
  listenUpdateProgress,
  AppUpdateStatus,
  UpdateChannel,
  UpdateProgressPayload,
} from '../../lib/appUpdater';
import {
  clearAppLog,
  formatAppLogText,
  getAppLogEntries,
  isVerboseLogging,
  setVerboseLogging,
  subscribeAppLog,
  appLog,
} from '../../lib/appLog';

export function SettingsView() {
  const { theme, toggleTheme, accent, setAccent } = useTheme();
  const { addToast } = useToast();
  const [dataDir, setDataDir] = useState<string>('Loading...');
  const [logsDir, setLogsDir] = useState<string>('');
  const [appVersion, setAppVersion] = useState<string>('Unknown');
  const [verbose, setVerbose] = useState(isVerboseLogging);
  const [diskTail, setDiskTail] = useState('');
  const [loadingTail, setLoadingTail] = useState(false);

  // App updater state
  const [updateChannel, setUpdateChannelState] = useState<UpdateChannel>('stable');
  const [updateStatus, setUpdateStatus] = useState<AppUpdateStatus | null>(null);
  const [isCheckingUpdate, setIsCheckingUpdate] = useState(false);
  const [isInstallingUpdate, setIsInstallingUpdate] = useState(false);
  const [updateProgress, setUpdateProgress] = useState<UpdateProgressPayload | null>(null);
  const [updateInstalled, setUpdateInstalled] = useState(false);
  const [lastCheckedAt, setLastCheckedAt] = useState<string>('');

  const logEntries = useSyncExternalStore(subscribeAppLog, getAppLogEntries, getAppLogEntries);

  useEffect(() => {
    getUpdateChannel()
      .then(ch => setUpdateChannelState(ch))
      .catch(() => {});
  }, []);

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    listenUpdateProgress(p => {
      setUpdateProgress(p);
    }).then(u => {
      unlisten = u;
    });
    return () => {
      if (unlisten) unlisten();
    };
  }, []);

  useEffect(() => {
    invoke<{ data_dir: string; logs_dir?: string; version: string }>('get_app_info')
      .then(info => {
        if (info?.data_dir) setDataDir(info.data_dir);
        if (info?.logs_dir) setLogsDir(info.logs_dir);
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

  const handleOpenLogs = async () => {
    try {
      await invoke('open_logs_dir');
    } catch {
      addToast('Failed to open logs folder', 'error');
    }
  };

  const handleCopySession = async () => {
    const text = formatAppLogText();
    try {
      await navigator.clipboard.writeText(text || '(empty)');
      addToast('Session log copied', 'info');
    } catch {
      addToast('Could not copy to clipboard', 'error');
    }
  };

  const handleRefreshDisk = async () => {
    setLoadingTail(true);
    try {
      const tail = await invoke<string>('read_log_tail', { maxBytes: 48_000 });
      setDiskTail(tail || '(no log file yet — run a rebuild or export)');
      appLog('debug', 'debug', 'Refreshed disk log tail');
    } catch (e) {
      setDiskTail(String(e));
      addToast('Failed to read log file', 'error');
    } finally {
      setLoadingTail(false);
    }
  };

  const handleCheckUpdate = async (targetChannel?: UpdateChannel) => {
    setIsCheckingUpdate(true);
    setUpdateProgress(null);
    setUpdateInstalled(false);
    try {
      const ch = targetChannel || updateChannel;
      const status = await checkAppUpdate(ch);
      setUpdateStatus(status);
      setLastCheckedAt(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
      if (status.available) {
        addToast(`Packweaver ${status.version || 'update'} is available!`, 'info');
      } else if (status.message) {
        addToast(status.message, 'info');
      } else {
        addToast("You're on the latest build for this channel.", 'info');
      }
    } catch (e) {
      addToast(`Update check failed: ${String(e)}`, 'error');
    } finally {
      setIsCheckingUpdate(false);
    }
  };

  const handleChannelChange = async (ch: UpdateChannel) => {
    setUpdateChannelState(ch);
    try {
      await setUpdateChannel(ch);
      addToast(`Switched to ${ch} channel`, 'info');
      void handleCheckUpdate(ch);
    } catch {
      addToast('Failed to switch channel', 'error');
    }
  };

  const handleInstallUpdate = async () => {
    setIsInstallingUpdate(true);
    setUpdateProgress(null);
    try {
      await installAppUpdate(updateChannel);
      setUpdateInstalled(true);
      addToast('Update downloaded and staged! Ready to restart.', 'success');
    } catch (e) {
      addToast(`Failed to install update: ${String(e)}`, 'error');
    } finally {
      setIsInstallingUpdate(false);
    }
  };

  const handleRestart = async () => {
    try {
      await restartApp();
    } catch {
      addToast('Please restart Packweaver manually to complete the update.', 'info');
    }
  };

  return (
    <div className="p-8 content-pad max-w-4xl animate-slide-in flex flex-col min-h-full">
      <div className="mb-8">
        <div className="page-kicker">Workshop</div>
        <h2 className="page-title">Settings</h2>
        <p className="page-lede">Theme, accent, updates, and where Packweaver keeps pack data.</p>
      </div>

      <div className="mb-8">
        <h3 className="section-label">Updates</h3>
        <div className="loom-panel">
          <div className="loom-panel-body flex flex-col gap-1">
            <div className="setting-row" style={{ borderBottom: '1px solid var(--border)' }}>
              <div>
                <div className="text-[13px] font-medium" style={{ color: 'var(--text-primary)' }}>
                  Update channel
                </div>
                <div className="text-[12.5px]" style={{ color: 'var(--text-secondary)' }}>
                  Stable receives official releases; Unstable receives preview builds
                </div>
              </div>
              <div
                className="flex gap-1 p-0.5 rounded-md shrink-0"
                style={{ background: 'var(--bg-muted)', border: '1px solid var(--border)' }}
              >
                {(['stable', 'unstable'] as const).map(ch => (
                  <button
                    key={ch}
                    className={`text-[12px] px-3 py-1 rounded transition-colors font-medium capitalize ${
                      updateChannel === ch
                        ? 'shadow-xs font-semibold'
                        : 'hover:text-[var(--text-primary)]'
                    }`}
                    style={{
                      background: updateChannel === ch ? 'var(--bg-surface)' : 'transparent',
                      color: updateChannel === ch ? 'var(--text-primary)' : 'var(--text-secondary)',
                    }}
                    onClick={() => handleChannelChange(ch)}
                    disabled={isCheckingUpdate || isInstallingUpdate}
                  >
                    {ch}
                  </button>
                ))}
              </div>
            </div>

            <div
              className="setting-row"
              style={{ borderBottom: updateStatus?.available ? '1px solid var(--border)' : 'none' }}
            >
              <div>
                <div className="text-[13px] font-medium" style={{ color: 'var(--text-primary)' }}>
                  Desktop app version
                </div>
                <div className="text-[12.5px]" style={{ color: 'var(--text-secondary)' }}>
                  Currently running {appVersion}
                  {lastCheckedAt ? ` · Checked at ${lastCheckedAt}` : ''}
                </div>
              </div>
              <button
                className="btn-secondary text-[11px] px-3 py-1.5 flex items-center gap-1.5 shrink-0"
                onClick={() => handleCheckUpdate()}
                disabled={isCheckingUpdate || isInstallingUpdate}
              >
                <Icon name="refresh" size={13} className={isCheckingUpdate ? 'animate-spin' : ''} />
                {isCheckingUpdate ? 'Checking…' : 'Check for updates'}
              </button>
            </div>

            {updateStatus?.available && (
              <div
                className="p-4 rounded-md mt-2 flex flex-col gap-3"
                style={{
                  background: 'var(--bg-muted)',
                  border: '1px solid var(--accent)',
                }}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span
                      className="text-[11px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded"
                      style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}
                    >
                      New Version
                    </span>
                    <span
                      className="text-[13px] font-bold"
                      style={{ color: 'var(--text-primary)' }}
                    >
                      v{updateStatus.version}
                    </span>
                  </div>
                  {updateInstalled ? (
                    <button
                      className="btn-primary text-[12px] px-3 py-1.5 flex items-center gap-1.5"
                      onClick={handleRestart}
                    >
                      <Icon name="refresh" size={13} />
                      Restart & Relaunch
                    </button>
                  ) : (
                    <button
                      className="btn-primary text-[12px] px-3 py-1.5 flex items-center gap-1.5"
                      onClick={handleInstallUpdate}
                      disabled={isInstallingUpdate}
                    >
                      <Icon name="download" size={13} />
                      {isInstallingUpdate ? 'Installing…' : 'Update now'}
                    </button>
                  )}
                </div>

                {updateStatus.notes && (
                  <div
                    className="text-[12px] font-mono p-3 rounded max-h-36 overflow-y-auto whitespace-pre-wrap"
                    style={{
                      background: 'var(--bg-surface)',
                      border: '1px solid var(--border)',
                      color: 'var(--text-secondary)',
                    }}
                  >
                    {updateStatus.notes}
                  </div>
                )}

                {updateProgress && (
                  <div className="flex flex-col gap-1.5">
                    <div
                      className="flex justify-between text-[11px]"
                      style={{ color: 'var(--text-muted)' }}
                    >
                      <span>
                        {(updateProgress.downloaded / (1024 * 1024)).toFixed(1)} MB
                        {updateProgress.total
                          ? ` / ${(updateProgress.total / (1024 * 1024)).toFixed(1)} MB`
                          : ''}
                      </span>
                      <span>
                        {updateProgress.percentage
                          ? `${Math.round(updateProgress.percentage)}%`
                          : 'Downloading…'}
                      </span>
                    </div>
                    <div
                      className="w-full h-1.5 rounded-full overflow-hidden"
                      style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}
                    >
                      <div
                        className="h-full transition-all duration-200"
                        style={{
                          width: `${Math.min(100, Math.max(0, updateProgress.percentage || 0))}%`,
                          background: 'var(--accent)',
                        }}
                      />
                    </div>
                  </div>
                )}

                {updateInstalled && (
                  <div className="text-[12px] font-medium" style={{ color: 'var(--accent)' }}>
                    Update installed! Click "Restart & Relaunch" to apply the new version.
                  </div>
                )}
              </div>
            )}

            {!updateStatus?.available && updateStatus?.message && (
              <div className="px-3 py-1.5 text-[12px]" style={{ color: 'var(--text-muted)' }}>
                {updateStatus.message}
              </div>
            )}
          </div>
        </div>
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

      <div className="mb-8">
        <h3 className="section-label">Warp tape</h3>
        <p className="text-[12.5px] mb-3" style={{ color: 'var(--text-secondary)' }}>
          Session ticks and on-disk rebuild/export logs — copy this when something misfires.
        </p>
        <div className="warp-tape loom-panel">
          <div className="loom-panel-body flex flex-col gap-3">
            <div
              className="setting-row"
              style={{ borderBottom: '1px solid var(--border)', paddingTop: 0 }}
            >
              <div>
                <div className="text-[13px] font-medium" style={{ color: 'var(--text-primary)' }}>
                  Verbose ticks
                </div>
                <div className="text-[12.5px]" style={{ color: 'var(--text-secondary)' }}>
                  Progress noise and debug lines on the tape
                </div>
              </div>
              <button
                role="switch"
                aria-checked={verbose}
                aria-label="Toggle verbose logging"
                className={`theme-toggle-track ${verbose ? 'on' : ''}`}
                onClick={() => {
                  const next = !verbose;
                  setVerbose(next);
                  setVerboseLogging(next);
                }}
              >
                <div className="theme-toggle-knob" />
              </button>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                className="btn-secondary text-[11px] px-3 py-1.5"
                onClick={handleCopySession}
                type="button"
              >
                Copy session
              </button>
              <button
                className="btn-ghost text-[11px] px-3 py-1.5"
                onClick={() => {
                  clearAppLog();
                  addToast('Session tape cleared', 'info');
                }}
                type="button"
              >
                Clear session
              </button>
              <button
                className="btn-secondary text-[11px] px-3 py-1.5 flex items-center gap-1.5"
                onClick={handleOpenLogs}
                type="button"
              >
                <Icon name="folder" size={13} />
                Open logs
              </button>
              <button
                className="btn-ghost text-[11px] px-3 py-1.5"
                onClick={handleRefreshDisk}
                disabled={loadingTail}
                type="button"
              >
                {loadingTail ? 'Reading…' : 'Load disk tail'}
              </button>
            </div>

            {logsDir ? (
              <div
                className="text-[11px] font-mono truncate"
                style={{ color: 'var(--text-muted)' }}
                title={logsDir}
              >
                {logsDir}
              </div>
            ) : null}

            <div className="warp-tape-roll" role="log" aria-label="Session log">
              {logEntries.length === 0 ? (
                <div className="warp-tape-empty">No ticks yet — rebuild or export a pack.</div>
              ) : (
                logEntries.map(e => (
                  <div key={e.id} className={`warp-tape-line warp-tape-${e.level}`}>
                    <span className="warp-tape-time">{e.at.slice(11, 19)}</span>
                    <span className="warp-tape-scope">{e.scope}</span>
                    <span className="warp-tape-msg">{e.message}</span>
                  </div>
                ))
              )}
            </div>

            {diskTail ? (
              <pre className="warp-tape-disk" aria-label="Disk log tail">
                {diskTail}
              </pre>
            ) : null}
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
