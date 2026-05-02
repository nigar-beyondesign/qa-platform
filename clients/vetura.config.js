module.exports = {
  client:   'Vetura',
  url:      'https://vetura.de',
  platform: 'woocommerce',
  crawl: { maxProducts: 20, maxVariants: 3, collections: [], excludeUrls: ['/impressum', '/datenschutz', '/agb', '/blog/'] },
  checkout: { enabled: true, testData: { email: 'qa-test@example.com', firstName: 'QA', lastName: 'Test', address: 'Teststraße 1', city: 'Berlin', zip: '10115', country: 'Germany', phone: '+491234567890' } },
  customChecks: [],
  options: { waitAfterLoad: 3000, waitAfterATC: 2500, screenshotOnSuccess: false, checkBrokenLinks: true, checkConsoleErrors: true },
};
