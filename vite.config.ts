import { defineConfig } from 'vite';
import legacy from '@vitejs/plugin-legacy';

export default defineConfig({
  root: 'public',
  plugins: [
    legacy({
      targets: ['chrome >= 20', 'safari >= 6', 'ios >= 6', 'ie >= 9'],
      additionalLegacyPolyfills: ['regenerator-runtime/runtime'],
    }),
  ],
  build: {
    outDir: '../dist',
    emptyOutDir: true,
  },
});
