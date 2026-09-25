import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';
import { viteSingleFile } from 'vite-plugin-singlefile';

// `vite build --mode demo` produces a single self-contained HTML file
// (no service worker) used for the interactive preview.
export default defineConfig(({ mode }) => {
  const demo = mode === 'demo';
  return {
    base: demo ? './' : process.env.BASE_PATH || '/',
    define: {
      __DEMO_BUILD__: JSON.stringify(demo),
      __APP_VERSION__: JSON.stringify(process.env.npm_package_version || '1.0.0'),
    },
    build: {
      outDir: demo ? 'dist-demo' : 'dist',
      target: 'es2022',
      chunkSizeWarningLimit: 1200,
    },
    plugins: [
      react(),
      tailwindcss(),
      demo
        ? viteSingleFile()
        : VitePWA({
            registerType: 'autoUpdate',
            injectRegister: false,
            includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
            manifest: {
              name: '譯跡 Wordtrail',
              short_name: '譯跡',
              description: '自由譯者的案件紀錄、收款追蹤、履歷產生與年度回顧',
              lang: 'zh-Hant-TW',
              theme_color: '#0b0b0c',
              background_color: '#0b0b0c',
              display: 'standalone',
              orientation: 'any',
              start_url: '.',
              scope: '.',
              categories: ['business', 'productivity', 'finance'],
              icons: [
                { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
                { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
                { src: 'icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
              ],
              shortcuts: [
                { name: '新增案件', short_name: '新增', url: './#/new' },
                { name: '案件列表', short_name: '案件', url: './#/jobs' },
              ],
            },
            workbox: {
              globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
              navigateFallback: 'index.html',
              runtimeCaching: [
                {
                  urlPattern: ({ url }) => url.origin === 'https://fonts.googleapis.com',
                  handler: 'StaleWhileRevalidate',
                  options: { cacheName: 'google-fonts-css' },
                },
                {
                  urlPattern: ({ url }) => url.origin === 'https://fonts.gstatic.com',
                  handler: 'CacheFirst',
                  options: {
                    cacheName: 'google-fonts-files',
                    expiration: { maxEntries: 400, maxAgeSeconds: 60 * 60 * 24 * 365 },
                    cacheableResponse: { statuses: [0, 200] },
                  },
                },
              ],
            },
          }),
    ],
    test: {
      environment: 'node',
      include: ['tests/**/*.test.ts'],
    },
  };
});
