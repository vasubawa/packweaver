import { ExporterPlugin } from '../types';

export const ZipExporterPlugin: ExporterPlugin = {
  id: 'zip_exporter',
  name: 'Standard Client Zip Exporter',
  description:
    'Pack client workspace into {stem}-MODIFIED.zip (or {stem}-{version}-MODIFIED.zip when a release version is set).',
  version: '1.0.0',
  author: 'Packweaver Core',
  category: 'exporter',
  enabled: true,
  builtIn: true,
  isCore: true,
  fallbackEmoji: '🗜️',
  targetFormat: 'zip',
  fileExtension: '.zip',
};
