// tests/qa.spec.js
// Universeller Webshop QA Agent v2
// - Auto-Crawling aller Produkte und Collections
// - ATC-Test für jede Variante
// - Checkout-Flow bis kurz vor Zahlung
// - Stealth Mode gegen Bot-Protection

const { test, expect } = require('@playwright/test');
const fs   = require('fs');
const path = require('path');
const config  = require('../qa.config.js');
const crawler = require('./crawler.js');

const BASE = config.url.replace(/\/$/, '');

// ── Globale Ergebnisse ─────────────────────────────────
const RESULTS = {
  client:       config.client,
  url:          BASE,
  platform:     config.platform,
  timestamp:    new Date().toISOString(),
  issues:       [],
  productsCrawled: 0,
  variantsTested:  0,
  atcResults:      [],
  checkoutResults: [],
  consoleErrors:   [],
  performance:     {},
  seo:             {},
};

// Gecrawlte Daten (wird in erstem Test befüllt)
let crawledData = { collectionUrls: [], productUrls: [] };

function addIssue(area, type, description, expected, actual, severity, url = '', steps = '') {
  RESULTS.issues.push({ area, type, description, expected, actual, severity, url, steps });
  const icon = severity === 'Critical' ? '🔴' : severity === 'High' ? '🟡' : severity === 'Medium' ? '🔵' : '⚪';
  console.log(`  ${icon} [${severity}] ${area}: ${type}`);
}

// ── Stealth Init Script ────────────────────────────────
async function applyStealthPatches(page) {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
    Object.defineProperty(navigator, 'plugins', { get: () => [{ name: 'Chrome PDF Plugin' }, { name: 'Chrome PDF Viewer' }] });
    Object.defineProperty(navigator, 'languages', { get: () => ['de-DE', 'de', 'en'] });
    Object.defineProperty(navigator, 'hardwareConcurrency', { get: () => 8 });
    window.chrome = { runtime: {}, loadTimes: () => {}, csi: () => {}, app: {} };
  });
}

// ── Hilfsfunktionen ────────────────────────────────────
async function safePriceText(page) {
  try {
    const el = page.locator('[class*="price"]:visible, [class*="money"]:visible').first();
    if (await el.count() === 0) return null;
    return await el.innerText({ timeout: 3000 });
  } catch { return null; }
}

async function waitForNetworkIdle(page, timeout = 3000) {
  try { await page.waitForLoadState('networkidle', { timeout }); } catch {}
}

