module.exports = {
  client:   'Flawluxe',
  url:      'https://flawluxe.co',
  platform: 'shopify',
  crawl: { maxProducts: 20, maxVariants: 3, collections: [], excludeUrls: ['/blogs/', '/pages/privacy-policy', '/pages/imprint'] },
  checkout: { enabled: true, testData: { email: 'qa-test@example.com', firstName: 'QA', lastName: 'Test', address: '123 Test Street', city: 'New York', zip: '10001', country: 'United States', phone: '+12125551234' } },
  customChecks: [],
  options: { waitAfterLoad: 2500, waitAfterATC: 2000, screenshotOnSuccess: false, checkBrokenLinks: true, checkConsoleErrors: true },
};
