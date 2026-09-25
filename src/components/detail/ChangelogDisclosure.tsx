import { useState } from 'react';

interface ChangelogDisclosureProps {
  changelog?: string | null;
  /** What the changelog belongs to, for the toggle's accessible name. */
  label: string;
}

/** Rough cap so a mod with a book-length changelog cannot blow out the card. */
const MAX_CHARS = 4000;

/**
 * The provider's release notes for a pending update, collapsed by default.
 * Rendered as plain text, never as HTML or Markdown: this string is third-party
 * content and the card is inside the app's own origin.
 */
export function ChangelogDisclosure({ changelog, label }: ChangelogDisclosureProps) {
  const [open, setOpen] = useState(false);
  const text = (changelog || '').trim();
  if (!text) return null;

  const clipped = text.length > MAX_CHARS;
  const shown = clipped ? `${text.slice(0, MAX_CHARS)}\n…` : text;

  return (
    <div className="flex flex-col gap-1">
      <button
        type="button"
        className="btn-ghost text-[11px] px-2 py-0.5 self-start"
        aria-expanded={open}
        onClick={() => setOpen(o => !o)}
      >
        {open ? 'Hide' : 'What changed?'}
        <span className="sr-only"> in {label}</span>
      </button>
      {open && (
        <pre className="changelog-body" aria-label={`Changelog for ${label}`}>
          {shown}
        </pre>
      )}
    </div>
  );
}
