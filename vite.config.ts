import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * Debe coincidir con el nombre del repositorio en GitHub Pages.
 * Si tu repo tiene otro slug, cambiá solo este string (siempre con slashes: /nombre-repo/).
 */
export default defineConfig({
  plugins: [react()],
  base: '/LOGISTIC-APP/',
  build: {
    outDir: 'dist',
    rollupOptions: {
      output: {
        manualChunks: {
          'react-vendor': ['react', 'react-dom', 'react-router-dom'],
          'charts-vendor': ['recharts'],
          'map-vendor': ['leaflet', 'react-leaflet'],
          'icons-vendor': ['lucide-react'],
        },
      },
    },
  },
});
