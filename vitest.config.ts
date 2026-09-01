import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  resolve: {
    conditions: ['browser', 'import'],
    dedupe: ['react', 'react-dom'],
  },
  test: {
    environment: 'happy-dom',
    setupFiles: ['./src/test/setup.ts'],
    globals: true,
    passWithNoTests: true,
    exclude: ['**/node_modules/**', '**/dist/**', '**/cypress/**', '**/.{idea,git,cache,output,temp}/**', '**/.agents/**']
  },
});
