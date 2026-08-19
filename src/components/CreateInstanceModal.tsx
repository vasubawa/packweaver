import { useState, useMemo, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Icon } from './Icon';
import { SOURCE_COLORS } from '../constants';
import { ModSource, LoaderType } from '../types';
import { PLUGINS } from '../plugins';
import { open } from '@tauri-apps/plugin-dialog';

const MODRINTH_CATALOG = [
  { name: 'Better Minecraft', version: 'v5.4.0', mc: '1.20.1', loader: 'Fabric', mods: 156 },
  { name: 'All the Mods 9', version: 'v3.1.0', mc: '1.20.1', loader: 'NeoForge', mods: 432 },
  { name: 'Prominence II RPG', version: 'v4.2.0', mc: '1.20.1', loader: 'Forge', mods: 278 },
  { name: 'Fabulously Optimized', version: 'v6.1.0', mc: '1.20.1', loader: 'Fabric', mods: 42 },
];
const CURSEFORGE_CATALOG = [
  { name: 'Create: Above & Beyond', version: 'v1.8.2', mc: '1.18.2', loader: 'Forge', mods: 217 },
  { name: 'Cobblemon', version: 'v2.0.1', mc: '1.20.1', loader: 'Fabric', mods: 94 },
  { name: 'RLCraft', version: 'v2.9.3', mc: '1.12.2', loader: 'Forge', mods: 254 },
];
const MC_VERSIONS = ['1.21.4', '1.21.1', '1.20.4', '1.20.1', '1.18.2', '1.16.5', '1.12.2'];
const LOADERS: LoaderType[] = ['Fabric', 'Forge', 'NeoForge', 'Quilt'];

export interface CreateModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreated: () => void;
}

