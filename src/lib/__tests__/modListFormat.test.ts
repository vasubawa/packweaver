import { describe, it, expect } from 'vitest';
import {
  modrinthProjectUrl,
  formatBytes,
  displayModVersion,
  jarLeaf,
} from '../../components/detail/modListFormat';

describe('modrinthProjectUrl', () => {
  it('links a Modrinth-sourced mod by slug', () => {
    expect(modrinthProjectUrl({ id: 'sodium', source: 'modrinth' })).toBe(
      'https://modrinth.com/mod/sodium'
    );
  });

  // Base mods from a locally-imported .mrpack carry the instance source
  // ('local') but a real project id parsed out of the CDN download URL.
  it('links an 8-char project id even when the source is local', () => {
    expect(modrinthProjectUrl({ id: 'AANobbMI', source: 'local' })).toBe(
      'https://modrinth.com/mod/AANobbMI'
    );
  });

  it('does not link a file-path id', () => {
    const BS = String.fromCharCode(92);
    expect(modrinthProjectUrl({ id: 'mods/sodium.jar', source: 'modrinth' })).toBeUndefined();
    expect(modrinthProjectUrl({ id: 'sodium-fabric-0.5.8.jar' })).toBeUndefined();
    expect(modrinthProjectUrl({ id: `mods${BS}sodium`, source: 'modrinth' })).toBeUndefined();
  });

  it('does not link a locally added jar', () => {
    expect(
      modrinthProjectUrl({ id: 'local-3f2b1c4d-0000-4000-8000-000000000000', source: 'local' })
    ).toBeUndefined();
  });

  it('does not link a non-Modrinth source with a slug-shaped id', () => {
    expect(modrinthProjectUrl({ id: 'some-mod', source: 'curseforge' })).toBeUndefined();
  });

  it('returns undefined for an empty or missing id', () => {
    expect(modrinthProjectUrl({ id: '', source: 'modrinth' })).toBeUndefined();
    expect(modrinthProjectUrl({ source: 'modrinth' })).toBeUndefined();
    expect(modrinthProjectUrl({ id: '   ', source: 'modrinth' })).toBeUndefined();
  });

  it('rejects an id with characters that do not belong in a slug', () => {
    expect(modrinthProjectUrl({ id: '../../etc/passwd', source: 'modrinth' })).toBeUndefined();
    expect(modrinthProjectUrl({ id: 'a b', source: 'modrinth' })).toBeUndefined();
    expect(modrinthProjectUrl({ id: 'x', source: 'modrinth' })).toBeUndefined();
  });
});

describe('formatBytes', () => {
  it('formats byte sizes correctly', () => {
    expect(formatBytes(null)).toBe('—');
    expect(formatBytes(0)).toBe('—');
    expect(formatBytes(500)).toBe('500 B');
    expect(formatBytes(1024)).toBe('1.0 KB');
    expect(formatBytes(1500000)).toBe('1.4 MB');
  });
});

describe('displayModVersion', () => {
  it('returns clean version or extracts from filename', () => {
    expect(displayModVersion('1.2.3')).toBe('1.2.3');
    expect(displayModVersion('2XUIKIAa', 'fabric-api-0.92.0.jar')).toBe('0.92.0');
    expect(displayModVersion('latest', 'mod-1.0.0.jar')).toBe('1.0.0');
    expect(displayModVersion('', 'mod.jar')).toBe('—');
  });
});

describe('jarLeaf', () => {
  it('extracts leaf from unix and windows paths', () => {
    expect(jarLeaf('mods/sodium.jar')).toBe('sodium.jar');
    expect(jarLeaf('mods\\sodium.jar')).toBe('sodium.jar');
    expect(jarLeaf('', 'fallback-mod')).toBe('fallback-mod');
    expect(jarLeaf(null, '')).toBe('—');
  });
});
