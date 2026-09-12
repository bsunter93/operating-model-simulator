import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Served from bensunter.com/simulator/
export default defineConfig({
  plugins: [react()],
  base: '/simulator/',
  define: { __BUILD_DATE__: JSON.stringify(new Date().toISOString().slice(0, 10)) },
});
