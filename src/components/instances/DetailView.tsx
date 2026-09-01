import { useState, useEffect, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Instance } from '../../types';
import { DetailHeader } from '../detail/DetailHeader';
import { OverviewTab } from '../detail/OverviewTab';
import { ClientModsTab } from '../detail/ClientModsTab';
import { ServerFilesTab } from '../detail/ServerFilesTab';
import { getActiveSourcePlugins } from '../../plugins';

import { SOURCE_COLORS } from '../../constants';

interface DetailViewProps {
  instance: Instance;
  onBack: () => void;
  onExport: (instance: Instance) => void;
  onUpdateInstance: (updated: Instance) => void;
  onDeleteInstance: (id: string) => void;
}

export function DetailView({
  instance,
  onBack,
  onExport,
  onUpdateInstance,
  onDeleteInstance,
}: DetailViewProps) {
  const [activeTab, setActiveTab] = useState('overview');
  const sc = SOURCE_COLORS[instance.source] || SOURCE_COLORS.local;

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
        'exportSettings' in updates
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
        onExport={() => onExport(instance)}
        onUpdate={handleUpdate}
        onDelete={onDeleteInstance}
      />

      <div
        className="px-6 xl:px-10 mt-6 flex gap-6 flex-shrink-0"
        style={{ borderBottom: '1px solid var(--border)' }}
      >
        {[
          { key: 'overview', label: 'Overview' },
          { key: 'client', label: 'Client Mods' },
          { key: 'server', label: 'Server Files' },
        ].map(tab => {
          const isActive = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              className="pb-2.5 text-[13px] font-medium transition-colors relative"
              style={{
                color: isActive ? 'var(--text-primary)' : 'var(--text-muted)',
                borderBottom: isActive ? `2px solid ${sc.accent}` : '2px solid transparent',
              }}
              onClick={() => setActiveTab(tab.key)}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="px-6 xl:px-10 py-5 max-w-[var(--content-max)] w-full">
          {activeTab === 'overview' && <OverviewTab instance={instance} onUpdate={handleUpdate} />}
          {activeTab === 'client' && <ClientModsTab instance={instance} onUpdate={handleUpdate} />}
          {activeTab === 'server' && <ServerFilesTab instance={instance} onUpdate={handleUpdate} />}
        </div>
      </div>
    </div>
  );
}
