import { ExporterPlugin } from '../types';

export const MrpackExporterPlugin: ExporterPlugin = {
  id: 'mrpack_exporter',
  name: 'Modrinth .mrpack',
  description:
    'Export the client workspace as a Modrinth pack (.mrpack): CDN-linked base mods in the index, customs and configs in overrides/. Pick it per pack on Overview.',
  version: '1.0.0',
  author: 'Packweaver Core',
  category: 'exporter',
  enabled: true,
  builtIn: true,
  isCore: false,
  fallbackEmoji: '📦',
  targetFormat: 'mrpack',
  fileExtension: '.mrpack',
};
