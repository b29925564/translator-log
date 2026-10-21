import { defineConfig } from 'vitest/config';

export default defineConfig({
  // 相對路徑，build 出來的 dist 放在任何子路徑（例如 GitHub Pages）都能開
  base: './',
  worker: { format: 'es' },
  test: {
    environment: 'node',
    include: ['tests/unit/**/*.test.ts'],
    globalSetup: ['tests/setup/fixtures.ts'],
  },
});
