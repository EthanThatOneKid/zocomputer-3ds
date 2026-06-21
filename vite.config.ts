import { defineConfig } from 'vite';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

var __filename = fileURLToPath(import.meta.url);
var __dirname = dirname(__filename);

export default defineConfig({
  plugins: [
    {
      name: 'no-module-script',
      apply: 'build',
      transformIndexHtml(html: string) {
        return html.replace(/\btype="module"/g, '');
      },
    },
  ],
  server: {
    proxy: {
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
    target: 'es5',
    modulePreload: false,
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        qrcodegen: resolve(__dirname, 'src/qrcodegen.ts'),
      },
      output: {
        entryFileNames: function (chunkInfo: any) {
          if (chunkInfo.name === 'qrcodegen') {
            return 'assets/qrcodegen.js';
          }
          return 'assets/[name]-[hash].js';
        },
      },
    },
  },
});
