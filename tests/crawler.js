// tests/crawler.js
// Crawlt automatisch alle Collections und Produkte eines Shopify-Stores.
// Keine manuelle Konfiguration nötig.

const config = require('../qa.config.js');

/**
 * Entdeckt alle Collection-URLs des Shops automatisch.
 */
async function discoverCollections(page, baseUrl) {
  console.log('\n  📂 Crawle Collections...');
  const collections = new Set();

  try {
    // Methode 1: Navigation / Header Links
    await page.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(config.options.waitAfterLoad);

    const navLinks = await page.evaluate((base) => {
      return Array.from(document.querySelectorAll('a[href*="/collections/"]'))
        .map(a => a.href)
        .filter(href =>
          href.includes('/collections/') &&
          !href.endsWith('/collections') &&
          !href.includes('?') &&
          !href.includes('#')
        )
        .filter((v, i, arr) => arr.indexOf(v) === i);
    }, baseUrl);

    navLinks.forEach(l => collections.add(l));
    console.log(`     Navigation: ${navLinks.length} Collections gefunden`);

    // Methode 2: /collections/all als Fallback
    if (collections.size === 0) {
      collections.add(`${baseUrl}/collections/all`);
    }

    // Filter: Exclude-URLs aus Config
    const excludes = config.crawl?.excludeUrls || [];
    const filtered = [...collections].filter(url =>
      !excludes.some(ex => url.includes(ex))
    );

    console.log(`     Gesamt: ${filtered.length} Collections`);
    return filtered;

  } catch (e) {
    console.log(`     ⚠ Collections-Crawl Fehler: ${e.message?.slice(0,60)}`);
    return [`${baseUrl}/collections/all`];
  }
}

/**
 * Entdeckt alle Produkt-URLs aus einer Collection.
 */
async function discoverProductsFromCollection(page, collectionUrl) {
  const products = new Set();

  try {
    await page.goto(collectionUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(config.options.waitAfterLoad);

    // Scroll um Lazy-Load zu triggern
    await autoScroll(page);

    // Alle Produkt-Links sammeln
    const links = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('a[href*="/products/"]'))
        .map(a => a.href)
        .filter(href => !href.includes('?') || href.includes('/products/'))
        .map(href => href.split('?')[0]) // Query-Parameter entfernen
        .filter((v, i, arr) => arr.indexOf(v) === i);
    });

    links.forEach(l => products.add(l));

    // Pagination: Nächste Seite laden falls vorhanden
    let page_num = 2;
    while (page_num <= 10) {
      const nextBtn = page.locator('[rel="next"], a:has-text("Next"), a:has-text("Weiter"), .pagination__next, button:has-text("Load more"), button:has-text("Mehr laden")').first();
      const hasNext = await nextBtn.count() > 0;
      if (!hasNext) break;

      try {
        await nextBtn.click({ timeout: 5000 });
        await page.waitForTimeout(2000);
        await autoScroll(page);

        const newLinks = await page.evaluate(() => {
          return Array.from(document.querySelectorAll('a[href*="/products/"]'))
            .map(a => a.href.split('?')[0])
            .filter((v, i, arr) => arr.indexOf(v) === i);
        });
        newLinks.forEach(l => products.add(l));
        page_num++;
      } catch { break; }
    }

  } catch (e) {
    console.log(`     ⚠ Crawl-Fehler für ${collectionUrl}: ${e.message?.slice(0,60)}`);
  }

  return [...products];
}

/**
 * Entdeckt alle Varianten eines Produkts.
 */
async function discoverVariants(page, productUrl) {
  try {
    await page.goto(productUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(config.options.waitAfterLoad);

    const variants = await page.evaluate(() => {
      // Methode 1: Shopify product JSON
      const productJson = window.ShopifyAnalytics?.meta?.product ||
                          window.__st?.p ||
                          null;
      if (productJson?.variants) {
        return productJson.variants.map(v => ({
          id:        v.id,
          title:     v.title,
          available: v.available,
          price:     v.price,
        }));
      }

      // Methode 2: Aus dem DOM lesen (select oder radio buttons)
      const select = document.querySelector('select[name="id"]');
      if (select) {
        return Array.from(select.options).map(opt => ({
          id:        opt.value,
          title:     opt.text,
          available: !opt.disabled,
          price:     null,
        }));
      }

      // Methode 3: JSON in Script-Tag suchen
      const scripts = Array.from(document.querySelectorAll('script:not([src])'));
      for (const script of scripts) {
        const text = script.textContent;
        if (text.includes('"variants"') && text.includes('"id"')) {
          try {
            const match = text.match(/var\s+\w+\s*=\s*(\{.*"variants".*?\});/s) ||
                          text.match(/(\{"id":\d+.*?"variants":\[.*?\]\})/s);
            if (match) {
              const data = JSON.parse(match[1]);
              if (data.variants) return data.variants.map(v => ({
                id: v.id, title: v.title, available: v.available, price: v.price
              }));
            }
          } catch {}
        }
      }

      // Fallback: Keine Varianten erkannt – als single Variant behandeln
      return [{ id: null, title: 'Default', available: true, price: null }];
    });

    return variants;

  } catch (e) {
    return [{ id: null, title: 'Default', available: true, price: null }];
  }
}

/**
 * Auto-Scroll um Lazy-Loading zu triggern.
 */
async function autoScroll(page) {
  await page.evaluate(async () => {
    await new Promise(resolve => {
      let totalHeight = 0;
      const distance = 400;
      const timer = setInterval(() => {
        window.scrollBy(0, distance);
        totalHeight += distance;
        if (totalHeight >= Math.min(document.body.scrollHeight, 8000)) {
          clearInterval(timer);
          window.scrollTo(0, 0);
          resolve();
        }
      }, 80);
    });
  });
}

/**
 * Haupt-Crawl-Funktion: Gibt alle Produkte mit Varianten zurück.
 */
async function crawlShop(page, baseUrl) {
  console.log(`\n🕷  Starte Auto-Crawl für ${baseUrl}...`);

  const maxProducts = config.crawl?.maxProducts || 20;
  const configCollections = config.crawl?.collections || [];

  // Collections entdecken
  let collectionUrls;
  if (configCollections.length > 0) {
    collectionUrls = configCollections.map(c => c.startsWith('http') ? c : baseUrl + c);
    console.log(`  📂 Nutze konfigurierte Collections: ${collectionUrls.length}`);
  } else {
    collectionUrls = await discoverCollections(page, baseUrl);
  }

  // Produkte aus allen Collections sammeln
  const allProductUrls = new Set();
  for (const collUrl of collectionUrls) {
    const products = await discoverProductsFromCollection(page, collUrl);
    products.forEach(p => allProductUrls.add(p));
    console.log(`  📦 ${collUrl.split('/').pop()}: ${products.length} Produkte`);
    if (maxProducts > 0 && allProductUrls.size >= maxProducts) break;
  }

  let productUrls = [...allProductUrls];
  if (maxProducts > 0) productUrls = productUrls.slice(0, maxProducts);

  console.log(`\n  ✓ Gesamt entdeckt: ${productUrls.length} Produkte aus ${collectionUrls.length} Collections\n`);

  return { collectionUrls, productUrls };
}

module.exports = { crawlShop, discoverVariants, discoverCollections, autoScroll };