export function CreateInstanceModal({ isOpen, onClose, onCreated }: CreateModalProps) {
  const [source, setSource] = useState<ModSource>('local');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedPack, setSelectedPack] = useState<any>(null);
  const [name, setName] = useState('');
  const [version, setVersion] = useState('1.0.0');
  const [mcVersion, setMcVersion] = useState('1.20.1');
  const [loader, setLoader] = useState<LoaderType>('Fabric');
  const [showResults, setShowResults] = useState(false);
  const [localFile, setLocalFile] = useState<any>(null);

  const [liveCatalog, setLiveCatalog] = useState<any[]>([]);

  useEffect(() => {
    const plugin = PLUGINS[source];
    if (plugin && plugin.canSearch && plugin.search && searchQuery.trim().length > 2) {
      const timeout = setTimeout(async () => {
        try {
          const results = await plugin.search!(searchQuery, 20);
          setLiveCatalog(
            results.map((r: any) => ({
              id: r.id, // e.g. modrinth slug
              name: r.name,
              version: 'latest',
              mc: '1.20.1',
              loader: 'Fabric',
              mods: '?',
            }))
          );
        } catch (e) {
          console.error(e);
        }
      }, 500);
      return () => clearTimeout(timeout);
    } else {
      const timeout = setTimeout(() => setLiveCatalog([]), 0);
      return () => clearTimeout(timeout);
    }
  }, [searchQuery, source]);

  const sc = SOURCE_COLORS[source] || SOURCE_COLORS.local;
  const filteredCatalog = useMemo(() => {
    if (source === 'modrinth') return liveCatalog.length > 0 ? liveCatalog : MODRINTH_CATALOG;
    const catalog = source === 'curseforge' ? CURSEFORGE_CATALOG : [];
    if (!searchQuery) return catalog;
    const q = searchQuery.toLowerCase();
    return catalog.filter(p => p.name.toLowerCase().includes(q));
  }, [searchQuery, source, liveCatalog]);

  if (!isOpen) return null;

  const handleSourceChange = (src: ModSource) => {
    setSource(src);
    setSearchQuery('');
    setSelectedPack(null);
    setName('');
    setVersion('1.0.0');
    setLocalFile(null);
    setShowResults(false);
  };

  const handleSelectPack = (pack: any) => {
    setSelectedPack(pack);
    setName(pack.name);
    setMcVersion(pack.mc);
    setLoader(pack.loader);
    setVersion(pack.version);
    setSearchQuery('');
    setShowResults(false);
  };

  const handleLocalUpload = async () => {
    try {
      const file = await open({
        multiple: false,
        directory: false,
        filters: [
          {
            name: 'Modpacks',
            extensions: ['zip', 'mrpack'],
          },
        ],
      });
      if (file && typeof file === 'string') {
        const fileName = file.split('\\').pop()?.split('/').pop() || 'Unknown';
        setLocalFile({ path: file, name: fileName, size: 'Unknown size' });
        setName(fileName.replace(/\.(zip|mrpack)$/i, ''));
      }
    } catch (e) {
      console.error('File dialog failed', e);
    }
  };

  const handleCreate = async () => {
    try {
      const basePackId =
        source === 'local'
          ? localFile?.path || 'custom'
          : selectedPack?.id || selectedPack?.name || 'custom';
      await invoke('create_instance', {
        name,
        basePackId,
        basePackVersionId: version,
        mcVersion,
        loader,
        source,
      });
      onCreated();
      onClose();
    } catch (e) {
      console.error('Failed to create instance', e);
    }
  };

  const sourceStyles: Record<string, string> = {
    local: 'var(--local-soft)',
    modrinth: 'var(--modrinth-soft)',
    curseforge: 'var(--curseforge-soft)',
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal-content"
        onClick={e => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <div
          className="flex items-center justify-between px-6 py-4"
          style={{ borderBottom: '1px solid var(--border)' }}
        >
          <div>
            <h3 className="text-[15px] font-semibold" style={{ color: 'var(--text-primary)' }}>
              Create New Pack
            </h3>
            <p className="text-[11.5px] mt-0.5" style={{ color: 'var(--text-muted)' }}>
              Select a source and base pack to get started
            </p>
          </div>
          <button className="btn-ghost" onClick={onClose}>
            <Icon name="x" size={16} />
          </button>
        </div>

        <div className="modal-body">
          <div className="modal-body-inner scrollbar-thin">
            <div className="mb-5">
              <label className="form-label mb-2">Source</label>
              <div className="seg-control">
                {[
                  { id: 'local', label: 'Local Upload', dot: '#64748b' },
                  { id: 'modrinth', label: 'Modrinth', dot: '#1bd96a' },
                  { id: 'curseforge', label: 'CurseForge', dot: '#f16436' },
                ].map(s => (
                  <button
                    key={s.id}
                    className={`seg-btn ${source === s.id ? 'seg-active' : ''}`}
                    onClick={() => handleSourceChange(s.id as ModSource)}
                    style={source === s.id ? { background: sourceStyles[s.id] } : {}}
                  >
                    <span className="seg-dot" style={{ background: s.dot }} />
                    {s.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="mb-5">
              <label className="form-label mb-2">Base Pack</label>
              {source === 'local' ? (
                <div onClick={() => handleLocalUpload()}>
                  {localFile ? (
                    <div className="flex items-center justify-center gap-3">
                      <Icon name="fileArchive" size={20} style={{ color: sc.accent }} />
                      <div className="text-left">
                        <div
                          className="text-[13px] font-medium"
                          style={{ color: 'var(--text-primary)' }}
                        >
                          {localFile.name}
                        </div>
                        <div className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                          {localFile.size} &middot; Click to change
                        </div>
                      </div>
                      <button
                        className="btn-ghost ml-2"
                        onClick={e => {
                          e.stopPropagation();
                          setLocalFile(null);
                          setName('');
                        }}
                      >
                        <Icon name="x" size={14} />
                      </button>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center gap-2">
                      <Icon name="upload" size={22} style={{ color: 'var(--text-muted)' }} />
                      <div>
                        <div
                          className="text-[13px] font-medium"
                          style={{ color: 'var(--text-primary)' }}
                        >
                          Drop a .zip file or click to browse
                        </div>
                        <div className="text-[11px] mt-0.5" style={{ color: 'var(--text-muted)' }}>
                          Supports CurseForge, Modrinth, or raw modpack zips
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="relative">
                  <div
                    className="absolute left-3 top-1/2 -translate-y-1/2"
                    style={{ color: 'var(--text-muted)' }}
                  >
                    <Icon name="search" size={14} />
                  </div>
                  <input
                    className="form-input"
                    style={{ paddingLeft: 32 }}
                    placeholder={`Search ${sc.label} packs...`}
                    value={selectedPack ? selectedPack.name : searchQuery}
                    onChange={e => {
                      setSearchQuery(e.target.value);
                      setSelectedPack(null);
                      setShowResults(true);
                    }}
                    onFocus={() => {
                      if (!selectedPack) setShowResults(true);
                    }}
                    onBlur={() => setTimeout(() => setShowResults(false), 200)}
                  />
                  {showResults && filteredCatalog.length > 0 && (
                    <div className="search-results">
                      {filteredCatalog.map((pack, i) => (
                        <div
                          key={i}
                          className="search-result-item"
                          onMouseDown={() => handleSelectPack(pack)}
                        >
                          <div>
                            <div className="font-medium" style={{ color: 'var(--text-primary)' }}>
                              {pack.name}
                            </div>
                            <div className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                              {pack.mc} &middot; {pack.loader} &middot; {pack.mods} mods
                            </div>
                          </div>
                          <span className="badge" style={{ fontSize: 10 }}>
                            {pack.version}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                  {selectedPack && (
                    <div
                      className="flex items-center justify-between mt-2 px-3 py-2 rounded-md"
                      style={{ background: sc.soft, border: `1px solid ${sc.accent}20` }}
                    >
                      <div className="flex items-center gap-2">
                        <span className="seg-dot" style={{ background: sc.dot }} />
                        <span className="text-[12px] font-medium" style={{ color: sc.accent }}>
                          {selectedPack.name} {selectedPack.version}
                        </span>
                      </div>
                      <button
                        className="btn-ghost"
                        onClick={() => {
                          setSelectedPack(null);
                          setSearchQuery('');
                          setName('');
                        }}
                        style={{ padding: 2 }}
                      >
                        <Icon name="x" size={12} />
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="divider mb-5" />
            <label
              className="form-label mb-3"
              style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em' }}
            >
              Configuration
            </label>
            <div className="grid grid-cols-2 gap-3 mb-3">
              <div>
                <label className="form-label">Pack Name</label>
                <input
                  className="form-input"
                  placeholder="Autofills from base pack..."
                  value={name}
                  onChange={e => setName(e.target.value)}
                />
              </div>
              <div>
                <label className="form-label">Pack Version</label>
                <input
                  className="form-input"
                  value={version}
                  onChange={e => setVersion(e.target.value)}
                  style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 12.5 }}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="form-label">
                  Minecraft Version
                  {selectedPack && (
                    <span
                      className="font-normal ml-1"
                      style={{ color: 'var(--text-muted)', fontSize: 10 }}
                    >
                      (inherited)
                    </span>
                  )}
                </label>
                <select
                  className="form-select"
                  value={mcVersion}
                  onChange={e => setMcVersion(e.target.value)}
                >
                  {MC_VERSIONS.map(v => (
                    <option key={v} value={v}>
                      {v}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="form-label">
                  Mod Loader
                  {selectedPack && (
                    <span
                      className="font-normal ml-1"
                      style={{ color: 'var(--text-muted)', fontSize: 10 }}
                    >
                      (inherited)
                    </span>
                  )}
                </label>
                <select
                  className="form-select"
                  value={loader}
                  onChange={e => setLoader(e.target.value as LoaderType)}
                >
                  {LOADERS.map(l => (
                    <option key={l} value={l}>
                      {l}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>
        </div>

        <div
          className="flex items-center justify-end gap-2 px-6 py-4"
          style={{ borderTop: '1px solid var(--border)' }}
        >
          <button
            className="btn-ghost"
            onClick={onClose}
            style={{ padding: '8px 14px', fontSize: 13 }}
          >
            Cancel
          </button>
          <button
            className="btn-accent"
            onClick={handleCreate}
            disabled={!name.trim()}
            style={{ opacity: name.trim() ? 1 : 0.5, background: sc.accent }}
          >
            <Icon name="package" size={14} />
            Create Pack
          </button>
        </div>
      </div>
    </div>
  );
}
