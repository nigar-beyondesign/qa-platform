module.exports = {
  client:   '305care',
  url:      'https://305care.com',
  platform: 'shopify',
  crawl: { maxProducts: 20, maxVariants: 3, collections: [], excludeUrls: ['/blogs/', '/pages/privacy-policy', '/pages/imprint'] },
  checkout: { enabled: true, testData: { email: 'qa-test@example.com', firstName: 'QA', lastName: 'Test', address: '123 Test Street', city: 'Miami', zip: '33101', country: 'United States', phone: '+13055551234' } },
  customChecks: [],
  options: { waitAfterLoad: 2500, waitAfterATC: 2000, screenshotOnSuccess: false, checkBrokenLinks: true, checkConsoleErrors: true },
};
