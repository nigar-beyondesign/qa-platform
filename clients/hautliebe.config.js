module.exports = {
  client:   'Hautliebe',
  url:      'https://hautliebe.de',
  platform: 'shopify',
  crawl: { maxProducts: 20, maxVariants: 3, collections: [], excludeUrls: ['/blogs/', '/pages/impressum', '/pages/datenschutz'] },
  checkout: { enabled: true, testData: { email: 'qa-test@example.com', firstName: 'QA', lastName: 'Test', address: 'Teststraße 1', city: 'Berlin', zip: '10115', country: 'Germany', phone: '+491234567890' } },
  customChecks: [],
  options: { waitAfterLoad: 2500, waitAfterATC: 2000, screenshotOnSuccess: false, checkBrokenLinks: true, checkConsoleErrors: true },
};
