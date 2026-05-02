// playwright.config.js
const { defineConfig, devices } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './tests',
  timeout: 300000,         // 5min pro Test – für langsame Shops mit vielen Produkten
  retries: 0,
  workers: 1,              // Sequential – wichtig für Cart-State

  use: {
    trace:      'on',                    // Immer Trace aufzeichnen
    screenshot: 'on',                    // Screenshot bei jedem Schritt
    video:      'on',                    // Immer Video aufzeichnen
    viewport:   { width: 1440, height: 900 },
    locale:     'de-DE',
    timezoneId: 'Europe/Berlin',
    // Realistischer User-Agent (kein "HeadlessChrome")
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    extraHTTPHeaders: {
      'Accept-Language': 'de-DE,de;q=0.9,en;q=0.8',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
      'sec-ch-ua': '"Chromium";v="124", "Google Chrome";v="124", "Not-A.Brand";v="99"',
      'sec-ch-ua-mobile': '?0',
      'sec-ch-ua-platform': '"macOS"',
    },
    ignoreHTTPSErrors: true,
  },

  reporter: [
    ['html',  { outputFolder: 'playwright-report', open: 'never' }],
    ['json',  { outputFile: 'reports/results.json' }],
    ['list'],
  ],

  projects: [
    {
      name: 'Desktop Chrome',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
