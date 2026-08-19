import { useState } from 'react';
import { Instance } from '../../types';
import { DetailHeader } from '../detail/DetailHeader';
import { OverviewTab } from '../detail/OverviewTab';
import { ClientModsTab } from '../detail/ClientModsTab';
import { ServerFilesTab } from '../detail/ServerFilesTab';

interface DetailViewProps {
  instance: Instance;
  onBack: () => void;
  onExport: (instance: Instance) => void;
  onUpdateInstance: (updated: Instance) => void;
}

export function DetailView({ instance, onBack, onExport, onUpdateInstance }: DetailViewProps) {
  const [activeTab, setActiveTab] = useState('overview');

  const handleUpdate = (updates: Partial<Instance>) => {
    onUpdateInstance({ ...instance, ...updates });
  };

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
      />

      <div
        className="px-6 mt-6 flex gap-6 flex-shrink-0"
        style={{ borderBottom: '1px solid var(--border)' }}
      >
        {[
          { key: 'overview', label: 'Overview' },
          { key: 'client', label: 'Client Mods' },
          { key: 'server', label: 'Server Files' },
        ].map(tab => (
          <button
            key={tab.key}
            className={`pb-2.5 text-[13px] font-medium transition-colors ${activeTab === tab.key ? 'tab-active' : 'tab-inactive'}`}
            onClick={() => setActiveTab(tab.key)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto scrollbar-thin px-6 py-5">
        {activeTab === 'overview' && <OverviewTab instance={instance} onUpdate={handleUpdate} />}
        {activeTab === 'client' && <ClientModsTab instance={instance} onUpdate={handleUpdate} />}
        {activeTab === 'server' && <ServerFilesTab instance={instance} onUpdate={handleUpdate} />}
      </div>
    </div>
  );
}
