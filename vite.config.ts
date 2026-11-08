import { defineConfig } from 'vitest/config';
import preact from '@preact/preset-vite';
import { readFileSync } from 'node:fs';

// 版本號唯一來源是 package.json；建置日期用台北時間
const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string };
const buildDate = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Taipei' }).format(new Date());

// GitHub Pages 部署在 /mock-exam-helper/ 子路徑
export default defineConfig({
  base: process.env.GITHUB_ACTIONS ? '/mock-exam-helper/' : '/',
  plugins: [preact()],
  define: { __APP_VERSION__: JSON.stringify(pkg.version), __BUILD_DATE__: JSON.stringify(buildDate) },
  test: { include: ['src/**/*.test.{ts,tsx}'], environment: 'node' },
});
