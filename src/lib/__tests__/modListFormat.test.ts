import { describe, it, expect } from 'vitest';
import { modrinthProjectUrl } from '../../components/detail/modListFormat';

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
