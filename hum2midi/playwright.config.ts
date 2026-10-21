import { defineConfig, devices } from '@playwright/test';

const PORT = 5178;

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
  },
  projects: [
    {
      name: 'chromium',
      testIgnore: /speech\.spec\.ts/,
      use: { ...devices['Desktop Chrome'], launchOptions: { args: fakeMic('scale_c_major_48k.wav') } },
    },
    {
      // 說話變唱歌：麥克風換成「說話」
      name: 'chromium-speech',
      testMatch: /speech\.spec\.ts/,
      use: { ...devices['Desktop Chrome'], launchOptions: { args: fakeMic('speech_like_48k.wav') } },
    },
  ],
  webServer: {
    command: `npm run dev -- --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}/`,
    reuseExistingServer: !process.env.CI,
  },
});
