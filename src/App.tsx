import { useState, useEffect, useMemo, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { CreateInstanceModal } from './components/CreateInstanceModal';
import { Sidebar } from './components/layout/Sidebar';
import { Header } from './components/layout/Header';
import { DetailView } from './components/instances/DetailView';
import { SettingsView } from './components/views/SettingsView';
import { PluginsView } from './components/views/PluginsView';
import { LibraryView } from './components/views/LibraryView';
import { Instance } from './types';
import { useToast } from './context/ToastContext';
import { appLog, installAppLogBridges, isVerboseLogging } from './lib/appLog';
import {
  loadScanCache,
  saveScanCache,
  applyScanCache,
  instancesNeedingScan,
  scanForUpdates,
} from './lib/updateScan';
import { checkAppUpdate } from './lib/appUpdater';
import { Icon } from './components/Icon';
import './App.css';

interface ProgressEvent {
  instance_id: string;
  status: string;
  progress: number;
  total: number;
  stage?: string;
}

function App() {
  const [screen, setScreen] = useState('library');
  const [selectedInstanceId, setSelectedInstanceId] = useState<string | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [instances, setInstances] = useState<Instance[]>([]);
  const [isLoadingInstances, setIsLoadingInstances] = useState(true);
  const [appUpdateVersion, setAppUpdateVersion] = useState<string | null>(null);
  const { addToast } = useToast();

  const loadInstances = useCallback(
    async (opts?: { quiet?: boolean }) => {
      if (!opts?.quiet) setIsLoadingInstances(true);
      try {
        const data = await invoke<any[]>('get_instances');

        const augmented: Instance[] = data.map((inst: any) => ({
          ...inst,
          basePack: inst.basePack || '',
          basePackVersion: inst.basePackVersion || '',
          basePackVersionLabel: inst.basePackVersionLabel || '',
          mcVersion: inst.mcVersion || '',
          loader: (inst.loader || '') as Instance['loader'],
          totalModCount: inst.totalModCount || 0,
          source: inst.source || 'local',
          description: inst.description ?? '',
          status: inst.status || '',
          customMods: (inst.customMods || []).map((m: any) => ({
            ...m,
            versionId: m.versionId || undefined,
          })),
          serverFiles: (inst.serverFiles || []).map(
            (f: {
              id?: string;
              name?: string;
              type?: string;
              fileType?: string;
              source?: string;
              enabled?: boolean;
            }) => ({
              id: f.id || crypto.randomUUID(),
              name: f.name || '',
              type: (f.type || f.fileType || 'config') as 'config' | 'script',
              source: (f.source || 'local') as Instance['source'],
              enabled: f.enabled !== false,
            })
          ),
        }));

        // Badges come from the last background scan; the scan itself runs below.
        setInstances(applyScanCache(augmented, loadScanCache()));
      } catch {
        if (!opts?.quiet) {
          setInstances([]);
          addToast('Failed to load instances. Is the backend running?', 'error');
        }
      } finally {
        if (!opts?.quiet) setIsLoadingInstances(false);
      }
    },
    [addToast]
  );

  useEffect(() => {
    installAppLogBridges();
  }, []);

  useEffect(() => {
    checkAppUpdate()
      .then(status => {
        if (status.available && status.version) {
          setAppUpdateVersion(status.version);
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    // eslint-disable-next-line
    loadInstances();

    const unlisten = listen<ProgressEvent>('instance-progress', event => {
      const p = event.payload;
      const stage = p.stage || 'pipeline';
      if (p.status.startsWith('Error:')) {
        appLog('error', stage, `${p.instance_id}: ${p.status}`);
      } else if (p.status === 'Ready') {
        appLog('info', stage, `${p.instance_id}: Ready`);
      } else if (isVerboseLogging()) {
        appLog('debug', stage, `${p.instance_id}: ${p.status} (${p.progress}/${p.total})`);
      }

      setInstances(prev =>
        prev.map(inst => {
          if (inst.id === p.instance_id) {
            return {
              ...inst,
              status: p.status,
              progress: p.progress,
              total: p.total,
            };
          }
          return inst;
        })
      );

      if (p.status === 'Ready' || p.status.startsWith('Error:')) {
        void loadInstances({ quiet: true });
      }
    });

    return () => {
      unlisten.then(f => f());
    };
  }, [loadInstances]);

  // Light up the update badge without making the user open every pack. Results
  // are cached for a day so opening the app is not a burst of Modrinth calls.
  useEffect(() => {
    if (isLoadingInstances || instances.length === 0) return;
    const pending = instancesNeedingScan(instances, loadScanCache(), Date.now());
    if (pending.length === 0) return;

    let cancelled = false;
    void scanForUpdates(
      pending,
      (id, entry) => {
        saveScanCache({ ...loadScanCache(), [id]: entry });
        setInstances(prev =>
          prev.map(i => (i.id === id ? { ...i, hasUpdate: entry.hasUpdate } : i))
        );
      },
      () => cancelled
    );
    return () => {
      cancelled = true;
    };
    // Re-runs when the pack set changes, not on every progress tick.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoadingInstances, instances.map(i => i.id).join(',')]);

  const handleNavigate = useCallback((s: string) => {
    setScreen(s);
    setSelectedInstanceId(null);
    setSearchQuery('');
  }, []);

  const handleSelectInstance = useCallback((instance: Instance) => {
    setSelectedInstanceId(instance.id);
    setScreen('detail');
  }, []);

  const handleBack = useCallback(() => {
    setSelectedInstanceId(null);
    setScreen('library');
  }, []);

  const handleUpdateInstance = useCallback((id: string, updates: Partial<Instance>) => {
    setInstances(prev => prev.map(i => (i.id === id ? { ...i, ...updates } : i)));
  }, []);

  const [isRefreshingUpdates, setIsRefreshingUpdates] = useState(false);

  const handleRefreshUpdates = useCallback(async () => {
    if (isRefreshingUpdates || instances.length === 0) return;
    setIsRefreshingUpdates(true);
    let updatedCount = 0;
    try {
      await scanForUpdates(instances, (id, entry) => {
        saveScanCache({ ...loadScanCache(), [id]: entry });
        if (entry.hasUpdate) updatedCount++;
        setInstances(prev =>
          prev.map(i => (i.id === id ? { ...i, hasUpdate: entry.hasUpdate } : i))
        );
      });
      addToast(
        updatedCount > 0
          ? `Update check complete: ${updatedCount} pack${updatedCount === 1 ? '' : 's'} have updates`
          : 'Update check complete: all packs are up to date',
        'success'
      );
    } catch (e) {
      addToast(`Update check failed: ${e}`, 'error');
    } finally {
      setIsRefreshingUpdates(false);
    }
  }, [instances, isRefreshingUpdates, addToast]);

  const handleDeleteInstance = useCallback(
    (id: string) => {
      setInstances(prev => prev.filter(i => i.id !== id));
      if (selectedInstanceId === id) {
        setSelectedInstanceId(null);
        setScreen('library');
      }
      addToast('Pack deleted successfully', 'info');
    },
    [selectedInstanceId, addToast]
  );

  const headerTitle = useMemo(() => {
    return { library: 'Library', plugins: 'Plugins', settings: 'Settings' }[screen] || 'Packweaver';
  }, [screen]);

  const selectedInstance = useMemo(
    () => instances.find(i => i.id === selectedInstanceId),
    [instances, selectedInstanceId]
  );

  useEffect(() => {
    if (screen === 'detail' && !selectedInstance) {
      // eslint-disable-next-line
      setScreen('library');
    }
  }, [screen, selectedInstance]);

  return (
    <div className="flex h-screen overflow-hidden" style={{ background: 'var(--bg-canvas)' }}>
      <Sidebar
        activeScreen={screen}
        onNavigate={handleNavigate}
        hasAppUpdate={Boolean(appUpdateVersion)}
      />

      <div className="flex-1 flex flex-col min-w-0 h-full overflow-hidden">
        {appUpdateVersion && screen !== 'settings' && (
          <div
            className="px-4 py-2 flex items-center justify-between text-[12px] font-medium shrink-0 animate-slide-in"
            style={{
              background: 'var(--accent-soft)',
              borderBottom: '1px solid var(--accent)',
              color: 'var(--text-primary)',
            }}
          >
            <div className="flex items-center gap-2">
              <Icon name="package" size={14} style={{ color: 'var(--accent)' }} />
              <span>
                Packweaver <strong>v{appUpdateVersion}</strong> is available.
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button
                className="btn-primary text-[11px] px-2.5 py-1"
                onClick={() => {
                  setScreen('settings');
                  setSelectedInstanceId(null);
                }}
              >
                Update in Settings
              </button>
              <button
                className="btn-ghost text-[11px] px-1.5 py-1"
                onClick={() => setAppUpdateVersion(null)}
                title="Dismiss"
              >
                <Icon name="x" size={13} />
              </button>
            </div>
          </div>
        )}

        {screen !== 'detail' && (
          <Header
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            onNewInstance={() => setShowCreateModal(true)}
            title={headerTitle}
            showSearchAndActions={screen === 'library'}
          />
        )}

        <main className="flex-1 overflow-y-auto">
          {screen === 'library' && (
            <LibraryView
              instances={instances}
              isLoading={isLoadingInstances}
              searchQuery={searchQuery}
              onSelectInstance={handleSelectInstance}
              onNewInstance={() => setShowCreateModal(true)}
              onRefreshUpdates={handleRefreshUpdates}
              isRefreshingUpdates={isRefreshingUpdates}
            />
          )}

          {screen === 'detail' && selectedInstance && (
            <DetailView
              instance={selectedInstance}
              onBack={handleBack}
              onUpdateInstance={handleUpdateInstance}
              onDeleteInstance={handleDeleteInstance}
            />
          )}

          {screen === 'plugins' && <PluginsView />}

          {screen === 'settings' && <SettingsView />}
        </main>
      </div>

      <CreateInstanceModal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onCreated={() => {
          loadInstances();
          addToast('New pack created successfully', 'success');
        }}
      />
    </div>
  );
}

export default App;
