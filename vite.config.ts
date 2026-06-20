import { defineConfig } from 'vite';
import legacy from '@vitejs/plugin-legacy';

export default defineConfig({
  plugins: [
    legacy({
      targets: ['chrome >= 20', 'safari >= 6', 'ios >= 6', 'ie >= 9'],
      additionalLegacyPolyfills: ['regenerator-runtime/runtime'],
    }),
  ],
  server: {
    proxy: {
      // Bypasses browser CORS restrictions by proxying local `/zo-api` calls to `https://api.zo.computer`
      '/zo-api': {
        target: 'https://api.zo.computer',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/zo-api/, ''),
      },
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
});
