const { defineConfig, devices } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './',  testIgnore: /(healthradar-real|healthradar-acceso)\.spec\.js|auth\.setup\.js/,
  fullyParallel: true,
  retries: 0,
  reporter: 'html',
  use: {
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
  ],
});