// ── SCHRITT 1: AUTO-CRAWL ──────────────────────────────
test('Schritt 1: Shop crawlen – Collections & Produkte entdecken', async ({ page }) => {
  await applyStealthPatches(page);
  console.log(`\n${'═'.repeat(55)}`);
  console.log(`  QA Agent v2 – ${config.client}`);
  console.log(`  URL: ${BASE}`);
  console.log(`${'═'.repeat(55)}`);

  // Erreichbarkeit prüfen
  let response;
  try {
    response = await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 30000 });
  } catch (e) {
    addIssue('Allgemein', 'Shop nicht erreichbar', e.message?.slice(0,80), 'HTTP 200', 'Timeout/Fehler', 'Critical', BASE);
    return;
  }

  const status = response?.status() || 0;
  console.log(`\n  HTTP Status: ${status}`);

  if (status >= 400) {
    addIssue('Allgemein', `HTTP ${status}`, 'Shop antwortet mit Fehlercode', 'HTTP 200', `HTTP ${status}`, 'Critical', BASE,
      '1. URL im Browser öffnen\n2. HTTP-Status prüfen');
    return;
  }

  await page.waitForTimeout(config.options.waitAfterLoad);

  // SEO Homepage
  const seo = await page.evaluate(() => ({
    title:       document.title,
    titleLen:    document.title?.length,
    metaDesc:    document.querySelector('meta[name="description"]')?.content,
    canonical:   document.querySelector('link[rel="canonical"]')?.href,
    h1Count:     document.querySelectorAll('h1').length,
    h1Text:      Array.from(document.querySelectorAll('h1')).map(h => h.innerText.trim()).slice(0,3),
    missingAlts: Array.from(document.querySelectorAll('img')).filter(i => !i.getAttribute('alt')).length,
    hasViewport: !!document.querySelector('meta[name="viewport"]'),
    lang:        document.documentElement.lang,
  }));
  RESULTS.seo.homepage = seo;

  if (!seo.title) addIssue('Homepage', 'Meta Title fehlt', 'Kein <title> Tag', 'Title vorhanden', 'Fehlt', 'High', BASE);
  else if (seo.titleLen > 70) addIssue('Homepage', 'Meta Title zu lang', `${seo.titleLen} Zeichen`, '< 70 Zeichen', `${seo.titleLen} Zeichen`, 'Medium', BASE);
  if (!seo.metaDesc) addIssue('Homepage', 'Meta Description fehlt', 'Keine Meta Description', 'Description vorhanden', 'Fehlt', 'High', BASE);
  if (!seo.canonical) addIssue('Homepage', 'Canonical fehlt', 'Kein Canonical-Tag', 'Canonical gesetzt', 'Fehlt', 'Medium', BASE);
  if (seo.h1Count === 0) addIssue('Homepage', 'H1 fehlt', 'Keine H1-Überschrift', 'Genau 1 H1', '0 H1-Tags', 'High', BASE);
  if (seo.h1Count > 1) addIssue('Homepage', 'Mehrere H1-Tags', `${seo.h1Count} H1s gefunden`, 'Genau 1 H1', `${seo.h1Count} H1-Tags`, 'Medium', BASE);
  if (seo.missingAlts > 0) addIssue('Homepage', 'Bilder ohne Alt-Tag', `${seo.missingAlts} Bilder ohne Alt`, 'Alle Bilder mit Alt', `${seo.missingAlts} ohne Alt`, 'High', BASE);
  if (!seo.lang) addIssue('Homepage', 'Fehlendes lang-Attribut', '<html> ohne lang="..."', 'lang="de" oder "en"', 'Fehlt', 'Medium', BASE);

  // Performance
  const perf = await page.evaluate(() => {
    const t = performance.timing;
    return {
      ttfb:   t.responseStart - t.navigationStart,
      dcl:    t.domContentLoadedEventEnd - t.navigationStart,
      load:   t.loadEventEnd - t.navigationStart,
    };
  }).catch(() => ({}));
  RESULTS.performance.homepage = perf;
  if (perf.ttfb > 800) addIssue('Homepage', 'TTFB zu hoch', `${perf.ttfb}ms`, '< 800ms', `${perf.ttfb}ms`, perf.ttfb > 2000 ? 'High' : 'Medium', BASE);
  if (perf.load > 5000) addIssue('Homepage', 'Ladezeit zu hoch', `${perf.load}ms Gesamtladezeit`, '< 5000ms', `${perf.load}ms`, 'Medium', BASE);

  // CRAWLEN
  crawledData = await crawler.crawlShop(page, BASE);
  RESULTS.productsCrawled = crawledData.productUrls.length;

  expect(crawledData.productUrls.length).toBeGreaterThan(0);
  console.log(`\n  ✓ Crawl abgeschlossen: ${crawledData.productUrls.length} Produkte\n`);
});

