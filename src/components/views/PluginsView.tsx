import { useState, useEffect } from 'react';
import { Icon } from '../Icon';
import {
  getAllPlugins,
  savePluginSetting,
  AnyPlugin,
  ExporterPlugin,
  PluginCategory,
} from '../../plugins';
import { useToast } from '../../context/ToastContext';
import { PluginCard } from './PluginCard';
import { SOURCE_COLORS } from '../../constants';
import { ModSource } from '../../types';

function stripeForPlugin(id: string): string {
  if (id === 'modrinth' || id === 'curseforge' || id === 'local') {
    return SOURCE_COLORS[id as ModSource].accent;
  }
  return 'var(--accent)';
}

export function PluginsView() {
  const [plugins, setPlugins] = useState<AnyPlugin[]>(() => getAllPlugins());
  const [selectedCategory, setSelectedCategory] = useState<PluginCategory | 'all'>('all');
  const [editingApiKeyId, setEditingApiKeyId] = useState<string | null>(null);
  const [apiKeyInput, setApiKeyInput] = useState('');
  const { addToast } = useToast();

  const reloadPlugins = () => {
    setPlugins(getAllPlugins());
  };

  useEffect(() => {
    window.addEventListener('packweaver_plugins_changed', reloadPlugins);
    return () => window.removeEventListener('packweaver_plugins_changed', reloadPlugins);
  }, []);

  const handleToggle = (plugin: AnyPlugin) => {
    if (plugin.isCore) {
      addToast(`${plugin.name} is a core feature and cannot be disabled.`, 'info');
      return;
    }
    if (plugin.comingSoon) {
      addToast(`${plugin.name} is not available yet.`, 'info');
      return;
    }
    const nextState = !plugin.enabled;
    savePluginSetting(plugin.id, { enabled: nextState });
    addToast(`${plugin.name} ${nextState ? 'enabled' : 'disabled'}`, 'info');
  };

  const handleSaveApiKey = (pluginId: string) => {
    const plugin = plugins.find(p => p.id === pluginId);
    savePluginSetting(pluginId, {
      apiKey: apiKeyInput,
      enabled: plugin?.comingSoon ? false : !!apiKeyInput.trim(),
    });
    setEditingApiKeyId(null);
    setApiKeyInput('');
    addToast('API Key saved successfully', 'success');
  };

  const filtered = plugins.filter(
    p => selectedCategory === 'all' || p.category === selectedCategory
  );

  /** Core first, then A–Z by name. Enabled and disabled both stay visible. */
  const sortPlugins = <T extends AnyPlugin>(list: T[]): T[] =>
    [...list].sort((a, b) => {
      const coreDiff = Number(!!b.isCore) - Number(!!a.isCore);
      if (coreDiff !== 0) return coreDiff;
      return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
    });

  const sources = sortPlugins(filtered.filter(p => p.category === 'source'));
  const exporters = sortPlugins(
    filtered.filter((p): p is ExporterPlugin => p.category === 'exporter')
  );

  return (
    <div className="p-8 content-pad max-w-[var(--content-max)] animate-slide-in">
      <div className="flex flex-row items-end justify-between gap-4 mb-8 flex-wrap">
        <div>
          <div className="page-kicker">Workshop</div>
          <h2 className="page-title">Plugins</h2>
          <p className="page-lede">Sources that pull packs, exporters that package them.</p>
        </div>

        <div className="loom-filter" role="group" aria-label="Plugin category">
          {(
            [
              { id: 'all', label: 'All' },
              { id: 'source', label: 'Sources' },
              { id: 'exporter', label: 'Exporters' },
            ] as const
          ).map(tab => (
            <button
              key={tab.id}
              aria-pressed={selectedCategory === tab.id}
              className="loom-filter-btn"
              onClick={() => setSelectedCategory(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {sources.length > 0 && (
        <div className="mb-10">
          <h3 className="section-label">Sources</h3>
          <div className="responsive-card-grid">
            {sources.map(plugin => (
              <PluginCard
                key={plugin.id}
                plugin={plugin}
                onToggle={handleToggle}
                subtitle={`by ${plugin.author}`}
                stripeColor={stripeForPlugin(plugin.id)}
                footerRight={
                  plugin.requiresApiKey && !plugin.comingSoon ? (
                    <button
                      className="btn-secondary text-[11px] px-2.5 py-1 flex items-center gap-1"
                      onClick={() => {
                        setEditingApiKeyId(plugin.id);
                        setApiKeyInput(plugin.apiKey || '');
                      }}
                    >
                      <Icon name="key" size={12} />
                      {plugin.apiKey ? 'Change API Key' : 'Set API Key'}
                    </button>
                  ) : undefined
                }
              >
                {editingApiKeyId === plugin.id && (
                  <div
                    className="mt-3 p-3 flex flex-col gap-2"
                    style={{
                      background: 'var(--bg-muted)',
                      border: '1px solid var(--border)',
                      borderRadius: 'var(--radius-sm)',
                    }}
                  >
                    <label
                      className="text-[11px] font-medium"
                      style={{ color: 'var(--text-primary)' }}
                    >
                      {plugin.name} API key
                    </label>
                    <input
                      type="password"
                      className="form-input text-[12px] py-1 px-2"
                      placeholder="Paste API token…"
                      value={apiKeyInput}
                      onChange={e => setApiKeyInput(e.target.value)}
                    />
                    <div className="flex justify-end gap-2 mt-1">
                      <button
                        className="btn-ghost text-[11px] px-2 py-1"
                        onClick={() => setEditingApiKeyId(null)}
                      >
                        Cancel
                      </button>
                      <button
                        className="btn-accent text-[11px] px-3 py-1"
                        onClick={() => handleSaveApiKey(plugin.id)}
                      >
                        Save key
                      </button>
                    </div>
                  </div>
                )}
              </PluginCard>
            ))}
          </div>
        </div>
      )}

      {exporters.length > 0 && (
        <div className="mb-8">
          <h3 className="section-label">Exporters</h3>
          <div className="responsive-card-grid">
            {exporters.map(plugin => (
              <PluginCard
                key={plugin.id}
                plugin={plugin}
                onToggle={handleToggle}
                subtitle={`Target: ${plugin.fileExtension}`}
                statusEnabledLabel="On"
                stripeColor="var(--accent)"
                footerRight={<span className="badge badge-mono">{plugin.targetFormat}</span>}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
