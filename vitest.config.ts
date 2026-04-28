import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: [
      'core/__tests__/**/*.test.ts',
      'coordinator/__tests__/**/*.test.ts',
      'ingest-claude-code/__tests__/**/*.test.ts',
      'ingest-sdk/__tests__/**/*.test.ts',
    ],
    testTimeout: 15_000,
    reporters: ['verbose'],
  },
});
