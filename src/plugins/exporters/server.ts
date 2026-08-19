import { ExporterPlugin } from '../types';

export const ServerPackExporterPlugin: ExporterPlugin = {
  id: 'server_pack_exporter',
  name: 'Server Pack Packager',
  description:
    'Assemble server-side mods, scripts, configs, and startup scripts into a server archive.',
  version: '1.0.0',
  author: 'Packweaver Core',
  category: 'exporter',
  enabled: true,
  builtIn: true,
  fallbackEmoji: '🖥️',
  targetFormat: 'server',
  fileExtension: '-server.zip',
};
