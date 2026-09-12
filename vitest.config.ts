import { defineConfig } from 'vitest/config';
export default defineConfig({ define: { __BUILD_DATE__: JSON.stringify('test') }, test: { include: ['tests/**/*.test.ts'] } });
