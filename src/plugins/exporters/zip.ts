import { ExporterPlugin } from '../types';

export const ZipExporterPlugin: ExporterPlugin = {
  id: 'zip_exporter',
  name: 'Standard Client Zip Exporter',
  description: 'Pack raw client files (mods, config, resourcepacks) into a standard .zip.',
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
