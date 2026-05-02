#!/usr/bin/env node
// run-client.js – Startet QA-Test + lädt Report zu Railway hoch

const { execSync } = require('child_process');
const fs   = require('fs');
const path = require('path');
const { uploadReport } = require('./upload-report.js');

const clients = {
  'neona':        { config: 'clients/neona.config.js',        name: 'Neona Store' },
  'healthroutine':{ config: 'clients/healthroutine.config.js', name: 'Healthroutine' },
  'pamo-de':      { config: 'clients/pamo-de.config.js',      name: 'Pamo Design (DE)' },
  'pamo-com':     { config: 'clients/pamo-com.config.js',     name: 'Pamo Design (US)' },
  'livn':         { config: 'clients/livn.config.js',         name: 'Livn Gartenhaus' },
  '305care':      { config: 'clients/305care.config.js',      name: '305care' },
  'hautliebe':    { config: 'clients/hautliebe.config.js',    name: 'Hautliebe' },
  'matratzen':    { config: 'clients/am-matratzen.config.js', name: 'AM Qualitätsmatratzen' },
  'flawluxe':     { config: 'clients/flawluxe.config.js',     name: 'Flawluxe' },
  'shapedly':     { config: 'clients/shapedly.config.js',     name: 'Shapedly' },
  'harry':        { config: 'clients/my-harry.config.js',     name: 'My Harry' },
  'naturbummler': { config: 'clients/naturbummler.config.js', name: 'Naturbummler' },
  'tassenexpress':{ config: 'clients/tassenexpress.config.js',name: 'Tassenexpress' },
  'vetura':       { config: 'clients/vetura.config.js',       name: 'Vetura' },
};

async function runClient(key, client) {
  const configSrc = path.join(__dirname, client.config);
  if (!fs.existsSync(configSrc)) {
    console.error('  ✗ Config nicht gefunden: ' + client.config);
    return false;
  }

  // Config laden
  fs.copyFileSync(configSrc, path.join(__dirname, 'qa.config.js'));
  console.log('  Config geladen: ' + client.config);

  // Report-Ordner
  const reportDir = path.join(__dirname, 'reports', key);
  fs.mkdirSync(reportDir, { recursive: true });

  // Playwright starten
  try {
    execSync('npx playwright test --reporter=json', {
      stdio: 'inherit',
      cwd:   __dirname,
      env:   Object.assign({}, process.env, { QA_CLIENT_KEY: key, FORCE_COLOR: '0' }),
    });
  } catch (e) {
    // Playwright gibt exit code != 0 wenn Tests fehlschlagen – das ist normal
  }

  // Report mit Timestamp lokal speichern
  const resultsPath = path.join(__dirname, 'reports', 'qa-results.json');
  const timestamp   = new Date().toISOString().slice(0, 19).replace(/:/g, '-');

  if (fs.existsSync(resultsPath)) {
    fs.copyFileSync(resultsPath, path.join(reportDir, timestamp + '-results.json'));
    var mdPath = path.join(__dirname, 'reports', 'qa-report.md');
    if (fs.existsSync(mdPath)) {
      fs.copyFileSync(mdPath, path.join(reportDir, timestamp + '-report.md'));
    }
    console.log('\n  ✓ Report lokal gespeichert: reports/' + key + '/');
  }

  // Zu Railway hochladen
  console.log('\n  ↑ Lade Report zu Railway hoch...');
  await uploadReport(key, resultsPath);

  return true;
}

async function main() {
  var arg = process.argv[2];

  if (!arg || arg === '--help') {
    console.log('\n🔍 QA Platform – Kunden-Runner\n');
    console.log('Verwendung:');
    console.log('  node run-client.js [kunde]   → Einzelnen Kunden testen');
    console.log('  node run-client.js all        → Alle Kunden testen\n');
    console.log('Verfügbare Kunden:');
    Object.keys(clients).forEach(function(k) {
      console.log('  ' + k.padEnd(16) + ' → ' + clients[k].name);
    });
    console.log('');
    process.exit(0);
  }

  if (arg === 'all') {
    console.log('\n🚀 Teste alle Kunden...\n');
    var keys = Object.keys(clients);
    for (var i = 0; i < keys.length; i++) {
      var key = keys[i];
      console.log('\n' + '═'.repeat(48) + '\n▶ ' + clients[key].name + '\n' + '═'.repeat(48));
      await runClient(key, clients[key]);
    }
    process.exit(0);
  }

  var client = clients[arg];
  if (!client) {
    console.error('\n✗ Unbekannter Kunde: "' + arg + '"\n  node run-client.js --help\n');
    process.exit(1);
  }

  await runClient(arg, client);
}

main();
