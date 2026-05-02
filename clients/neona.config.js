module.exports = {
  client:   'Neona Store',
  url:      'https://www.neona.store',
  platform: 'shopify',
  crawl: { maxProducts: 20, maxVariants: 999, collections: [], excludeUrls: ['/blogs/', '/pages/imprint', '/pages/datenschutz'] },
  checkout: { enabled: true, testData: { email: 'qa-test@example.com', firstName: 'QA', lastName: 'Test', address: 'Teststraße 1', city: 'Berlin', zip: '10115', country: 'Germany', phone: '+491234567890' } },
  customChecks: [
    { name: 'Cart-Bilder freigestellt', area: 'cart', severity: 'Critical', description: 'Nur freigestellte Produktbilder (kein Hintergrund, keine Models) im Warenkorb.', check: async (page) => { const imgs = await page.locator('[class*="cart__item"] img, [class*="cart-item"] img, [class*="line-item"] img').all(); const results = []; for (const img of imgs.slice(0,5)) { const src = await img.getAttribute('src').catch(()=>'') || ''; const loaded = await img.evaluate(el => el.naturalWidth > 0).catch(()=>false); results.push({ src: src.slice(0,80), loaded }); } return { passed: results.every(r => r.loaded), details: results, hint: 'Manuell prüfen: Sind Cart-Bilder freigestellt?' }; } },
  ],
  options: { waitAfterLoad: 2500, waitAfterATC: 2000, screenshotOnSuccess: false, checkBrokenLinks: true, checkConsoleErrors: true },
};
