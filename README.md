# QA Platform – Setup & Railway Deploy

---

## Teil 1: Railway deployen (einmalig, ~10 Minuten)

### Schritt 1: GitHub Account
Falls noch nicht vorhanden: https://github.com → kostenloses Konto erstellen.

### Schritt 2: Neues Repository anlegen
1. https://github.com/new aufrufen
2. Name: `qa-platform`
3. Private auswählen
4. "Create repository" klicken

### Schritt 3: Dateien hochladen
Im neuen Repository auf "uploading an existing file" klicken und diese Dateien hochladen:
- `server.js`
- `package.json`
- `public/index.html`  (Ordner "public" anlegen)

### Schritt 4: Railway Account
1. https://railway.app → "Start a New Project"
2. Mit GitHub einloggen
3. "Deploy from GitHub repo" → dein `qa-platform` Repository auswählen
4. Railway deployt automatisch

### Schritt 5: API Secret setzen
Im Railway Dashboard → dein Projekt → "Variables" → neue Variable:
```
API_SECRET = mein-geheimes-passwort-123
```
(Beliebiges Passwort wählen – merken für Schritt 7!)

### Schritt 6: Deine URL notieren
Railway zeigt dir eine URL wie:
```
https://qa-platform-production-xxxx.up.railway.app
```
Diese URL im Browser öffnen → Dashboard erscheint ✓

---

## Teil 2: Lokales Setup (einmalig)

```bash
cd qa-platform
npm install
npm run setup     # installiert Playwright-Browser
```

### Schritt 7: Railway-URL eintragen
Datei `upload-report.js` öffnen (TextEdit) und diese zwei Zeilen anpassen:
```js
const RAILWAY_URL = 'https://qa-platform-production-xxxx.up.railway.app';
const API_SECRET  = 'mein-geheimes-passwort-123';  // gleich wie in Railway Variables
```

---

## Teil 3: Tests starten (täglich)

```bash
# Einzelnen Kunden testen
node run-client.js neona

# Alle Kunden testen
node run-client.js all
```

Nach jedem Test wird der Report **automatisch zu Railway hochgeladen** und ist sofort
im Dashboard für alle sichtbar.

---

## Übersicht: Wer sieht was

| Person | Zugang |
|--------|--------|
| Du | Terminal lokal + Railway Dashboard |
| Teamkollegen | Nur Railway Dashboard (URL schicken) |
| Kunden | Nur Railway Dashboard (URL schicken) |

---

## Verfügbare Kunden-Kürzel

```
node run-client.js neona
node run-client.js healthroutine
node run-client.js pamo-de
node run-client.js pamo-com
node run-client.js livn
node run-client.js 305care
node run-client.js hautliebe
node run-client.js matratzen
node run-client.js flawluxe
node run-client.js shapedly
node run-client.js harry
node run-client.js naturbummler
node run-client.js tassenexpress
node run-client.js vetura
node run-client.js all       ← alle auf einmal
```
