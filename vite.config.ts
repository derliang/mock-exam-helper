import { defineConfig } from 'vitest/config';
import preact from '@preact/preset-vite';

// GitHub Pages 部署在 /mock-exam-helper/ 子路徑
export default defineConfig({
  base: process.env.GITHUB_ACTIONS ? '/mock-exam-helper/' : '/',
  plugins: [preact()],
  test: { include: ['src/**/*.test.{ts,tsx}'], environment: 'node' },
});
