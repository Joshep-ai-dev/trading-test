const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './e2e',
  workers: 1,
  timeout: 30000,
  use: { baseURL: 'http://localhost:4180', channel: 'chrome', headless: true, viewport: { width: 1440, height: 1000 } },
});
