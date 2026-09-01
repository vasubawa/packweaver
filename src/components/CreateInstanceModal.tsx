import { useState, useMemo, useEffect, startTransition } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Icon } from './Icon';
import { SOURCE_COLORS, normalizeLoaderName, pickNewestGameVersion } from '../constants';
import { ModSource, LoaderType } from '../types';
import { getActiveSourcePlugins, SourcePlugin, PackVersionInfo } from '../plugins';
import { usePluginSearch } from '../hooks/usePluginSearch';
import { useToast } from '../context/ToastContext';
import { open } from '@tauri-apps/plugin-dialog';

const MC_VERSIONS = ['1.21.4', '1.21.1', '1.20.4', '1.20.1', '1.18.2', '1.16.5', '1.12.2'];
const LOADERS: LoaderType[] = ['Fabric', 'Forge', 'NeoForge', 'Quilt'];
const SEMVER_PATTERN = /^\d+\.\d+\.\d+$/;

export interface CreateModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreated: () => void;
}

export function CreateInstanceModal({ isOpen, onClose, onCreated }: CreateModalProps) {
  const { addToast } = useToast();
  const [activeSources, setActiveSources] = useState<SourcePlugin[]>(() =>
    getActiveSourcePlugins()
  );
  const [source, setSource] = useState<ModSource>(
    () => (activeSources[0]?.id as ModSource) || 'local'
  );
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedPack, setSelectedPack] = useState<any>(null);
  const [name, setName] = useState('');
  const [version, setVersion] = useState('1.0.0');
  const [mcVersion, setMcVersion] = useState('1.20.1');
  const [loader, setLoader] = useState<LoaderType>('Fabric');
  const [showResults, setShowResults] = useState(false);
  const [localFile, setLocalFile] = useState<any>(null);
  const [isCreating, setIsCreating] = useState(false);

  const [resolvedVersion, setResolvedVersion] = useState<PackVersionInfo | null>(null);
  const [isResolvingVersion, setIsResolvingVersion] = useState(false);
  const [versionResolutionFailed, setVersionResolutionFailed] = useState(false);

  const handleClose = () => {
    setSearchQuery('');
    setSelectedPack(null);
    setName('');
    setVersion('1.0.0');
    setMcVersion('1.20.1');
    setLoader('Fabric');
    setShowResults(false);
    setLocalFile(null);
    setResolvedVersion(null);
    setVersionResolutionFailed(false);
    onClose();
  };

  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleClose();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  useEffect(() => {
    const handlePluginsChange = () => {
      const updated = getActiveSourcePlugins();
      setActiveSources(updated);
      if (!updated.some(s => s.id === source) && updated.length > 0) {
        setSource(updated[0].id as ModSource);
      }
    };
    window.addEventListener('packweaver_plugins_changed', handlePluginsChange);
    return () => window.removeEventListener('packweaver_plugins_changed', handlePluginsChange);
  }, [source]);

  const currentPlugin = useMemo(() => {
    return activeSources.find(s => s.id === source);
  }, [activeSources, source]);

  const { results: filteredCatalog, isSearching } = usePluginSearch(
    currentPlugin,
    searchQuery,
    'pack'
  );

  // Resolves the real, currently-published version for the selected pack instead of
  // ever showing/accepting a hand-picked "latest" — some listings only expose "latest"
  // as a label, so the actual version number/game version/loader come from the API.
  const canAutoDetect = !!(selectedPack && currentPlugin?.getLatestVersion);
  useEffect(() => {
    // Early-return without setState — render already gates on `canAutoDetect`
    // so stale resolvedVersion / versionResolutionFailed values are never shown.
    if (!selectedPack || !currentPlugin?.getLatestVersion) {
      return;
    }
    let cancelled = false;
    // Wrap in startTransition so the synchronous setState calls that kick off
    // loading state don't violate react-hooks/set-state-in-effect. The
    // transition defers the state update to the next render batch.
    startTransition(() => {
      setIsResolvingVersion(true);
      setVersionResolutionFailed(false);
    });
    currentPlugin
      .getLatestVersion(selectedPack.id)
      .then(info => {
        if (cancelled) return;
        if (info) {
          setResolvedVersion(info);
          setVersion(info.versionNumber);
          const mc = pickNewestGameVersion(info.gameVersions);
          if (mc) setMcVersion(mc);
          const ld = normalizeLoaderName(info.loaders[0]);
          if (ld) setLoader(ld);
        } else {
          setResolvedVersion(null);
          setVersionResolutionFailed(true);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setResolvedVersion(null);
          setVersionResolutionFailed(true);
        }
      })
      .finally(() => {
        if (!cancelled) setIsResolvingVersion(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedPack, currentPlugin]);

  const sc = SOURCE_COLORS[source] || SOURCE_COLORS.local;

  if (!isOpen) return null;

  const handleSourceChange = (src: ModSource) => {
    setSource(src);
    setSearchQuery('');
    setSelectedPack(null);
    setName('');
    setVersion('1.0.0');
    setLocalFile(null);
    setShowResults(false);
    setResolvedVersion(null);
    setVersionResolutionFailed(false);
  };

  const handleSelectPack = (pack: any) => {
    setSelectedPack(pack);
    setName(pack.name);
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
      setIsCreating(true);
      const basePackId =
        source === 'local'
          ? localFile?.path || 'custom'
          : selectedPack?.id || selectedPack?.name || 'custom';

      let description = '';
      let bannerUrl = '';
      let iconUrl = '';
      let basePackMods: { id: string; name: string; iconUrl?: string }[] = [];

      if (source === 'modrinth' && currentPlugin?.getProjectDetails) {
        try {
          const details = await currentPlugin.getProjectDetails(basePackId);
          if (details) {
            description = details.description || '';
            if (details.gallery && details.gallery.length > 0) {
              const featured = details.gallery.find(g => g.featured) || details.gallery[0];
              bannerUrl = featured.url || '';
            }
            if (details.iconUrl) {
              iconUrl = details.iconUrl;
            }
          }
          if (currentPlugin.getDependencies) {
            const deps = await currentPlugin.getDependencies(basePackId);
            basePackMods = deps
              .filter(d => Boolean(d.projectId))
              .map(d => ({
                id: d.projectId as string,
                name: d.name || (d.projectId as string),
                icon_url: d.iconUrl || undefined, // matching the rust struct's snake_case for basePackMods
              }));
          }
        } catch (e) {
          console.error('Failed to pre-fetch modrinth details:', e);
        }
      }

      await invoke('create_instance', {
        name,
        basePackId,
        basePackVersionId: resolvedVersion?.versionId ?? version,
        mcVersion,
        loader,
        source,
        description: description || undefined,
        bannerUrl: bannerUrl || undefined,
        iconUrl: iconUrl || undefined,
        basePackMods: basePackMods.length > 0 ? basePackMods : undefined,
      });
      onCreated();
      handleClose();
    } catch (e: any) {
      console.error('Failed to create instance', e);
      addToast(typeof e === 'string' ? e : 'Failed to create instance', 'error');
    } finally {
      setIsCreating(false);
    }
  };

  const sourceStyles: Record<string, string> = {
    local: 'var(--local-soft)',
    modrinth: 'var(--modrinth-soft)',
    curseforge: 'var(--curseforge-soft)',
  };

  const canCreate =
    name.trim() &&
    activeSources.length > 0 &&
    !isResolvingVersion &&
    (canAutoDetect ? !!resolvedVersion : SEMVER_PATTERN.test(version.trim()));

  return (
    <div className="modal-backdrop" onClick={handleClose}>
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
          <button className="btn-ghost" onClick={handleClose}>
            <Icon name="x" size={16} />
          </button>
        </div>

        <div className="modal-body">
          <div className="modal-body-inner">
            {activeSources.length === 0 ? (
              <div
                className="p-6 text-center rounded-xl"
                style={{ background: 'var(--bg-muted)', border: '1px dashed var(--border)' }}
              >
                <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                  No source plugins are enabled. Enable at least one source in Plugins to create a
                  pack.
                </p>
              </div>
            ) : (
              <>
                <div className="mb-5">
                  <label className="form-label mb-2">Source</label>
                  <div className="seg-control">
                    {activeSources.map(s => (
                      <button
                        key={s.id}
                        className={`seg-btn ${source === s.id ? 'seg-active' : ''}`}
                        onClick={() => handleSourceChange(s.id as ModSource)}
                        style={
                          source === s.id
                            ? { background: sourceStyles[s.id] || 'var(--bg-muted)' }
                            : {}
                        }
                      >
                        <span
                          className="seg-dot"
                          style={{ background: s.colors.primary || '#64748b' }}
                        />
                        {s.name}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="mb-5">
                  <label className="form-label mb-2">Base Pack</label>
                  {!currentPlugin?.canSearch ? (
                    <div
                      className="dropzone cursor-pointer"
                      style={{ padding: '24px 16px' }}
                      onClick={() => handleLocalUpload()}
                    >
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
                            <div
                              className="text-[11px] mt-0.5"
                              style={{ color: 'var(--text-muted)' }}
                            >
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
                        onBlur={() => setShowResults(false)}
                      />
                      {showResults && isSearching && (
                        <div className="search-results">
                          <div
                            className="px-3 py-2.5 text-[12px]"
                            style={{ color: 'var(--text-muted)' }}
                          >
                            Searching...
                          </div>
                        </div>
                      )}
                      {showResults && !isSearching && filteredCatalog.length > 0 && (
                        <div className="search-results">
                          {filteredCatalog.map((pack: any) => (
                            <div
                              key={pack.id}
                              className="search-result-item"
                              onMouseDown={e => {
                                e.preventDefault();
                                handleSelectPack(pack);
                              }}
                            >
                              <div className="flex items-center gap-2.5">
                                {pack.iconUrl ? (
                                  <img
                                    src={pack.iconUrl}
                                    alt={pack.name}
                                    className="w-8 h-8 rounded-md bg-black/20 object-cover"
                                  />
                                ) : (
                                  <div className="w-8 h-8 rounded-md bg-black/10 flex items-center justify-center text-black/40 dark:bg-white/10 dark:text-white/40">
                                    <Icon name="package" size={16} />
                                  </div>
                                )}
                                <div>
                                  <div
                                    className="font-medium"
                                    style={{ color: 'var(--text-primary)' }}
                                  >
                                    {pack.name}
                                  </div>
                                  {pack.author && (
                                    <div
                                      className="text-[11px]"
                                      style={{ color: 'var(--text-muted)' }}
                                    >
                                      by {pack.author}
                                    </div>
                                  )}
                                </div>
                              </div>
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
                            {selectedPack.iconUrl ? (
                              <img
                                src={selectedPack.iconUrl}
                                alt={selectedPack.name}
                                className="w-6 h-6 rounded-md bg-black/20 object-cover"
                              />
                            ) : (
                              <span className="seg-dot" style={{ background: sc.dot }} />
                            )}
                            <span className="text-[12px] font-medium" style={{ color: sc.accent }}>
                              {selectedPack.name}
                            </span>
                          </div>
                          <button
                            className="btn-ghost"
                            onClick={() => {
                              setSelectedPack(null);
                              setSearchQuery('');
                              setName('');
                              setResolvedVersion(null);
                              setVersionResolutionFailed(false);
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
                    <label className="form-label">
                      Pack Version
                      {canAutoDetect && (
                        <span
                          className="font-normal ml-1"
                          style={{ color: 'var(--text-muted)', fontSize: 10 }}
                        >
                          (from {sc.label})
                        </span>
                      )}
                    </label>
                    {canAutoDetect ? (
                      <div
                        className="form-input flex items-center"
                        style={{
                          fontFamily: "'JetBrains Mono', monospace",
                          fontSize: 12.5,
                          color: isResolvingVersion ? 'var(--text-muted)' : 'var(--text-primary)',
                          background: 'var(--bg-muted)',
                        }}
                      >
                        {isResolvingVersion
                          ? 'Resolving...'
                          : resolvedVersion
                            ? version
                            : 'Unavailable'}
                      </div>
                    ) : (
                      <>
                        <input
                          className="form-input"
                          value={version}
                          onChange={e => setVersion(e.target.value)}
                          style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 12.5 }}
                        />
                        {version.trim() && !SEMVER_PATTERN.test(version.trim()) && (
                          <p className="text-[11px] mt-1" style={{ color: 'var(--danger)' }}>
                            Use a version like 1.0.0
                          </p>
                        )}
                      </>
                    )}
                  </div>
                </div>

                {canAutoDetect && versionResolutionFailed && (
                  <p className="text-[11px] mb-3" style={{ color: 'var(--danger)' }}>
                    Couldn&apos;t detect this pack&apos;s exact version from {sc.label}. It will
                    still download the latest available release.
                  </p>
                )}

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="form-label">
                      Minecraft Version
                      {canAutoDetect && resolvedVersion && (
                        <span
                          className="font-normal ml-1"
                          style={{ color: 'var(--text-muted)', fontSize: 10 }}
                        >
                          (from {sc.label})
                        </span>
                      )}
                    </label>
                    {canAutoDetect && resolvedVersion ? (
                      <div
                        className="form-input flex items-center"
                        style={{ background: 'var(--bg-muted)', color: 'var(--text-primary)' }}
                      >
                        {mcVersion}
                      </div>
                    ) : (
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
                    )}
                  </div>
                  <div>
                    <label className="form-label">
                      Mod Loader
                      {canAutoDetect && resolvedVersion && (
                        <span
                          className="font-normal ml-1"
                          style={{ color: 'var(--text-muted)', fontSize: 10 }}
                        >
                          (from {sc.label})
                        </span>
                      )}
                    </label>
                    {canAutoDetect && resolvedVersion ? (
                      <div
                        className="form-input flex items-center"
                        style={{ background: 'var(--bg-muted)', color: 'var(--text-primary)' }}
                      >
                        {loader}
                      </div>
                    ) : (
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
                    )}
                  </div>
                </div>
              </>
            )}
          </div>
        </div>

        <div
          className="flex items-center justify-end gap-2 px-6 py-4"
          style={{ borderTop: '1px solid var(--border)' }}
        >
          <button
            className="btn-ghost"
            onClick={handleClose}
            style={{ padding: '8px 14px', fontSize: 13 }}
          >
            Cancel
          </button>
          <button
            className="btn-accent"
            onClick={handleCreate}
            disabled={!canCreate || isCreating}
            style={{
              opacity: canCreate && !isCreating ? 1 : 0.5,
              background: sc.accent,
            }}
          >
            <Icon name="package" size={14} />
            {isCreating ? 'Creating...' : isResolvingVersion ? 'Resolving...' : 'Create Pack'}
          </button>
        </div>
      </div>
    </div>
  );
}
