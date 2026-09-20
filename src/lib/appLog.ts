export type AppLogLevel = 'info' | 'warn' | 'error' | 'debug';

export type AppLogEntry = {
  kind: 'entry';
  id: number;
  at: string;
  level: AppLogLevel;
  scope: string;
  message: string;
};

const MAX_ENTRIES = 200;
const VERBOSE_KEY = 'packweaver_debug_verbose';

let nextId = 1;
let entries: AppLogEntry[] = [];
const listeners = new Set<() => void>();

function notify() {
  for (const fn of listeners) fn();
}

function isoNow(): string {
  return new Date().toISOString();
}

export function isVerboseLogging(): boolean {
  try {
    return localStorage.getItem(VERBOSE_KEY) === '1';
  } catch {
    return false;
  }
}

export function setVerboseLogging(on: boolean) {
  try {
    localStorage.setItem(VERBOSE_KEY, on ? '1' : '0');
  } catch {
    /* ignore */
  }
  appLog('info', 'debug', on ? 'Verbose on' : 'Verbose off');
}

export function subscribeAppLog(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getAppLogEntries(): readonly AppLogEntry[] {
  return entries;
}

export function clearAppLog() {
  entries = [];
  notify();
}

export function appLog(level: AppLogLevel, scope: string, message: string) {
  if (level === 'debug' && !isVerboseLogging()) return;
  const next = [
    ...entries,
    {
      kind: 'entry' as const,
      id: nextId++,
      at: isoNow(),
      level,
      scope,
      message,
    },
  ];
  entries = next.length > MAX_ENTRIES ? next.slice(next.length - MAX_ENTRIES) : next;
  notify();
  if (level === 'error') {
    console.error(`[${scope}] ${message}`);
  } else if (level === 'warn') {
    console.warn(`[${scope}] ${message}`);
  }
}

export function formatAppLogText(): string {
  return entries.map(e => `${e.at} [${e.level}] ${e.scope}: ${e.message}`).join('\n');
}

/** Attach once from App — progress + uncaught errors. */
export function installAppLogBridges() {
  if (typeof window === 'undefined') return;
  window.addEventListener('unhandledrejection', ev => {
    const reason = ev.reason;
    const msg =
      reason instanceof Error
        ? reason.message
        : typeof reason === 'string'
          ? reason
          : 'Unhandled rejection';
    appLog('error', 'window', msg);
  });
  window.addEventListener('error', ev => {
    if (ev.message) appLog('error', 'window', ev.message);
  });
}
