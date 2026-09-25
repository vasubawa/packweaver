import { describe, it, expect, vi } from 'vitest';

vi.mock('@tauri-apps/api/core', () => ({
  convertFileSrc: (p: string) => `asset://localhost/${encodeURIComponent(p)}`,
}));

const { mediaUrl, cssUrl } = await import('../mediaUrl');

describe('mediaUrl', () => {
  it('passes through remote and data URLs untouched', () => {
    expect(mediaUrl('https://cdn.modrinth.com/a.png')).toBe('https://cdn.modrinth.com/a.png');
    expect(mediaUrl('data:image/png;base64,AAAA')).toBe('data:image/png;base64,AAAA');
  });

  it('returns undefined for empty input', () => {
    expect(mediaUrl('')).toBeUndefined();
    expect(mediaUrl('   ')).toBeUndefined();
    expect(mediaUrl(null)).toBeUndefined();
  });

  it('converts a local disk path to the asset protocol', () => {
    expect(mediaUrl(`C:${String.fromCharCode(92)}packs${String.fromCharCode(92)}icon.png`)).toMatch(
      /^asset:\/\/localhost\//
    );
  });
});

describe('cssUrl', () => {
  it('wraps a normal URL in a quoted url() token', () => {
    expect(cssUrl('https://example.com/a.png')).toBe('url("https://example.com/a.png")');
  });

  // A pack's banner URL comes from a third party and is interpolated into a
  // `background` shorthand; an unescaped quote or paren breaks out into
  // arbitrary CSS.
  it('escapes quotes so the token cannot be closed early', () => {
    const injected = cssUrl('https://evil.tld/a.png") ; background: red; content: "');
    expect(injected).toBeDefined();
    expect(injected!.startsWith('url("')).toBe(true);
    expect(injected!.endsWith('")')).toBe(true);
    // Every inner quote is escaped, so the only unescaped ones are the wrappers.
    const inner = injected!.slice(5, -2);
    expect(inner.replace(/\\"/g, '')).not.toContain('"');
  });

  it('escapes backslashes', () => {
    const BS = String.fromCharCode(92);
    expect(cssUrl(`https://example.com/a${BS}b.png`)).toBe(
      `url("https://example.com/a${BS}${BS}b.png")`
    );
  });

  it('refuses a URL containing a newline', () => {
    expect(cssUrl('https://example.com/a.png\n background: red')).toBeUndefined();
  });

  it('returns undefined when there is nothing to show', () => {
    expect(cssUrl(undefined)).toBeUndefined();
  });
});
