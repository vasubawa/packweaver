import { useState, useEffect } from 'react';
import { Icon } from '../Icon';
import { getAllPlugins, savePluginSetting, AnyPlugin, PluginCategory } from '../../plugins';
import { useToast } from '../../context/ToastContext';

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
    const nextState = !plugin.enabled;
    savePluginSetting(plugin.id, { enabled: nextState });
    addToast(`${plugin.name} ${nextState ? 'enabled' : 'disabled'}`, 'info');
  };

  const handleSaveApiKey = (pluginId: string) => {
    savePluginSetting(pluginId, { apiKey: apiKeyInput, enabled: !!apiKeyInput.trim() });
    setEditingApiKeyId(null);
    setApiKeyInput('');
    addToast('API Key saved successfully', 'success');
  };

  const filtered = plugins.filter(
    p => selectedCategory === 'all' || p.category === selectedCategory
  );

  const sources = filtered.filter(p => p.category === 'source');
  const exporters = filtered.filter(p => p.category === 'exporter');

  return (
    <div className="p-6 max-w-4xl animate-slide-in">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h2
            className="text-xl font-semibold tracking-tight mb-1"
            style={{ color: 'var(--text-primary)', fontFamily: "'Newsreader', Georgia, serif" }}
          >
            Plugins & Integrations
          </h2>
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
            Manage platform sources, downloaders, and export packagers
          </p>
        </div>

        <div
          className="flex p-1 rounded-lg"
          style={{ background: 'var(--bg-muted)', border: '1px solid var(--border)' }}
        >
          {(
            [
              { id: 'all', label: 'All' },
              { id: 'source', label: 'Sources' },
              { id: 'exporter', label: 'Exporters' },
            ] as const
          ).map(tab => (
            <button
              key={tab.id}
              className={`px-3 py-1.5 text-[11px] font-medium rounded-md transition-all ${
                selectedCategory === tab.id
                  ? 'bg-[var(--bg-surface)] shadow-sm text-[var(--text-primary)]'
                  : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
              }`}
              onClick={() => setSelectedCategory(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {sources.length > 0 && (
        <div className="mb-8">
          <div className="flex items-center gap-2 mb-3">
            <Icon name="download" size={14} style={{ color: 'var(--accent)' }} />
            <h3
              className="text-xs font-semibold uppercase tracking-wider"
              style={{ color: 'var(--text-muted)' }}
            >
              Platform Sources & Downloaders
            </h3>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {sources.map(plugin => (
              <div
                key={plugin.id}
                className="rounded-xl p-4 flex flex-col justify-between transition-all"
                style={{
                  background: 'var(--bg-surface)',
                  border: `1px solid ${plugin.enabled ? 'var(--border)' : 'var(--border-subtle, var(--border))'}`,
                  opacity: plugin.enabled ? 1 : 0.75,
                }}
              >
                <div>
                  <div className="flex items-start justify-between gap-3 mb-2">
                    <div className="flex items-center gap-2.5">
                      <div
                        className="w-8 h-8 rounded-lg flex items-center justify-center text-base shrink-0"
                        style={{ background: 'var(--bg-muted)', border: '1px solid var(--border)' }}
                      >
                        {plugin.fallbackEmoji}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span
                            className="text-[13px] font-semibold"
                            style={{ color: 'var(--text-primary)' }}
                          >
                            {plugin.name}
                          </span>
                          <span
                            className="text-[10px] px-1.5 py-0.5 rounded font-mono"
                            style={{ background: 'var(--bg-muted)', color: 'var(--text-muted)' }}
                          >
                            v{plugin.version}
                          </span>
                        </div>
                        <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                          by {plugin.author}
                        </span>
                      </div>
                    </div>

                    {plugin.isCore ? (
                      <span
                        className="text-[10.5px] font-semibold px-2 py-0.5 rounded-full"
                        style={{
                          background: 'var(--accent-soft)',
                          color: 'var(--accent)',
                        }}
                      >
                        Core
                      </span>
                    ) : (
                      <button
                        role="switch"
                        aria-checked={plugin.enabled}
                        aria-label={`Toggle ${plugin.name}`}
                        className={`theme-toggle-track ${plugin.enabled ? 'on' : ''}`}
                        onClick={() => handleToggle(plugin)}
                      >
                        <div className="theme-toggle-knob" />
                      </button>
                    )}
                  </div>

                  <p
                    className="text-[12px] leading-relaxed mb-3"
                    style={{ color: 'var(--text-muted)' }}
                  >
                    {plugin.description}
                  </p>
                </div>

                <div
                  className="pt-2 flex items-center justify-between"
                  style={{ borderTop: '1px solid var(--border)' }}
                >
                  <span
                    className="text-[11px] font-medium"
                    style={{
                      color: plugin.enabled ? 'var(--accent)' : 'var(--text-muted)',
                    }}
                  >
                    {plugin.isCore ? '● Always Active' : plugin.enabled ? '● Active' : '○ Disabled'}
                  </span>

                  {plugin.requiresApiKey && (
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
                  )}
                </div>

                {editingApiKeyId === plugin.id && (
                  <div
                    className="mt-3 p-3 rounded-lg flex flex-col gap-2"
                    style={{ background: 'var(--bg-muted)', border: '1px solid var(--border)' }}
                  >
                    <label
                      className="text-[11px] font-medium"
                      style={{ color: 'var(--text-primary)' }}
                    >
                      Enter {plugin.name} API Key
                    </label>
                    <input
                      type="password"
                      className="form-input text-[12px] py-1 px-2"
                      placeholder="Paste API token..."
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
                        className="btn-primary text-[11px] px-3 py-1"
                        onClick={() => handleSaveApiKey(plugin.id)}
                      >
                        Save Key
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {exporters.length > 0 && (
        <div className="mb-8">
          <div className="flex items-center gap-2 mb-3">
            <Icon name="archive" size={14} style={{ color: 'var(--accent)' }} />
            <h3
              className="text-xs font-semibold uppercase tracking-wider"
              style={{ color: 'var(--text-muted)' }}
            >
              Export & Packaging Formats
            </h3>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {exporters.map(plugin => (
              <div
                key={plugin.id}
                className="rounded-xl p-4 flex flex-col justify-between transition-all"
                style={{
                  background: 'var(--bg-surface)',
                  border: `1px solid ${plugin.enabled ? 'var(--border)' : 'var(--border-subtle, var(--border))'}`,
                  opacity: plugin.enabled ? 1 : 0.75,
                }}
              >
                <div>
                  <div className="flex items-start justify-between gap-3 mb-2">
                    <div className="flex items-center gap-2.5">
                      <div
                        className="w-8 h-8 rounded-lg flex items-center justify-center text-base shrink-0"
                        style={{ background: 'var(--bg-muted)', border: '1px solid var(--border)' }}
                      >
                        {plugin.fallbackEmoji}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span
                            className="text-[13px] font-semibold"
                            style={{ color: 'var(--text-primary)' }}
                          >
                            {plugin.name}
                          </span>
                          <span
                            className="text-[10px] px-1.5 py-0.5 rounded font-mono"
                            style={{ background: 'var(--bg-muted)', color: 'var(--text-muted)' }}
                          >
                            v{plugin.version}
                          </span>
                        </div>
                        <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                          Target: {plugin.fileExtension}
                        </span>
                      </div>
                    </div>

                    {plugin.isCore ? (
                      <span
                        className="text-[10.5px] font-semibold px-2 py-0.5 rounded-full"
                        style={{
                          background: 'var(--accent-soft)',
                          color: 'var(--accent)',
                        }}
                      >
                        Core
                      </span>
                    ) : (
                      <button
                        role="switch"
                        aria-checked={plugin.enabled}
                        aria-label={`Toggle ${plugin.name}`}
                        className={`theme-toggle-track ${plugin.enabled ? 'on' : ''}`}
                        onClick={() => handleToggle(plugin)}
                      >
                        <div className="theme-toggle-knob" />
                      </button>
                    )}
                  </div>

                  <p
                    className="text-[12px] leading-relaxed mb-3"
                    style={{ color: 'var(--text-muted)' }}
                  >
                    {plugin.description}
                  </p>
                </div>

                <div
                  className="pt-2 flex items-center justify-between"
                  style={{ borderTop: '1px solid var(--border)' }}
                >
                  <span
                    className="text-[11px] font-medium"
                    style={{
                      color: plugin.enabled ? 'var(--accent)' : 'var(--text-muted)',
                    }}
                  >
                    {plugin.isCore
                      ? '● Always Active'
                      : plugin.enabled
                        ? '● Enabled'
                        : '○ Disabled'}
                  </span>
                  <span
                    className="text-[10.5px] font-mono px-2 py-0.5 rounded"
                    style={{ background: 'var(--bg-muted)', color: 'var(--text-muted)' }}
                  >
                    Format: {plugin.targetFormat}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
