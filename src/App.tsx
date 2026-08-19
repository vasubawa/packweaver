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
  const { addToast } = useToast();

  const loadInstances = useCallback(async () => {
    try {
      const data = await invoke<any[]>('get_instances');

      const augmented: Instance[] = data.map((inst: any) => ({
        ...inst,
        basePack: inst.basePack || 'Unknown',
        basePackVersion: inst.basePackVersion || 'Unknown',
        mcVersion: inst.mcVersion || '1.20.1',
        loader: inst.loader || 'Fabric',
        totalModCount: inst.totalModCount || 0,
        source: inst.source || 'local',
      }));

      setInstances(augmented);
    } catch {
      setInstances([]);
      addToast('Failed to load instances. Is the backend running?', 'error');
    }
  }, [addToast]);

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

      if (event.payload.status === 'Ready') {
        loadInstances();
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

  const handleExport = useCallback(
    (instance: Instance) => {
      addToast(`Exporting "${instance.name}" as universal pack...`, 'success');
    },
    [addToast]
  );

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

        <main className="flex-1 overflow-y-auto scrollbar-thin">
          {screen === 'library' && (
            <LibraryView
              instances={instances}
              searchQuery={searchQuery}
              onSelectInstance={handleSelectInstance}
              onExportInstance={handleExport}
              onNewInstance={() => setShowCreateModal(true)}
              onDeleteInstance={handleDeleteInstance}
            />
          )}

          {screen === 'detail' && selectedInstance && (
            <DetailView
              instance={selectedInstance}
              onBack={handleBack}
              onExport={handleExport}
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
