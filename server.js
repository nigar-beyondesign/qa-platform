// server.js – QA Platform Railway Server
// Empfängt Reports vom lokalen Mac und stellt sie im Dashboard bereit.
// Kein Playwright hier – nur Datenspeicherung + Dashboard.

const http = require('http');
const fs   = require('fs');
const path = require('path');

const PORT       = process.env.PORT || 3000;
const API_SECRET = process.env.API_SECRET || 'qa-secret-change-me';
const DATA_FILE  = path.join(__dirname, 'data', 'reports.json');

// Daten-Verzeichnis anlegen
if (!fs.existsSync(path.join(__dirname, 'data'))) {
  fs.mkdirSync(path.join(__dirname, 'data'), { recursive: true });
}

// In-Memory Store (+ Datei als Backup)
let store = { clients: {}, reports: {} };

function loadStore() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      store = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    }
  } catch { store = { clients: {}, reports: {} }; }
}

function saveStore() {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(store, null, 2));
  } catch {}
}

loadStore();

// ── Helpers ────────────────────────────────────────────
function json(res, data, status = 200) {
  res.writeHead(status, {
    'Content-Type':                'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods':'GET, POST, DELETE, OPTIONS',
    'Access-Control-Allow-Headers':'Content-Type, X-API-Secret',
  });
  res.end(JSON.stringify(data));
}

function html(res, content) {
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(content);
}

function cors(res) {
  res.writeHead(204, {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods':'GET, POST, DELETE, OPTIONS',
    'Access-Control-Allow-Headers':'Content-Type, X-API-Secret',
  });
  res.end();
}

function authOk(req) {
  return req.headers['x-api-secret'] === API_SECRET;
}

function body(req) {
  return new Promise(resolve => {
    let data = '';
    req.on('data', c => data += c);
    req.on('end', () => { try { resolve(JSON.parse(data)); } catch { resolve({}); } });
  });
}

