module.exports = {
  client:   'Pamo Design (US)',
  url:      'https://pamo-design.com',
  platform: 'shopify',
  crawl: { maxProducts: 20, maxVariants: 3, collections: [], excludeUrls: ['/blogs/', '/pages/imprint', '/pages/privacy-policy'] },
  checkout: { enabled: true, testData: { email: 'qa-test@example.com', firstName: 'QA', lastName: 'Test', address: '123 Test Street', city: 'New York', zip: '10001', country: 'United States', phone: '+12125551234' } },
  customChecks: [],
  options: { waitAfterLoad: 2500, waitAfterATC: 2000, screenshotOnSuccess: false, checkBrokenLinks: true, checkConsoleErrors: true },
};
