import { ExporterPlugin } from '../types';

export const MrpackExporterPlugin: ExporterPlugin = {
  id: 'mrpack_exporter',
  name: 'Modrinth .mrpack',
  description:
    'Modrinth pack format (.mrpack) — a pack archive, same idea as a client zip or Technic’s launcher package. Export is not written yet, so this stays off until it produces a real index.',
  version: '1.0.0',
  author: 'Packweaver Core',
  category: 'exporter',
  enabled: false,
  builtIn: true,
  isCore: false,
  comingSoon: true,
  fallbackEmoji: '📦',
  targetFormat: 'mrpack',
  fileExtension: '.mrpack',
};
