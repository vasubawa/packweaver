import { ExporterPlugin } from '../types';

export const ServerPackExporterPlugin: ExporterPlugin = {
  id: 'server_pack_exporter',
  name: 'Server Pack Packager',
  description:
    'Build workspace/server/{stem} and export {stem}-MODIFIED-server.zip (or {stem}-{version}-MODIFIED-server.zip when a release version is set). Toggle off to hide Server Mods UI.',
  version: '1.0.0',
  author: 'Packweaver Core',
  category: 'exporter',
  enabled: false,
  builtIn: true,
  fallbackEmoji: '🖥️',
  targetFormat: 'server',
  fileExtension: '-server.zip',
};
