// upload-report.js
// Lädt den Report nach jedem Playwright-Test automatisch zu Railway hoch.
// Wird von run-client.js automatisch aufgerufen.

const fs   = require('fs');
const path = require('path');
const http = require('https');

// ── Konfiguration ──────────────────────────────────────
// Diese zwei Werte nach dem Railway-Deploy eintragen:
const RAILWAY_URL = 'https://bd-qa.up.railway.app';
const API_SECRET  = 'irgendeinPasswort123';

async function uploadReport(clientKey, resultsPath) {
  if (!fs.existsSync(resultsPath)) {
    console.log('  ⚠ Keine Ergebnisse zum Hochladen gefunden.');
    return false;
  }

  let data;
  try {
    data = JSON.parse(fs.readFileSync(resultsPath, 'utf8'));
  } catch (e) {
    console.log(`  ⚠ Report konnte nicht gelesen werden: ${e.message}`);
    return false;
  }

  const hostname = RAILWAY_URL.replace('https://', '').replace('http://', '').replace(/\/$/, '');

  return new Promise((resolve) => {
    const body = JSON.stringify(data);

    const options = {
      hostname,
      port:    443,
      path:    `/api/upload/${clientKey}`,
      method:  'POST',
      headers: {
        'Content-Type':   'application/json',
        'Content-Length': Buffer.byteLength(body),
        'X-API-Secret':   API_SECRET,
      },
    };

    const req = http.request(options, (res) => {
      let responseData = '';
      res.on('data', chunk => responseData += chunk);
      res.on('end', () => {
        if (res.statusCode === 200) {
          console.log(`  ✓ Report hochgeladen → ${RAILWAY_URL}`);
          resolve(true);
        } else {
          console.log(`  ✗ Upload fehlgeschlagen: HTTP ${res.statusCode}`);
          resolve(false);
        }
      });
    });

    req.on('error', (e) => {
      console.log(`  ✗ Upload-Fehler: ${e.message}`);
      resolve(false);
    });

    req.setTimeout(15000, () => {
      console.log('  ✗ Upload-Timeout');
      req.destroy();
      resolve(false);
    });

    req.write(body);
    req.end();
  });
}

// Direkt aufrufen falls als Script gestartet
if (require.main === module) {
  const clientKey   = process.argv[2];
  const resultsPath = process.argv[3] || path.join(__dirname, 'reports', 'qa-results.json');

  if (!clientKey) {
    console.error('Verwendung: node upload-report.js [clientKey] [resultsPath]');
    process.exit(1);
  }

  uploadReport(clientKey, resultsPath).then(ok => process.exit(ok ? 0 : 1));
}

module.exports = { uploadReport };
