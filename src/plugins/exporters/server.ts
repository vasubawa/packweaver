import { ExporterPlugin } from '../types';

export const ServerPackExporterPlugin: ExporterPlugin = {
  id: 'server_pack_exporter',
  name: 'Server Pack Packager',
  description: 'Coming soon — server pack export is not available yet.',
  version: '1.0.0',
  author: 'Packweaver Core',
  category: 'exporter',
  enabled: false,
  builtIn: true,
  fallbackEmoji: '🖥️',
  targetFormat: 'server',
  fileExtension: '-server.zip',
};
