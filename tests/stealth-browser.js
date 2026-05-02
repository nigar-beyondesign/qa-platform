// tests/stealth-browser.js
// Startet Playwright mit Stealth-Konfiguration um Bot-Detection zu umgehen.

const { chromium } = require('playwright-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');

chromium.use(StealthPlugin());

/**
 * Erstellt einen Stealth-Browser-Context der Bot-Detection umgeht.
 * Wird von allen Tests verwendet statt dem normalen Playwright-Browser.
 */
async function createStealthContext(playwright) {
  const browser = await chromium.launch({
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-accelerated-2d-canvas',
      '--no-first-run',
      '--no-zygote',
      '--disable-gpu',
      // Wichtig: kein "--disable-blink-features=AutomationControlled" nötig
      // weil Stealth-Plugin das automatisch handled
    ],
  });

  const context = await browser.newContext({
    viewport:   { width: 1440, height: 900 },
    locale:     'de-DE',
    timezoneId: 'Europe/Berlin',
    userAgent:  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    extraHTTPHeaders: {
      'Accept-Language':    'de-DE,de;q=0.9,en;q=0.8',
      'Accept':             'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
      'sec-ch-ua':          '"Chromium";v="124", "Google Chrome";v="124", "Not-A.Brand";v="99"',
      'sec-ch-ua-mobile':   '?0',
      'sec-ch-ua-platform': '"macOS"',
      'Upgrade-Insecure-Requests': '1',
    },
    ignoreHTTPSErrors: true,
  });

  // Stealth-Patches auf jeder neuen Seite anwenden
  await context.addInitScript(() => {
    // Webdriver-Flag entfernen
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined });

    // Reale Plugin-Liste simulieren
    Object.defineProperty(navigator, 'plugins', {
      get: () => [
        { name: 'Chrome PDF Plugin' },
        { name: 'Chrome PDF Viewer' },
        { name: 'Native Client' },
      ],
    });

    // Reale Sprachen
    Object.defineProperty(navigator, 'languages', {
      get: () => ['de-DE', 'de', 'en-US', 'en'],
    });

    // Hardware concurrency simulieren
    Object.defineProperty(navigator, 'hardwareConcurrency', { get: () => 8 });

    // Permission API patchen
    const originalQuery = window.navigator.permissions?.query;
    if (originalQuery) {
      window.navigator.permissions.query = (params) =>
        params.name === 'notifications'
          ? Promise.resolve({ state: Notification.permission })
          : originalQuery(params);
    }

    // Chrome-Objekt simulieren
    window.chrome = {
      runtime: {},
      loadTimes: () => {},
      csi: () => {},
      app: {},
    };
  });

  return { browser, context };
}

module.exports = { createStealthContext };
