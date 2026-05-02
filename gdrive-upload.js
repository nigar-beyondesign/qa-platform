// gdrive-upload.js
// Lädt Playwright-Videos nach jedem Test-Run zu Google Drive hoch.
// Ordnerstruktur: Meine Ablage/QA-Videos/[kunde]/[timestamp]/
//
// Setup (einmalig):
//   1. Google Cloud Console → neues Projekt → Drive API aktivieren
//   2. OAuth2 Credentials (Desktop App) erstellen → als credentials/oauth2.json speichern
//   3. Beim ersten Aufruf: Browser öffnet sich für Autorisierung

const { google } = require('googleapis');
const fs   = require('fs');
const path = require('path');
const http = require('http');
const url  = require('url');

const CREDENTIALS_PATH = path.join(__dirname, 'credentials', 'oauth2.json');
const TOKEN_PATH       = path.join(__dirname, 'credentials', 'gdrive-token.json');
const SCOPES           = ['https://www.googleapis.com/auth/drive.file'];

function getOAuth2Client() {
  if (!fs.existsSync(CREDENTIALS_PATH)) {
    throw new Error(
      'credentials/oauth2.json nicht gefunden.\n' +
      'Bitte OAuth2-Credentials aus Google Cloud Console herunterladen\n' +
      'und als credentials/oauth2.json speichern.'
    );
  }
  const creds = JSON.parse(fs.readFileSync(CREDENTIALS_PATH, 'utf8'));
  const { client_id, client_secret, redirect_uris } = creds.installed || creds.web;
  return new google.auth.OAuth2(client_id, client_secret, redirect_uris[0]);
}

async function authorize() {
  const auth = getOAuth2Client();

  if (fs.existsSync(TOKEN_PATH)) {
    const token = JSON.parse(fs.readFileSync(TOKEN_PATH, 'utf8'));
    auth.setCredentials(token);

    // Token erneuern falls abgelaufen
    if (token.expiry_date && token.expiry_date < Date.now()) {
      try {
        const { credentials } = await auth.refreshAccessToken();
        auth.setCredentials(credentials);
        fs.writeFileSync(TOKEN_PATH, JSON.stringify(credentials));
      } catch (e) {
        console.log('  ⚠ Token-Erneuerung fehlgeschlagen, bitte neu autorisieren.');
        fs.unlinkSync(TOKEN_PATH);
        return authorize();
      }
    }
    return auth;
  }

  // Erster Start: OAuth-Flow via lokalem HTTP-Server
  return new Promise((resolve, reject) => {
    const server = http.createServer(async (req, res) => {
      const qs = new url.URL(req.url, 'http://localhost:3333').searchParams;
      const code = qs.get('code');
      if (!code) { res.end('Kein Code.'); return; }

      res.end('<h2>Autorisierung erfolgreich! Du kannst diesen Tab schließen.</h2>');
      server.close();

      try {
        const { tokens } = await auth.getToken(code);
        auth.setCredentials(tokens);
        fs.writeFileSync(TOKEN_PATH, JSON.stringify(tokens));
        console.log('  ✓ Google Drive autorisiert – Token gespeichert.');
        resolve(auth);
      } catch (e) {
        reject(e);
      }
    });

    server.listen(3333, () => {
      const authUrl = auth.generateAuthUrl({ access_type: 'offline', scope: SCOPES });
      console.log('\n  ═══════════════════════════════════════════════');
      console.log('  Google Drive – Einmalige Autorisierung nötig');
      console.log('  Öffne diese URL im Browser:');
      console.log(`\n  ${authUrl}\n`);
      console.log('  ═══════════════════════════════════════════════\n');

      // Automatisch öffnen auf Mac
      try {
        require('child_process').execSync(`open "${authUrl}"`);
      } catch {}
    });
  });
}

async function getOrCreateFolder(drive, parentId, name) {
  const res = await drive.files.list({
    q: `name='${name}' and '${parentId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`,
    fields: 'files(id)',
    spaces: 'drive',
  });
  if (res.data.files.length > 0) return res.data.files[0].id;

  const folder = await drive.files.create({
    requestBody: {
      name,
      mimeType: 'application/vnd.google-apps.folder',
      parents: [parentId],
    },
    fields: 'id',
  });
  return folder.data.id;
}

async function uploadVideos(clientKey, timestamp) {
  const testResultsDir = path.join(__dirname, 'test-results');
  if (!fs.existsSync(testResultsDir)) {
    console.log('  ⚠ Kein test-results Ordner – keine Videos vorhanden.');
    return false;
  }

  // Alle video.webm Dateien im test-results Ordner finden
  const videos = [];
  const entries = fs.readdirSync(testResultsDir);
  for (const entry of entries) {
    const videoPath = path.join(testResultsDir, entry, 'video.webm');
    if (fs.existsSync(videoPath)) {
      videos.push({ path: videoPath, testName: entry });
    }
  }

  if (videos.length === 0) {
    console.log('  ℹ Keine Videos in test-results (Videos werden nur bei Fehlern aufgezeichnet).');
    return false;
  }

  console.log(`\n  ↑ Lade ${videos.length} Video(s) zu Google Drive hoch...`);

  let auth;
  try {
    auth = await authorize();
  } catch (e) {
    console.log(`  ✗ Google Drive Auth fehlgeschlagen: ${e.message}`);
    return false;
  }

  const drive = google.drive({ version: 'v3', auth });

  try {
    // Root-Ordner: "QA-Videos" in "Meine Ablage"
    const rootId = await getOrCreateFolder(drive, 'root', 'QA-Videos');

    // Unterordner: [clientKey]
    const clientFolderId = await getOrCreateFolder(drive, rootId, clientKey);

    // Unterordner: [timestamp]
    const ts = timestamp || new Date().toISOString().slice(0, 19).replace(/:/g, '-');
    const runFolderId = await getOrCreateFolder(drive, clientFolderId, ts);

    for (const video of videos) {
      const filename = video.testName.slice(0, 60).replace(/[^a-zA-Z0-9-_äöüÄÖÜ ]/g, '') + '.webm';
      await drive.files.create({
        requestBody: {
          name: filename,
          parents: [runFolderId],
        },
        media: {
          mimeType: 'video/webm',
          body: fs.createReadStream(video.path),
        },
        fields: 'id,name',
      });
      console.log(`  ✓ Video hochgeladen: ${filename}`);
    }

    console.log(`  ✓ Alle Videos in Google Drive → QA-Videos/${clientKey}/${ts}/`);
    return true;
  } catch (e) {
    console.log(`  ✗ Google Drive Upload fehlgeschlagen: ${e.message}`);
    return false;
  }
}

module.exports = { uploadVideos };