// ── SCHRITT 2: JEDE PDP + ATC PRO VARIANTE ────────────
test('Schritt 2: PDP & Add-to-Cart – alle Produkte & Varianten', async ({ page }) => {
  await applyStealthPatches(page);

  const consoleErrors = [];
  page.on('console', msg => { if (['error','warning'].includes(msg.type())) consoleErrors.push({ type: msg.type(), text: msg.text().slice(0,150) }); });

  if (!crawledData.productUrls.length) {
    console.log('  ⚠ Keine Produkte gecrawlt – Schritt 1 zuerst ausführen');
    return;
  }

  const maxVariants = config.crawl?.maxVariants || 3;
  console.log(`\n  Teste ${crawledData.productUrls.length} Produkte...\n`);

  for (const productUrl of crawledData.productUrls) {
    const shortUrl = productUrl.replace(BASE, '');
    console.log(`\n  📄 ${shortUrl}`);

    let response;
    try {
      response = await page.goto(productUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
    } catch (e) {
      addIssue('PDP', 'PDP nicht erreichbar', e.message?.slice(0,60), 'HTTP 200', 'Timeout', 'High', productUrl);
      continue;
    }

    const status = response?.status() || 0;
    if (status >= 400) {
      addIssue('PDP', `HTTP ${status}`, 'PDP antwortet mit Fehlercode', 'HTTP 200', `HTTP ${status}`, 'High', productUrl);
      continue;
    }

    await page.waitForTimeout(config.options.waitAfterLoad);

    // ── PDP Basis-Checks ───────────────────────────────
    // Titel
    const h1 = await page.locator('h1').first().innerText({ timeout: 3000 }).catch(() => '');
    if (!h1) addIssue('PDP', 'Produkttitel fehlt', 'Kein H1/Produktname', 'Produktname als H1', 'Fehlt', 'High', productUrl);

    // Preis
    const priceText = await safePriceText(page);
    if (!priceText) addIssue('PDP', 'Preis fehlt', 'Kein Preis sichtbar', 'Preis sichtbar', 'Kein Preis-Element', 'Critical', productUrl);
    else if (priceText.includes('NaN') || priceText.includes('0,00 €')) addIssue('PDP', 'Fehlerhafter Preis', priceText, 'Korrekter Preis', priceText, 'Critical', productUrl);

    // Produktbilder
    const galleryCount = await page.locator('[class*="product"] img, [class*="gallery"] img, [class*="media"] img').count();
    if (galleryCount === 0) addIssue('PDP', 'Keine Produktbilder', 'Keine Bilder in der Gallery', 'Mind. 1 Produktbild', '0 Bilder', 'High', productUrl);

    // Alt-Tags auf Produktbildern
    const missingAlts = await page.evaluate(() =>
      Array.from(document.querySelectorAll('[class*="product"] img, [class*="gallery"] img'))
        .filter(i => !i.getAttribute('alt')).length
    );
    if (missingAlts > 0) addIssue('PDP', 'Produktbilder ohne Alt', `${missingAlts} Bilder ohne Alt-Tag`, 'Alle mit Alt', `${missingAlts} ohne Alt`, 'High', productUrl);

    // Add-to-Cart Button vorhanden?
    const atcSelector = 'button[name="add"], button:has-text("Add to cart"), button:has-text("In den Warenkorb"), button:has-text("Zum Warenkorb"), [id*="add-to-cart"], button[data-add-to-cart]';
    const atcCount = await page.locator(atcSelector).count();
    if (atcCount === 0) {
      addIssue('PDP', 'ATC Button fehlt', 'Kein Add-to-Cart Button gefunden', 'ATC Button vorhanden', 'Fehlt', 'Critical', productUrl);
      continue;
    }

    // ── Varianten entdecken ────────────────────────────
    const variants = await crawler.discoverVariants(page, productUrl);
    const variantsToTest = variants.slice(0, maxVariants);
    console.log(`     ${h1?.slice(0,40) || 'Produkt'} – ${variants.length} Variante(n), teste ${variantsToTest.length}`);

    // ── ATC für jede Variante ──────────────────────────
    for (const variant of variantsToTest) {
      const varLabel = variant.title !== 'Default' ? variant.title : 'Standard';

      // Zur PDP navigieren (frischer State per Variant)
      if (variant.id) {
        try {
          await page.goto(`${productUrl}?variant=${variant.id}`, { waitUntil: 'domcontentloaded', timeout: 20000 });
          await page.waitForTimeout(1500);
        } catch {}
      }

      if (!variant.available) {
        console.log(`     ⊘ ${varLabel}: nicht verfügbar – übersprungen`);
        RESULTS.atcResults.push({ url: productUrl, variant: varLabel, status: 'skipped', reason: 'nicht verfügbar' });
        continue;
      }

      // Preis für diese Variante
      const variantPrice = await safePriceText(page);

      // ATC klicken
      const atcBtn = page.locator(atcSelector).first();
      const isEnabled = await atcBtn.isEnabled({ timeout: 3000 }).catch(() => false);

      if (!isEnabled) {
        console.log(`     ⊘ ${varLabel}: ATC Button disabled`);
        addIssue('PDP', 'ATC Button deaktiviert', `Variante "${varLabel}" – ATC Button disabled obwohl verfügbar`, 'ATC klickbar', 'Button disabled', 'High', productUrl, `1. ${productUrl}?variant=${variant.id} öffnen\n2. ATC Button Status prüfen`);
        RESULTS.atcResults.push({ url: productUrl, variant: varLabel, status: 'fail', reason: 'button disabled' });
        continue;
      }

      try {
        await atcBtn.click({ timeout: 8000 });
        await page.waitForTimeout(config.options.waitAfterATC);
        await waitForNetworkIdle(page, 2000);

        // Prüfe ob Cart-Reaktion sichtbar
        const cartDrawerOpen = await page.locator('[class*="cart-drawer"][class*="open"], [class*="cart-popup"], [aria-label*="cart"][aria-expanded="true"], [id*="cart"][class*="open"]').count() > 0;
        const redirectedToCart = page.url().includes('/cart');
        const cartCountChanged = await page.locator('[class*="cart-count"], [class*="cart__count"], [id*="cart-count"]').first().innerText({ timeout: 2000 }).catch(() => '');

        const atcSuccess = cartDrawerOpen || redirectedToCart || cartCountChanged !== '0';

        if (atcSuccess) {
          console.log(`     ✓ ${varLabel}: ATC erfolgreich (Preis: ${variantPrice || '?'})`);
          RESULTS.atcResults.push({ url: productUrl, variant: varLabel, status: 'pass', price: variantPrice });
        } else {
          console.log(`     ✗ ${varLabel}: keine Cart-Reaktion`);
          addIssue('PDP', 'ATC ohne Reaktion', `Variante "${varLabel}" – kein Cart-Feedback nach ATC`, 'Cart-Drawer öffnet oder Redirect', 'Keine Reaktion sichtbar', 'Medium', productUrl,
            `1. ${productUrl}?variant=${variant.id} öffnen\n2. ATC klicken\n3. Keine Cart-Reaktion beobachtet`);
          RESULTS.atcResults.push({ url: productUrl, variant: varLabel, status: 'warn', reason: 'keine cart-reaktion' });
        }

        // Cart-Drawer schließen falls offen (für nächsten Test)
        if (cartDrawerOpen) {
          await page.keyboard.press('Escape');
          await page.waitForTimeout(500);
        }

      } catch (e) {
        console.log(`     ✗ ${varLabel}: ATC-Fehler – ${e.message?.slice(0,50)}`);
        addIssue('PDP', 'ATC Fehler', `Variante "${varLabel}" – Fehler beim Klick`, 'ATC erfolgreich', e.message?.slice(0,80), 'High', productUrl);
        RESULTS.atcResults.push({ url: productUrl, variant: varLabel, status: 'fail', reason: e.message?.slice(0,50) });
      }
    }

    RESULTS.variantsTested += variantsToTest.length;
  }

  // Console Errors sammeln
  RESULTS.consoleErrors.push(...consoleErrors.map(e => ({ ...e, page: 'PDP' })));

  const atcPass = RESULTS.atcResults.filter(r => r.status === 'pass').length;
  const atcFail = RESULTS.atcResults.filter(r => r.status === 'fail').length;
  console.log(`\n  ATC Ergebnisse: ✓ ${atcPass} bestanden · ✗ ${atcFail} fehlgeschlagen\n`);
});

// ── SCHRITT 3: WARENKORB ───────────────────────────────
test('Schritt 3: Warenkorb prüfen', async ({ page }) => {
  await applyStealthPatches(page);

  // Erstes verfügbares Produkt in Cart legen
  const firstProduct = crawledData.productUrls[0];
  if (firstProduct) {
    try {
      await page.goto(firstProduct, { waitUntil: 'domcontentloaded', timeout: 20000 });
      await page.waitForTimeout(2000);
      const atcBtn = page.locator('button[name="add"], button:has-text("Add to cart"), button:has-text("In den Warenkorb")').first();
      if (await atcBtn.count() > 0 && await atcBtn.isEnabled()) {
        await atcBtn.click({ timeout: 8000 });
        await page.waitForTimeout(config.options.waitAfterATC);
      }
    } catch {}
  }

  await page.goto(`${BASE}/cart`, { waitUntil: 'domcontentloaded', timeout: 20000 });
  await page.waitForTimeout(config.options.waitAfterLoad);

  // Cart-Bilder prüfen
  const cartImages = await page.locator('[class*="cart__item"] img, [class*="cart-item"] img, [class*="line-item"] img').all();
  for (const img of cartImages.slice(0, 10)) {
    const loaded = await img.evaluate(el => el.naturalWidth > 0).catch(() => false);
    const src = await img.getAttribute('src').catch(() => '') || '';
    if (!loaded) {
      addIssue('Cart', 'Cart-Bild lädt nicht', 'Produktbild im Warenkorb kaputt', 'Bild lädt korrekt', src.slice(0, 80), 'High', `${BASE}/cart`);
      await page.screenshot({ path: 'reports/error-cart-broken-image.png' });
    }
  }

  // Preise im Cart
  const cartPrices = await page.locator('[class*="price"]:visible, [class*="money"]:visible').allInnerTexts().catch(() => []);
  const badPrices = cartPrices.filter(p => p.includes('NaN') || p === '€0,00' || p === '$0.00');
  if (badPrices.length > 0) addIssue('Cart', 'Fehlerhafte Preise im Cart', badPrices.join(', '), 'Korrekte Preise', badPrices.join(', '), 'Critical', `${BASE}/cart`);

  // Mengenänderung
  const qtyInput = page.locator('input[type="number"][name*="quantity"], input[type="number"][class*="quantity"], [class*="quantity__input"]').first();
  if (await qtyInput.count() > 0) {
    try {
      await qtyInput.fill('2');
      await page.waitForTimeout(1500);
      await waitForNetworkIdle(page, 2000);
      console.log('  ✓ Mengenänderung erfolgreich');
    } catch {
      addIssue('Cart', 'Mengenänderung fehlgeschlagen', 'Qty-Feld nicht bearbeitbar', 'Menge änderbar', 'Fehler beim Ändern', 'Medium', `${BASE}/cart`);
    }
  }

  // Rabattcode-Feld
  const discountInput = await page.locator('input[name*="discount"], input[placeholder*="discount"], input[placeholder*="Rabatt"], input[id*="discount"], input[name*="coupon"]').count();
  if (discountInput === 0) addIssue('Cart', 'Rabattcode-Feld fehlt', 'Kein Discount-Input im Cart', 'Rabattcode-Eingabe vorhanden', 'Fehlt', 'Low', `${BASE}/cart`);

  // Checkout-Button
  const checkoutBtn = await page.locator('button[name="checkout"], input[name="checkout"], a[href*="checkout"], button:has-text("Checkout"), button:has-text("Zur Kasse")').count();
  if (checkoutBtn === 0) addIssue('Cart', 'Checkout-Button fehlt', 'Kein Checkout-Button', 'Checkout-Button vorhanden', 'Fehlt', 'Critical', `${BASE}/cart`,
    '1. Produkt in Cart legen\n2. /cart öffnen\n3. Kein Checkout-Button sichtbar');

  // Custom Checks (Cart)
  for (const cc of (config.customChecks || []).filter(c => c.area === 'cart')) {
    try {
      const result = await cc.check(page);
      if (!result.passed) {
        addIssue('Cart (Custom)', cc.name, cc.description, cc.description, result.hint || 'Check fehlgeschlagen', cc.severity, `${BASE}/cart`,
          `1. Produkt in Cart legen\n2. /cart öffnen\n3. ${cc.description}`);
        await page.screenshot({ path: `reports/error-custom-${cc.name.replace(/\s+/g,'-').toLowerCase()}.png` });
      } else {
        console.log(`  ✓ Custom Check: ${cc.name}`);
      }
    } catch (e) {
      addIssue('Cart (Custom)', cc.name, `Check-Fehler: ${e.message?.slice(0,60)}`, 'Check ausführbar', e.message?.slice(0,60), cc.severity, `${BASE}/cart`);
    }
  }
});

// ── SCHRITT 4: CHECKOUT ────────────────────────────────
test('Schritt 4: Checkout-Flow', async ({ page }) => {
  if (!config.checkout?.enabled) {
    console.log('  ⚠ Checkout-Test deaktiviert (checkout.enabled = false in qa.config.js)');
    return;
  }

  await applyStealthPatches(page);
  const td = config.checkout.testData;

  // Produkt in Cart → Checkout
  const firstProduct = crawledData.productUrls[0];
  if (!firstProduct) { console.log('  ⚠ Kein Produkt für Checkout-Test'); return; }

  try {
    await page.goto(firstProduct, { waitUntil: 'domcontentloaded', timeout: 20000 });
    await page.waitForTimeout(2000);
    const atcBtn = page.locator('button[name="add"], button:has-text("Add to cart"), button:has-text("In den Warenkorb")').first();
    if (await atcBtn.count() > 0 && await atcBtn.isEnabled()) {
      await atcBtn.click({ timeout: 8000 });
      await page.waitForTimeout(config.options.waitAfterATC);
    }
  } catch (e) {
    addIssue('Checkout', 'Produkt konnte nicht in Cart gelegt werden', e.message?.slice(0,60), 'ATC erfolgreich', e.message?.slice(0,60), 'Critical', firstProduct);
    return;
  }

  // Zum Cart
  await page.goto(`${BASE}/cart`, { waitUntil: 'domcontentloaded', timeout: 20000 });
  await page.waitForTimeout(2000);

  // Checkout klicken
  const checkoutBtn = page.locator('button[name="checkout"], input[name="checkout"], a[href*="checkout"], button:has-text("Checkout"), button:has-text("Zur Kasse")').first();
  if (await checkoutBtn.count() === 0) {
    addIssue('Checkout', 'Checkout-Button fehlt', 'Kein Checkout-Button im Cart', 'Button vorhanden', 'Fehlt', 'Critical', `${BASE}/cart`);
    return;
  }

  await checkoutBtn.click({ timeout: 8000 });
  await page.waitForTimeout(5000);
  await waitForNetworkIdle(page, 3000);

  const checkoutUrl = page.url();
  const onCheckout = checkoutUrl.includes('checkout') || checkoutUrl.includes('/checkouts/');
  RESULTS.checkoutResults.push({ step: 'reached', success: onCheckout, url: checkoutUrl });

  if (!onCheckout) {
    addIssue('Checkout', 'Checkout nicht geladen', 'Redirect zum Checkout fehlgeschlagen', 'Shopify Checkout URL', checkoutUrl, 'Critical', `${BASE}/cart`,
      '1. Produkt in Cart\n2. /cart öffnen\n3. Checkout-Button klicken');
    return;
  }

  console.log(`\n  ✓ Checkout erreicht: ${checkoutUrl.slice(0, 60)}...`);
  await page.screenshot({ path: 'reports/checkout-reached.png' });

  // ── Checkout Formular ─────────────────────────────────
  // Email
  const emailField = page.locator('input[type="email"], input[name*="email"], #email').first();
  if (await emailField.count() > 0) {
    try {
      await emailField.fill(td.email, { timeout: 5000 });
      console.log('  ✓ E-Mail eingetragen');
      RESULTS.checkoutResults.push({ step: 'email', success: true });
    } catch {
      addIssue('Checkout', 'E-Mail Feld nicht ausfüllbar', 'E-Mail-Input nicht interaktiv', 'Feld ausfüllbar', 'Fehler', 'High', checkoutUrl);
    }
  } else {
    addIssue('Checkout', 'E-Mail Feld fehlt', 'Kein E-Mail-Feld im Checkout', 'E-Mail-Eingabe', 'Fehlt', 'High', checkoutUrl);
  }

  // Continue Button (falls vorhanden – z.B. Shopify 2-step)
  const continueBtn = page.locator('button:has-text("Continue"), button:has-text("Weiter"), button[data-trekkie-id="continue_to_shipping"]').first();
  if (await continueBtn.count() > 0) {
    try {
      await continueBtn.click({ timeout: 5000 });
      await page.waitForTimeout(3000);
    } catch {}
  }

  // Adressfelder
  const fieldMap = [
    ['input[name="firstName"], input[id*="firstName"], input[autocomplete="given-name"]',  td.firstName, 'Vorname'],
    ['input[name="lastName"],  input[id*="lastName"],  input[autocomplete="family-name"]', td.lastName,  'Nachname'],
    ['input[name="address1"],  input[id*="address1"],  input[autocomplete="address-line1"]',td.address,  'Adresse'],
    ['input[name="city"],      input[id*="city"],      input[autocomplete="address-level2"]',td.city,    'Stadt'],
    ['input[name="zip"],       input[id*="zip"],       input[autocomplete="postal-code"]',  td.zip,      'PLZ'],
  ];

  let filledFields = 0;
  for (const [selector, value, label] of fieldMap) {
    const field = page.locator(selector).first();
    if (await field.count() > 0 && await field.isVisible().catch(() => false)) {
      try {
        await field.fill(value, { timeout: 3000 });
        filledFields++;
      } catch {
        addIssue('Checkout', `Feld nicht ausfüllbar: ${label}`, `${label}-Feld reagiert nicht`, 'Feld ausfüllbar', 'Fehler', 'Medium', checkoutUrl);
      }
    }
  }
  console.log(`  ✓ ${filledFields}/${fieldMap.length} Adressfelder ausgefüllt`);
  RESULTS.checkoutResults.push({ step: 'address_fields', success: true, filled: filledFields });

  await page.screenshot({ path: 'reports/checkout-form-filled.png' });
  await page.waitForTimeout(1000);

  // Continue to Shipping
  const shippingBtn = page.locator('button:has-text("Continue to shipping"), button:has-text("Weiter zum Versand"), button[data-trekkie-id="continue_to_shipping"]').first();
  if (await shippingBtn.count() > 0 && await shippingBtn.isEnabled().catch(() => false)) {
    try {
      await shippingBtn.click({ timeout: 8000 });
      await page.waitForTimeout(4000);
      await waitForNetworkIdle(page, 3000);

      const onShipping = page.url().includes('shipping') || page.url().includes('delivery');
      if (onShipping) {
        console.log('  ✓ Shipping-Schritt erreicht');
        RESULTS.checkoutResults.push({ step: 'shipping', success: true });
        await page.screenshot({ path: 'reports/checkout-shipping.png' });

        // Versandoptionen vorhanden?
        const shippingOptions = await page.locator('[class*="shipping-method"], [class*="delivery-method"], input[type="radio"][name*="shipping"]').count();
        if (shippingOptions === 0) addIssue('Checkout', 'Keine Versandoptionen', 'Keine Versandmethoden sichtbar', 'Mind. 1 Versandoption', '0 Optionen', 'High', page.url());
        else console.log(`  ✓ ${shippingOptions} Versandoption(en) gefunden`);

        // Continue to Payment
        const paymentBtn = page.locator('button:has-text("Continue to payment"), button:has-text("Weiter zur Zahlung"), button[data-trekkie-id="continue_to_payment"]').first();
        if (await paymentBtn.count() > 0 && await paymentBtn.isEnabled().catch(() => false)) {
          await paymentBtn.click({ timeout: 8000 });
          await page.waitForTimeout(4000);
          await waitForNetworkIdle(page, 3000);

          const onPayment = page.url().includes('payment') || page.url().includes('pay');
          if (onPayment) {
            console.log('  ✓ Payment-Schritt erreicht');
            RESULTS.checkoutResults.push({ step: 'payment', success: true });
            await page.screenshot({ path: 'reports/checkout-payment.png' });

            // Bezahlmethoden
            const paymentMethods = await page.locator('[class*="payment-method"], [data-payment-method], input[type="radio"][name*="payment"]').count();
            if (paymentMethods === 0) addIssue('Checkout', 'Keine Bezahlmethoden', 'Keine Zahlungsoptionen sichtbar', 'Mind. 1 Bezahlmethode', '0 gefunden', 'High', page.url());
            else console.log(`  ✓ ${paymentMethods} Bezahlmethode(n) sichtbar`);
          }
        }
      }
    } catch (e) {
      addIssue('Checkout', 'Shipping-Schritt Fehler', e.message?.slice(0,80), 'Shipping-Schritt erreichbar', e.message?.slice(0,80), 'High', checkoutUrl);
    }
  }

  console.log('\n  ✓ Checkout-Test abgeschlossen (vor Zahlung gestoppt)\n');
});

// ── TEARDOWN: REPORT SPEICHERN ─────────────────────────
test.afterAll(async () => {
  if (!fs.existsSync('reports')) fs.mkdirSync('reports', { recursive: true });

  const cnt = { c:0, h:0, m:0, l:0 };
  RESULTS.issues.forEach(i => {
    if(i.severity==='Critical')cnt.c++;
    else if(i.severity==='High')cnt.h++;
    else if(i.severity==='Medium')cnt.m++;
    else cnt.l++;
  });

  const atcPass = RESULTS.atcResults.filter(r => r.status === 'pass').length;
  const atcFail = RESULTS.atcResults.filter(r => r.status === 'fail').length;
  const atcWarn = RESULTS.atcResults.filter(r => r.status === 'warn').length;

  // JSON
  fs.writeFileSync('reports/qa-results.json', JSON.stringify(RESULTS, null, 2), 'utf8');

  // Markdown
  const md = buildMarkdownReport(RESULTS, cnt, atcPass, atcFail);
  fs.writeFileSync('reports/qa-report.md', md, 'utf8');

  // Console Summary
  console.log('\n' + '═'.repeat(55));
  console.log(`  QA Report – ${config.client}`);
  console.log('─'.repeat(55));
  console.log(`  Produkte gecrawlt:   ${RESULTS.productsCrawled}`);
  console.log(`  Varianten getestet:  ${RESULTS.variantsTested}`);
  console.log(`  ATC ✓ Bestanden:     ${atcPass}`);
  console.log(`  ATC ✗ Fehlgeschlagen:${atcFail}`);
  console.log('─'.repeat(55));
  console.log(`  🔴 Critical:  ${cnt.c}`);
  console.log(`  🟡 High:      ${cnt.h}`);
  console.log(`  🔵 Medium:    ${cnt.m}`);
  console.log(`  ⚪ Low:       ${cnt.l}`);
  console.log('─'.replace('-','─').repeat(55));
  console.log(`  Reports:  reports/qa-report.md`);
  console.log(`  Traces:   npx playwright show-trace test-results/**/trace.zip`);
  console.log(`  HTML:     npx playwright show-report`);
  console.log('═'.repeat(55) + '\n');
});

function buildMarkdownReport(r, cnt, atcPass, atcFail) {
  const d = new Date().toLocaleDateString('de-DE', { day:'2-digit', month:'long', year:'numeric' });
  return `# QA Report – ${r.client}
**Datum:** ${d}  |  **URL:** ${r.url}  |  **Plattform:** ${r.platform}

---

## Executive Summary

| | |
|---|---|
| Produkte gecrawlt | ${r.productsCrawled} |
| Varianten getestet | ${r.variantsTested} |
| ATC ✓ Bestanden | ${atcPass} |
| ATC ✗ Fehlgeschlagen | ${atcFail} |
| 🔴 Critical | ${cnt.c} |
| 🟡 High | ${cnt.h} |
| 🔵 Medium | ${cnt.m} |
| ⚪ Low | ${cnt.l} |
| **Bewertung** | **${cnt.c > 0 ? '🔴 KRITISCH' : cnt.h > 0 ? '🟡 BEDENKLICH' : '🟢 GUT'}** |

---

## ATC-Ergebnisse (pro Variante)

| Produkt | Variante | Status | Preis |
|---------|----------|--------|-------|
${r.atcResults.map(a => `| ${a.url.replace(r.url,'')} | ${a.variant} | ${a.status === 'pass' ? '✅' : a.status === 'fail' ? '❌' : a.status === 'warn' ? '⚠️' : '⊘'} ${a.status} | ${a.price || '—'} |`).join('\n')}

---

## Checkout-Flow

${r.checkoutResults.map(c => `- **${c.step}:** ${c.success ? '✅' : '❌'} ${c.url || ''}`).join('\n')}

---

## Issues nach Bereich

${['Allgemein','Homepage','Collection','PDP','Cart','Cart (Custom)','Checkout'].map(area => {
  const issues = r.issues.filter(i => i.area === area);
  if (!issues.length) return `### ${area}\n_Keine Fehler_ ✅`;
  return `### ${area}\n\n| Typ | Beschreibung | Erwartet | Tatsächlich | Severity | URL |\n|-----|-------------|----------|-------------|----------|-----|\n` +
    issues.map(i => `| ${i.type} | ${i.description} | ${i.expected} | ${i.actual} | ${i.severity} | ${i.url?.replace(r.url,'') || ''} |`).join('\n');
}).join('\n\n')}

---

## Priorisierte To-do-Liste

${r.issues
  .sort((a,b) => ['Critical','High','Medium','Low'].indexOf(a.severity) - ['Critical','High','Medium','Low'].indexOf(b.severity))
  .map((i, n) => `${n+1}. **[${i.severity}] ${i.type}** (${i.area})  \n   ${i.description}  \n   _${i.url}_`)
  .join('\n\n')}

---
_Report generiert am ${d} · QA Agent v2.0_`;
}
