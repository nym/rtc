import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: [
      'core/__tests__/**/*.test.ts',
      'coordinator/__tests__/**/*.test.ts',
      'ingest-claude-code/__tests__/**/*.test.ts',
    ],
    reporters: ['verbose'],
  },
});
