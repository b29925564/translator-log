import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';
import { viteSingleFile } from 'vite-plugin-singlefile';

// Identifies this build, so the app can tell whether the server has a newer one.
const BUILD_ID = (process.env.GITHUB_SHA || '').slice(0, 7) || `local-${Date.now().toString(36)}`;
const BUILD_TIME = new Date().toISOString();

// `vite build --mode demo` produces a single self-contained HTML file
// (no service worker) used for the interactive preview.
export default defineConfig(({ mode }) => {
  const demo = mode === 'demo';
  return {
    base: demo ? './' : process.env.BASE_PATH || '/',
    define: {
      __DEMO_BUILD__: JSON.stringify(demo),
      __APP_VERSION__: JSON.stringify(process.env.npm_package_version || '1.0.0'),
      __BUILD_ID__: JSON.stringify(BUILD_ID),
      __BUILD_TIME__: JSON.stringify(BUILD_TIME),
    },
    build: {
      outDir: demo ? 'dist-demo' : 'dist',
      target: 'es2022',
      chunkSizeWarningLimit: 1200,
    },
    plugins: [
      react(),
      tailwindcss(),
      // version.json is left out of the service worker cache, so fetching it always asks the server
      !demo && {
        name: 'build-version',
        generateBundle() {
          this.emitFile({ type: 'asset', fileName: 'version.json', source: JSON.stringify({ build: BUILD_ID, time: BUILD_TIME }) });
        },
      },
      demo
        ? viteSingleFile()
        : VitePWA({
            registerType: 'autoUpdate',
            injectRegister: false,
            includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
            manifest: {
              name: '記譯 Witimemo',
              short_name: '記譯',
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
              id: './',
              shortcuts: [
                { name: '新增案件 New job', short_name: '新增', url: './#/new', icons: [{ src: 'icon-192.png', sizes: '192x192' }] },
                { name: '案件列表 Jobs', short_name: '案件', url: './#/jobs', icons: [{ src: 'icon-192.png', sizes: '192x192' }] },
                { name: '年度回顧 Year in review', short_name: '回顧', url: './#/wrapped', icons: [{ src: 'icon-192.png', sizes: '192x192' }] },
              ],
              // share an email into Quick Add, or a statement file into report import (public/share-target.js)
              share_target: {
                action: './share-target',
                method: 'POST',
                enctype: 'multipart/form-data',
                params: {
                  title: 'title',
                  text: 'text',
                  url: 'url',
                  files: [
                    {
                      name: 'files',
                      accept: [
                        'application/pdf',
                        'image/*',
                        'text/csv',
                        'text/plain',
                        'text/html',
                        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                        'application/vnd.oasis.opendocument.spreadsheet',
                        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                        '.csv',
                        '.xlsx',
                        '.ods',
                        '.docx',
                        '.pdf',
                      ],
                    },
                  ],
                },
              },
              screenshots: [
                { src: 'screenshots/wide.png', sizes: '1440x900', type: 'image/png', form_factor: 'wide', label: 'Witimemo overview' },
                { src: 'screenshots/narrow.png', sizes: '780x1688', type: 'image/png', form_factor: 'narrow', label: 'Witimemo on a phone' },
              ],
            },
            workbox: {
              globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
              globIgnores: ['screenshots/**'],
              importScripts: ['share-target.js'],
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
