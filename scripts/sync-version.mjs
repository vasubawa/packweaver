/**
 * Keep the app version in one place.
 *
 * `package.json` is the source of truth. `tauri.conf.json` reads it directly
 * (its `version` field accepts a path to a package.json), so only `Cargo.toml`
 * has to be written — and Cargo needs a literal, it cannot reference a file.
 *
 *   node scripts/sync-version.mjs          write Cargo.toml to match
 *   node scripts/sync-version.mjs --check  fail if they have drifted
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const cargoPath = join(root, 'src-tauri', 'Cargo.toml');

const { version } = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
if (!version) {
  console.error('package.json has no version');
  process.exit(1);
}

const cargo = readFileSync(cargoPath, 'utf8');
// Only the [package] version — never a dependency's.
const versionLine = /^version\s*=\s*"[^"]*"$/m;
const match = cargo.match(versionLine);
if (!match) {
  console.error('Could not find a package version in Cargo.toml');
  process.exit(1);
}

const current = match[0].split('"')[1];
const check = process.argv.includes('--check');

if (current === version) {
  if (check) console.log(`version ${version} in sync`);
  process.exit(0);
}

if (check) {
  console.error(
    `Version drift: package.json is ${version}, Cargo.toml is ${current}.\n` +
      'Run `pnpm version:sync` (package.json is the source of truth).'
  );
  process.exit(1);
}

writeFileSync(cargoPath, cargo.replace(versionLine, `version = "${version}"`));
console.log(`Cargo.toml updated to ${version}`);