// ── Server ─────────────────────────────────────────────
const server = http.createServer(async (req, res) => {
  const urlPath = req.url.split('?')[0];
  const method  = req.method;

  if (method === 'OPTIONS') return cors(res);

  // ── Dashboard ────────────────────────────────────────
  if (urlPath === '/' || urlPath === '/index.html') {
    const indexPath = path.join(__dirname, 'public', 'index.html');
    if (fs.existsSync(indexPath)) {
      html(res, fs.readFileSync(indexPath, 'utf8'));
    } else {
      html(res, '<h1>QA Platform</h1><p>public/index.html nicht gefunden</p>');
    }
    return;
  }

  // ── API: Clients ────────────────────────────────────
  if (urlPath === '/api/clients' && method === 'GET') {
    return json(res, Object.values(store.clients));
  }

  // ── API: Reports eines Clients ──────────────────────
  const reportsMatch = urlPath.match(/^\/api\/reports\/([^/]+)$/);
  if (reportsMatch && method === 'GET') {
    const key = reportsMatch[1];
    return json(res, (store.reports[key] || []).slice(0, 30));
  }

  // ── API: Einzelnen Report abrufen ───────────────────
  const reportMatch = urlPath.match(/^\/api\/report\/([^/]+)\/([^/]+)$/);
  if (reportMatch && method === 'GET') {
    const [, key, id] = reportMatch;
    const report = (store.reports[key] || []).find(r => r.id === id);
    return report ? json(res, report) : json(res, { error: 'not found' }, 404);
  }

  // ── API: Report hochladen (vom lokalen Mac) ─────────
  // POST /api/upload/:clientKey
  const uploadMatch = urlPath.match(/^\/api\/upload\/([^/]+)$/);
  if (uploadMatch && method === 'POST') {
    if (!authOk(req)) return json(res, { error: 'Unauthorized' }, 401);

    const key  = uploadMatch[1];
    const data = await body(req);

    if (!data.client || !data.timestamp) {
      return json(res, { error: 'Ungültige Report-Daten' }, 400);
    }

    // Client registrieren falls neu
    if (!store.clients[key]) {
      store.clients[key] = {
        key,
        name:     data.client,
        url:      data.url,
        platform: data.platform,
        schedule: data.schedule || 'mo-do',
        addedAt:  new Date().toISOString(),
      };
    }

    // Report speichern
    if (!store.reports[key]) store.reports[key] = [];

    const reportId = `${key}-${Date.now()}`;
    const report = { id: reportId, ...data, uploadedAt: new Date().toISOString() };

    store.reports[key].unshift(report);
    store.reports[key] = store.reports[key].slice(0, 50); // Max 50 pro Client

    saveStore();

    console.log(`📥 Report empfangen: ${data.client} – ${data.summary?.total || 0} Issues`);
    return json(res, { success: true, id: reportId });
  }

  // ── API: Client löschen ──────────────────────────────
  const deleteMatch = urlPath.match(/^\/api\/client\/([^/]+)$/);
  if (deleteMatch && method === 'DELETE') {
    if (!authOk(req)) return json(res, { error: 'Unauthorized' }, 401);
    const key = deleteMatch[1];
    delete store.clients[key];
    delete store.reports[key];
    saveStore();
    return json(res, { success: true });
  }

  // ── API: Markdown Report ─────────────────────────────
  const mdMatch = urlPath.match(/^\/api\/report-md\/([^/]+)\/([^/]+)$/);
  if (mdMatch && method === 'GET') {
    const [, key, id] = mdMatch;
    const report = (store.reports[key] || []).find(r => r.id === id || r.filename === id);
    if (!report) return json(res, { error: 'not found' }, 404);

    const md = buildMarkdown(report);
    res.writeHead(200, {
      'Content-Type': 'text/plain; charset=utf-8',
      'Content-Disposition': `attachment; filename="qa-report-${key}-${report.timestamp?.slice(0,10)}.md"`,
      'Access-Control-Allow-Origin': '*',
    });
    return res.end(md);
  }

  // ── Health Check ─────────────────────────────────────
  if (urlPath === '/health') {
    return json(res, { status: 'ok', clients: Object.keys(store.clients).length, uptime: process.uptime() });
  }

  res.writeHead(404); res.end('Not found');
});

function buildMarkdown(r) {
  const d  = new Date(r.timestamp).toLocaleDateString('de-DE', { day:'2-digit', month:'long', year:'numeric' });
  const s  = r.summary || {};
  const issues = r.issues || [];
  return `# QA Report – ${r.client}
**Datum:** ${d}  |  **URL:** ${r.url}  |  **Plattform:** ${r.platform}

## Summary
| | |
|---|---|
| Critical | ${s.critical || 0} |
| High | ${s.high || 0} |
| Medium | ${s.medium || 0} |
| Low | ${s.low || 0} |
| ATC ✓ | ${s.atcPass || 0} |
| ATC ✗ | ${s.atcFail || 0} |
| Status | ${r.status === 'pass' ? '✅ Bestanden' : '❌ Fehler'} |

## Issues
${issues.sort((a,b) => ['Critical','High','Medium','Low'].indexOf(a.severity) - ['Critical','High','Medium','Low'].indexOf(b.severity))
  .map(i => `### [${i.severity}] ${i.type} (${i.area})\n- **Beschreibung:** ${i.description}\n- **Erwartet:** ${i.expected}\n- **Tatsächlich:** ${i.actual}`)
  .join('\n\n')}

---
_QA Platform · ${d}_`;
}

server.listen(PORT, () => {
  console.log(`\n${'═'.repeat(40)}`);
  console.log(`  QA Platform Railway Server`);
  console.log(`  Port: ${PORT}`);
  console.log(`  Clients: ${Object.keys(store.clients).length}`);
  console.log('═'.repeat(40) + '\n');
});
