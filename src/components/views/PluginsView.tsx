import { Icon } from '../Icon';

export function PluginsView() {
  return (
    <div className="p-6 max-w-2xl animate-slide-in">
      <h2
        className="text-xl font-semibold tracking-tight mb-1"
        style={{ color: 'var(--text-primary)', fontFamily: "'Newsreader', Georgia, serif" }}
      >
        Plugins
      </h2>
      <p className="text-xs mb-6" style={{ color: 'var(--text-muted)' }}>
        Browse and manage plugins for your packs
      </p>
      <div
        className="grid gap-4 scrollbar-thin"
        style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))' }}
      >
        <div
          className="instance-card flex flex-col items-center justify-center py-20 rounded-xl"
          style={{ minHeight: '240px' }}
        >
          <div
            className="flex items-center justify-center rounded-2xl mb-3"
            style={{
              width: 56,
              height: 56,
              background: 'var(--bg-muted)',
              border: '1px solid var(--border)',
            }}
          >
            <Icon name="puzzle" size={22} />
          </div>
          <p className="text-sm font-medium mb-1" style={{ color: 'var(--text-primary)' }}>
            Coming soon
          </p>
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
            Plugin browser is under active development
          </p>
        </div>
      </div>
    </div>
  );
}
