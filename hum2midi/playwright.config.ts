import { defineConfig, devices } from '@playwright/test';

const PORT = 5178;
const PROD_PORT = 5179;

/** 假麥克風：把測試音檔當成麥克風輸入（Chromium 會循環播放這個檔案）。 */
function fakeMic(file: string) {
  return [
    '--use-fake-ui-for-media-stream',
    '--use-fake-device-for-media-stream',
    `--use-file-for-fake-audio-capture=tests/fixtures/${file}`,
    '--autoplay-policy=no-user-gesture-required',
  ];
}

export default defineConfig({
  testDir: 'tests/e2e',
  globalSetup: './tests/setup/fixtures.ts',
  timeout: 60_000,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: `http://localhost:${PORT}/`,
    trace: 'retain-on-failure',
    // 預設當成「看過說明卡」；說明卡自己的測試會清掉
    storageState: {
      cookies: [],
      origins: [{ origin: `http://localhost:${PORT}`, localStorage: [{ name: 'hum2midi.prefs', value: '{"onboarded":true}' }] }],
    },
  },
  projects: [
    {
      name: 'chromium',
      testIgnore: /(speech|prod)\.spec\.ts/,
      use: { ...devices['Desktop Chrome'], launchOptions: { args: fakeMic('scale_c_major_48k.wav') } },
    },
    {
      // 說話變唱歌：麥克風換成「說話」
      name: 'chromium-speech',
      testMatch: /speech\.spec\.ts/,
      use: { ...devices['Desktop Chrome'], launchOptions: { args: fakeMic('speech_like_48k.wav') } },
    },
    {
      // 正式 build（vite build＋preview）：Worker、AudioWorklet、IndexedDB 在打包後也要能動
      name: 'chromium-prod',
      testMatch: /prod\.spec\.ts/,
      use: {
        ...devices['Desktop Chrome'],
        baseURL: `http://localhost:${PROD_PORT}/`,
        storageState: {
          cookies: [],
          origins: [{ origin: `http://localhost:${PROD_PORT}`, localStorage: [{ name: 'hum2midi.prefs', value: '{"onboarded":true}' }] }],
        },
        launchOptions: { args: fakeMic('scale_c_major_48k.wav') },
      },
    },
  ],
  webServer: [
    {
      command: `npm run dev -- --port ${PORT} --strictPort`,
      url: `http://localhost:${PORT}/`,
      reuseExistingServer: !process.env.CI,
    },
    {
      command: `npm run build && npm run preview -- --port ${PROD_PORT} --strictPort`,
      url: `http://localhost:${PROD_PORT}/`,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
  ],
});
