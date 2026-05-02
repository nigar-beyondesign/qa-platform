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
 * Wird auf der bereits geladenen Seite ausgeführt – keine erneute Navigation.
 */
async function discoverVariants(page, productUrl) {
  try {
    const variants = await page.evaluate(async (url) => {
      // Methode 1: Shopify product JSON API – zuverlässigste Quelle
      try {
        const handle = url.split('/products/')[1]?.split('?')[0];
        if (handle) {
          const res = await fetch(`/products/${handle}.js`);
          if (res.ok) {
            const data = await res.json();
            if (data.variants?.length) {
              return data.variants.map(v => ({
                id:        v.id,
                title:     v.title || v.option1,
                available: v.available,
                price:     v.price,
                options:   [v.option1, v.option2, v.option3].filter(Boolean),
              }));
            }
          }
        }
      } catch {}

      // Methode 2: DOM select – cross-reference DOM für Availability
      const select = document.querySelector('select[name="id"]');
      if (select) {
        return Array.from(select.options).map(opt => ({
          id:        opt.value,
          title:     opt.text.trim(),
          available: !opt.disabled,
          price:     null,
          options:   [opt.text.trim()],
        }));
      }

      // Methode 3: ShopifyAnalytics mit korrektem Feldnamen
      const productJson = window.ShopifyAnalytics?.meta?.product;
      if (productJson?.variants?.length) {
        const availMap = {};
        document.querySelectorAll('select[name="id"] option').forEach(o => {
          availMap[o.value] = !o.disabled;
        });
        return productJson.variants.map(v => ({
          id:        v.id,
          title:     v.public_title || v.title || v.name,
          available: availMap[String(v.id)] ?? true,
          price:     v.price,
          options:   [v.public_title || v.title || v.name],
        }));
      }

      return [{ id: null, title: 'Default', available: true, price: null, options: [] }];
    }, productUrl);

    return variants;

  } catch (e) {
    return [{ id: null, title: 'Default', available: true, price: null, options: [] }];
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
