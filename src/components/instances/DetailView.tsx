import { useState, useEffect, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Instance } from '../../types';
import { DetailHeader } from '../detail/DetailHeader';
import { OverviewTab } from '../detail/OverviewTab';
import { ClientModsTab } from '../detail/ClientModsTab';
import { ServerModsTab } from '../detail/ServerModsTab';
import { CustomModsTab } from '../detail/CustomModsTab';
import { isServerExporterEnabled, getActiveSourcePlugins } from '../../plugins';
import { useToast } from '../../context/ToastContext';

interface DetailViewProps {
  instance: Instance;
  onBack: () => void;
  onUpdateInstance: (updated: Instance) => void;
  onDeleteInstance: (id: string) => void;
}

export function DetailView({
  instance,
  onBack,
  onUpdateInstance,
  onDeleteInstance,
}: DetailViewProps) {
  const [activeTab, setActiveTab] = useState('overview');
  const [serverPluginOn, setServerPluginOn] = useState(() => isServerExporterEnabled());
  const [exportingClient, setExportingClient] = useState(false);
  const [exportingServer, setExportingServer] = useState(false);
  const { addToast } = useToast();

  useEffect(() => {
    const sync = () => setServerPluginOn(isServerExporterEnabled());
    sync();
    window.addEventListener('packweaver_plugins_changed', sync);
    return () => window.removeEventListener('packweaver_plugins_changed', sync);
  }, []);

  const visibleTab = !serverPluginOn && activeTab === 'server' ? 'overview' : activeTab;

  const runExport = useCallback(
    async (format: 'zip' | 'server') => {
      const isServer = format === 'server';
      if (isServer ? exportingServer : exportingClient) return;
      if (isServer) setExportingServer(true);
      else setExportingClient(true);
      try {
        const path = await invoke<string>('export_instance', {
          instanceId: instance.id,
          format,
        });
        const exportedAt = new Date().toISOString();
        onUpdateInstance({ ...instance, lastExported: exportedAt });
        try {
          await invoke('update_instance_details', {
            id: instance.id,
            lastExported: exportedAt,
          });
        } catch {
          /* best-effort persist */
        }
        addToast(`Saved ${path}`, 'success');
      } catch (e) {
        const msg = String(e);
        if (!msg.toLowerCase().includes('cancelled')) addToast(msg, 'error');
      } finally {
        if (isServer) setExportingServer(false);
        else setExportingClient(false);
      }
    },
    [addToast, exportingClient, exportingServer, instance, onUpdateInstance]
  );

  const handleExportClient = useCallback(() => {
    void runExport('zip');
  }, [runExport]);

  const handleExportServer = useCallback(() => {
    void runExport('server');
  }, [runExport]);

  const handleUpdate = useCallback(
    async (updates: Partial<Instance>) => {
      const nextInstance = { ...instance, ...updates };
      if (updates.customMods) {
        nextInstance.totalModCount =
          nextInstance.basePackMods.length + nextInstance.customMods.filter(m => m.enabled).length;
      }

      // If core details changed, persist to backend
      if (
        'name' in updates ||
        'description' in updates ||
        'bannerUrl' in updates ||
        'exportSettings' in updates ||
        'lastExported' in updates
      ) {
        try {
          await invoke('update_instance_details', {
            id: instance.id,
            name: updates.name,
            description: updates.description,
            bannerUrl: updates.bannerUrl,
            exportSettings: updates.exportSettings
              ? JSON.stringify(updates.exportSettings)
              : undefined,
            lastExported: updates.lastExported,
          });
        } catch (e) {
          console.error('Failed to update instance details in DB', e);
        }
      }

      onUpdateInstance(nextInstance);
    },
    [instance, onUpdateInstance]
  );

  useEffect(() => {
    if (instance.source === 'modrinth' && (!instance.description || !instance.bannerUrl)) {
      const sourcePlugins = getActiveSourcePlugins();
      const modrinthPlugin = sourcePlugins.find(p => p.id === 'modrinth');
      if (modrinthPlugin?.getProjectDetails) {
        modrinthPlugin
          .getProjectDetails(instance.basePack)
          .then(details => {
            if (details) {
              const updates: Partial<Instance> = {};
              if (!instance.description) updates.description = details.description;
              if (!instance.bannerUrl && details.gallery?.length > 0) {
                const featured = details.gallery.find(g => g.featured) || details.gallery[0];
                updates.bannerUrl = featured.url;
              }
              if (Object.keys(updates).length > 0) {
                handleUpdate(updates);
              }
            }
          })
          .catch(console.error);
      }
    }
  }, [instance.source, instance.basePack, instance.description, instance.bannerUrl, handleUpdate]);

  return (
    <div
      className="animate-slide-in h-full flex flex-col"
      style={{ background: 'var(--bg-canvas)' }}
    >
      <DetailHeader
        instance={instance}
        onBack={onBack}
        onExportClient={handleExportClient}
        onExportServer={serverPluginOn ? handleExportServer : undefined}
        serverExporterEnabled={serverPluginOn}
        exportingClient={exportingClient}
        exportingServer={exportingServer}
        onUpdate={handleUpdate}
        onDelete={onDeleteInstance}
      />

      <div className="px-8 content-pad mt-6 loom-tabs" role="tablist" aria-label="Pack sections">
        {[
          { key: 'overview', label: 'Overview' },
          { key: 'client', label: 'Client Mods' },
          { key: 'custom', label: 'Custom Mods' },
          ...(serverPluginOn ? [{ key: 'server', label: 'Server Mods' }] : []),
        ].map(tab => {
          const isActive = visibleTab === tab.key;
          return (
            <button
              key={tab.key}
              id={`pack-tab-${tab.key}`}
              role="tab"
              aria-selected={isActive}
              aria-controls={`pack-panel-${tab.key}`}
              className="loom-tab"
              onClick={() => setActiveTab(tab.key)}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      <div className="flex-1 overflow-y-auto">
        <div
          id={`pack-panel-${visibleTab}`}
          role="tabpanel"
          aria-labelledby={`pack-tab-${visibleTab}`}
          className="px-8 content-pad py-5 w-full"
        >
          {visibleTab === 'overview' && (
            <OverviewTab
              instance={instance}
              onUpdate={handleUpdate}
              serverExporterEnabled={serverPluginOn}
            />
          )}
          {visibleTab === 'client' && <ClientModsTab instance={instance} onUpdate={handleUpdate} />}
          {visibleTab === 'custom' && <CustomModsTab instance={instance} onUpdate={handleUpdate} />}
          {visibleTab === 'server' && serverPluginOn && (
            <ServerModsTab instance={instance} onUpdate={handleUpdate} />
          )}
        </div>
      </div>
    </div>
  );
}
