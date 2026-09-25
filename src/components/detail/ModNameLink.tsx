import { openUrl } from '@tauri-apps/plugin-opener';
import { useToast } from '../../context/ToastContext';
import { appLog } from '../../lib/appLog';
import { modrinthProjectUrl } from './modListFormat';

interface ModNameLinkProps {
  mod: { id?: string; source?: string };
  /** What to show — may differ from `mod.name` (jar names get parsed down). */
  label: string;
  title?: string;
  className?: string;
}

/**
 * A mod's name, opening its Modrinth page when the mod has one. Mods with no
 * project reference (local jars, plain-zip entries) render as plain text.
 */
export function ModNameLink({ mod, label, title, className }: ModNameLinkProps) {
  const { addToast } = useToast();
  const url = modrinthProjectUrl(mod);

  if (!url) {
    return (
      <div className={className} title={title ?? label}>
        {label}
      </div>
    );
  }

  const open = async () => {
    try {
      // A webview cannot navigate away; the OS browser handles it.
      await openUrl(url);
    } catch (e) {
      appLog('error', 'mods', `Could not open ${url}: ${String(e)}`);
      addToast(`Could not open the mod page: ${String(e)}`, 'error');
    }
  };

  return (
    <button
      type="button"
      className={`mod-name-link ${className ?? ''}`}
      title={`${title ?? label} — open on Modrinth`}
      onClick={() => void open()}
    >
      {label}
    </button>
  );
}
