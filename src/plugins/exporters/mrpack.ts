import { ExporterPlugin } from '../types';

export const MrpackExporterPlugin: ExporterPlugin = {
  id: 'mrpack_exporter',
  name: 'Modrinth .mrpack Exporter',
  description: 'Coming soon — Modrinth .mrpack export is not available yet.',
  version: '1.0.0',
  author: 'Packweaver Core',
  category: 'exporter',
  enabled: false,
  builtIn: true,
  isCore: false,
  fallbackEmoji: '📦',
  targetFormat: 'mrpack',
  fileExtension: '.mrpack',
};
