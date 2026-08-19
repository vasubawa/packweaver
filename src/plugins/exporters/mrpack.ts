import { ExporterPlugin } from '../types';

export const MrpackExporterPlugin: ExporterPlugin = {
  id: 'mrpack_exporter',
  name: 'Modrinth .mrpack Exporter',
  description: 'Pack workspace into a standard Modrinth index (.mrpack) format.',
  version: '1.0.0',
  author: 'Packweaver Core',
  category: 'exporter',
  enabled: true,
  builtIn: true,
  isCore: true,
  fallbackEmoji: '📦',
  targetFormat: 'mrpack',
  fileExtension: '.mrpack',
};
