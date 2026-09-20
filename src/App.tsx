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
import './App.css';

interface ProgressEvent {
  instance_id: string;
  status: string;
  progress: number;
  total: number;
}

function App() {
  const [screen, setScreen] = useState('library');
  const [selectedInstanceId, setSelectedInstanceId] = useState<string | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [instances, setInstances] = useState<Instance[]>([]);
  const [isLoadingInstances, setIsLoadingInstances] = useState(true);
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
          serverFiles: (inst.serverFiles || []).map((f: any) => ({
            ...f,
            id: f.id || crypto.randomUUID(),
          })),
        }));

        setInstances(augmented);
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
    // eslint-disable-next-line
    loadInstances();

    const unlisten = listen<ProgressEvent>('instance-progress', event => {
      setInstances(prev =>
        prev.map(inst => {
          if (inst.id === event.payload.instance_id) {
            return {
              ...inst,
              status: event.payload.status,
              progress: event.payload.progress,
              total: event.payload.total,
            };
          }
          return inst;
        })
      );

      if (event.payload.status === 'Ready' || event.payload.status.startsWith('Error:')) {
        void loadInstances({ quiet: true });
      }
    });

    return () => {
      unlisten.then(f => f());
    };
  }, [loadInstances]);

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

  const handleUpdateInstance = useCallback((updatedInstance: Instance) => {
    setInstances(prev => prev.map(i => (i.id === updatedInstance.id ? updatedInstance : i)));
  }, []);

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
      <Sidebar activeScreen={screen} onNavigate={handleNavigate} />

      <div className="flex-1 flex flex-col min-w-0 h-full overflow-hidden">
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
