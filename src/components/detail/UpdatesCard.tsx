import { useState, useEffect, useRef } from 'react';
import { Instance } from '../../types';
import { Icon } from '../Icon';
import { ChangelogDisclosure } from './ChangelogDisclosure';
import { useToast } from '../../context/ToastContext';
import { isServerExporterEnabled } from '../../plugins';
import { checkPackUpdates, CustomUpdateInfo, UpdateCheckResult } from '../../lib/packUpdates';
import { applyBasePackUpdate, applyCustomModUpdates } from '../../lib/applyPackUpdates';
import {
  installedModIds,
  missingRequiredDependencies,
  conflictingMods,
} from '../../lib/modDependencies';

interface UpdatesCardProps {
  instance: Instance;
  onUpdate: (updates: Partial<Instance>) => void;
  onBaseUpdated?: () => void;
  /** When true (Server Pack Packager on), also rebuild/layer the server workspace. */
  serverExporterEnabled?: boolean;
}

export function UpdatesCard({
  instance,
  onUpdate,
  onBaseUpdated,
  serverExporterEnabled,
}: UpdatesCardProps) {
  const { addToast } = useToast();
  const serverOn = serverExporterEnabled ?? isServerExporterEnabled();
  const [checking, setChecking] = useState(false);
  const [applyingBase, setApplyingBase] = useState(false);
  const [applyingCustoms, setApplyingCustoms] = useState(false);
  const [result, setResult] = useState<UpdateCheckResult | null>(null);
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [prevId, setPrevId] = useState(instance.id);

  if (instance.id !== prevId) {
    setPrevId(instance.id);
    setResult(null);
    setSelected({});
    setChecking(false);
    setApplyingBase(false);
    setApplyingCustoms(false);
  }

  // Results that arrive after the user switched packs belong to the old pack.
  const activeIdRef = useRef(instance.id);
  const mountedRef = useRef(true);
  useEffect(() => {
    activeIdRef.current = instance.id;
  }, [instance.id]);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);
  const isStale = (startedFor: string) => !mountedRef.current || activeIdRef.current !== startedFor;

  const runCheck = async () => {
    const startedFor = instance.id;
    setChecking(true);
    try {
      const next = await checkPackUpdates(instance);
      if (isStale(startedFor)) return;
      setResult(next);
      const sel: Record<string, boolean> = {};
      for (const c of next.customs) sel[c.mod.id] = true;
      setSelected(sel);
      if (!next.base.available && next.customs.length === 0) {
        addToast('Everything looks up to date', 'success');
      }
    } catch (e) {
      if (isStale(startedFor)) return;
      addToast(`Update check failed: ${e}`, 'error');
    } finally {
      if (!isStale(startedFor)) setChecking(false);
    }
  };

  const applyBase = async () => {
    if (!result?.base.latest || applyingBase) return;
    const latest = result.base.latest;
    const startedFor = instance.id;
    setApplyingBase(true);
    onUpdate({ status: 'Installing...' });
    try {
      const applied = await applyBasePackUpdate({
        instanceId: instance.id,
        latest,
        serverOn,
      });
      if (isStale(startedFor)) return;
      onUpdate({
        basePackVersion: applied.versionId,
        basePackVersionLabel: applied.versionNumber,
        status: 'Ready',
      });
      if (applied.serverWarning) {
        addToast(`Client updated; server rebuild skipped: ${applied.serverWarning}`, 'info');
      }
      setResult(prev =>
        prev
          ? {
              ...prev,
              base: {
                available: false,
                currentLabel: applied.versionNumber,
                latest,
              },
            }
          : prev
      );
      addToast(
        serverOn && applied.serverRebuilt
          ? `Base pack updated to ${applied.versionNumber} (client + server)`
          : `Base pack updated to ${applied.versionNumber}`,
        'success'
      );
      onBaseUpdated?.();
    } catch (e) {
      if (isStale(startedFor)) return;
      onUpdate({ status: `Error: ${e}` });
      addToast(`Base update failed: ${e}`, 'error');
    } finally {
      if (!isStale(startedFor)) setApplyingBase(false);
    }
  };

  const selectedCustoms = (): CustomUpdateInfo[] =>
    (result?.customs || []).filter(c => selected[c.mod.id]);

  const applyCustoms = async () => {
    const picks = selectedCustoms();
    if (picks.length === 0 || applyingCustoms) return;
    const startedFor = instance.id;
    setApplyingCustoms(true);
    try {
      const applied = await applyCustomModUpdates({
        instance,
        serverOn,
        pins: picks.map(c => ({
          modId: c.mod.id,
          versionId: c.latest.versionId,
          versionNumber: c.latest.versionNumber,
          fileName: c.latest.primaryFilename || undefined,
        })),
      });
      if (isStale(startedFor)) return;
      onUpdate({ customMods: applied.updatedMods });
      setResult(prev =>
        prev ? { ...prev, customs: prev.customs.filter(c => !selected[c.mod.id]) } : prev
      );
      const layered = applied.clientLayered + applied.serverLayered;
      addToast(
        serverOn && applied.serverLayered > 0
          ? `Updated ${picks.length} custom mod${picks.length === 1 ? '' : 's'} (client ${applied.clientLayered}, server ${applied.serverLayered})`
          : `Updated ${picks.length} custom mod${picks.length === 1 ? '' : 's'} (${layered} layered)`,
        'success'
      );

      const installed = installedModIds({
        basePackMods: instance.basePackMods,
        customMods: applied.updatedMods,
      });
      const missingList: string[] = [];
      const conflictList: string[] = [];
      for (const pick of picks) {
        const missing = missingRequiredDependencies(pick.latest, installed);
        if (missing.length > 0) {
          missingList.push(`${pick.mod.name} (${missing.map(m => m.projectId).join(', ')})`);
        }
        const conflicts = conflictingMods(pick.latest, [
          ...instance.basePackMods,
          ...applied.updatedMods,
        ]);
        if (conflicts.length > 0) {
          conflictList.push(`${pick.mod.name} with ${conflicts.map(m => m.name).join(', ')}`);
        }
      }
      if (conflictList.length > 0) {
        addToast(`Incompatibilities detected: ${conflictList.join('; ')}`, 'error');
      }
      if (missingList.length > 0) {
        addToast(`Missing required dependencies: ${missingList.join('; ')}`, 'error');
      }
    } catch (e) {
      addToast(`Custom update failed: ${e}`, 'error');
    } finally {
      setApplyingCustoms(false);
    }
  };

  const toggleAll = (on: boolean) => {
    if (!result) return;
    const sel: Record<string, boolean> = {};
    for (const c of result.customs) sel[c.mod.id] = on;
    setSelected(sel);
  };

  const hasAny = !!result && (result.base.available || result.customs.length > 0);

  return (
    <div id="updates-card">
      <div className="flex items-center justify-between mb-3">
        <h3 className="section-label mb-0">Updates</h3>
        <button
          className="btn-secondary text-[12px] px-3 py-1"
          onClick={runCheck}
          disabled={checking || applyingBase || applyingCustoms}
          title="Looks for a newer base pack and newer custom mods. Doesn't download anything."
        >
          <Icon name="refresh" size={12} />
          {checking ? 'Checking…' : 'Check for updates'}
        </button>
      </div>

      <div className="loom-panel">
        <div className="loom-panel-body flex flex-col gap-4">
          {!result && (
            <p className="text-[13px] text-[var(--text-secondary)]">
              Scan Modrinth for a newer base pack or custom mods. Checking never downloads — you
              choose what to apply.
              {serverOn &&
                ' With Server Pack Packager on, applying updates also refreshes the server workspace when it exists.'}
            </p>
          )}

          {result && !hasAny && (
            <p className="text-[13px]" style={{ color: 'var(--text-primary)' }}>
              Up to date
            </p>
          )}

          {result?.base && instance.source === 'modrinth' && (
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div className="min-w-0">
                <div className="text-[13px] font-medium text-[var(--text-primary)]">Base pack</div>
                <div className="text-[12px] text-[var(--text-secondary)]">
                  {result.base.available && result.base.latest
                    ? `${result.base.currentLabel} → ${result.base.latest.versionNumber}`
                    : `Current ${result.base.currentLabel}`}
                </div>
              </div>
              {result.base.available && (
                <button
                  className="btn-secondary text-[11px] px-3 py-1 shrink-0"
                  onClick={applyBase}
                  disabled={applyingBase || checking}
                  title={
                    serverOn
                      ? 'Downloads the new pack, rebuilds client and server workspaces, then re-layers enabled customs on both.'
                      : 'Downloads the new pack, rebuilds the client workspace, then puts your enabled custom mods back.'
                  }
                >
                  {applyingBase ? 'Updating…' : 'Update base pack'}
                </button>
              )}
            </div>
          )}

          {result?.base.available && result.base.latest && (
            <ChangelogDisclosure
              changelog={result.base.latest.changelog}
              label={`base pack ${result.base.latest.versionNumber}`}
            />
          )}

          {result && result.customs.length > 0 && (
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div>
                  <div className="text-[13px] font-medium text-[var(--text-primary)]">
                    Custom mods · {result.customs.length} update
                    {result.customs.length === 1 ? '' : 's'}
                  </div>
                  <div className="text-[12px] text-[var(--text-secondary)]">
                    Doesn’t change the base pack
                    {serverOn ? ' · layers client + server when present' : ''}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    className="btn-ghost text-[11px] px-2 py-0.5"
                    onClick={() => toggleAll(true)}
                    type="button"
                  >
                    Select all
                  </button>
                  <button
                    className="btn-ghost text-[11px] px-2 py-0.5"
                    onClick={() => toggleAll(false)}
                    type="button"
                  >
                    Clear
                  </button>
                  <button
                    className="btn-secondary text-[11px] px-3 py-1"
                    onClick={applyCustoms}
                    disabled={applyingCustoms || selectedCustoms().length === 0}
                    title={
                      serverOn
                        ? 'Downloads newer selected customs into client and server workspaces (server only if rebuilt).'
                        : "Downloads newer versions of selected customs only. Doesn't change the base pack."
                    }
                  >
                    {applyingCustoms
                      ? 'Updating…'
                      : `Update selected (${selectedCustoms().length})`}
                  </button>
                </div>
              </div>
              <ul className="flex flex-col gap-1.5 max-h-48 overflow-y-auto">
                {result.customs.map(c => (
                  <li
                    key={c.mod.id}
                    className="flex flex-col gap-1 text-[12px] px-2 py-1.5 rounded-md"
                    style={{ background: 'var(--bg-muted)' }}
                  >
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={!!selected[c.mod.id]}
                        onChange={e =>
                          setSelected(prev => ({ ...prev, [c.mod.id]: e.target.checked }))
                        }
                        aria-label={`Update ${c.mod.name}`}
                      />
                      <span
                        className="truncate flex-1 font-medium"
                        style={{ color: 'var(--text-primary)' }}
                      >
                        {c.mod.name}
                      </span>
                      <span className="text-[11px] text-[var(--text-muted)] shrink-0">
                        {c.currentLabel} → {c.latest.versionNumber}
                      </span>
                    </div>
                    <ChangelogDisclosure
                      changelog={c.latest.changelog}
                      label={`${c.mod.name} ${c.latest.versionNumber}`}
                    />
                  </li>
                ))}
              </ul>
            </div>
          )}

          {result?.base.available && result.customs.length > 0 && (
            <p className="text-[11px] text-[var(--text-muted)]">
              Tip: update the base pack first if you want both — rebuild re-layers customs
              afterward.
            </p>
          )}

          {result && result.skippedNonModrinth > 0 && (
            <p className="text-[11.5px] text-[var(--text-muted)]">
              {result.skippedNonModrinth} non-Modrinth custom mod
              {result.skippedNonModrinth === 1 ? '' : 's'} skipped (local jars cannot be checked
              automatically).
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
