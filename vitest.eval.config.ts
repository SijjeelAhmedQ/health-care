import { defineConfig } from 'vitest/config';
import path from 'node:path';

/** Live evaluations against the real local model — run with `npm run eval:llm`, never in the unit test run. */
export default defineConfig({
  resolve: {
    alias: { '@': path.resolve(__dirname, 'src') },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.eval.ts'],
    testTimeout: 60 * 60 * 1000,
  },
});
