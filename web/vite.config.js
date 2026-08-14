import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// El front corre en 4611 y proxya /api al backend Express (4610).
export default defineConfig({
  plugins: [react()],
  server: {
    port: 4611,
    proxy: {
      '/api': 'http://localhost:4610',
    },
  },
});
