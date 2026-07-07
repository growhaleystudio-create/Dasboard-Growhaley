# Lead Generator — Google Maps Capture (MV3)

A minimal Chrome extension that:
- Sits idle until the dashboard hands it a `capture-session` payload.
- When the user clicks the extension icon on a Google Maps tab, it auto-extracts the visible business cards.
- Sends the items to the Lead Generator backend using the same `X-Google-Maps-Capture-Token` header the bookmarklet uses.
- Auto-closes when invoked from the dashboard.

## Install (local unpacked)

1. Open `chrome://extensions`.
2. Toggle **Developer mode** ON.
3. Click **Load unpacked**.
4. Select this `extension/` folder.
5. Copy the **Extension ID** that Chrome prints (looks like `abcdefghijklmnopqrstuvwxyzabcdef`).
   - For this dev setup, the known extension ID is: `hahcoepljmhmiaomolmfhbmpahnfbpep`
6. In `backend/.env`, set:
   ```
   CORS_ORIGIN=chrome-extension://hahcoepljmhmiaomolmfhbmpahnfbpep,http://localhost:3000
   ```
7. Restart the backend.

## How it works

### Dashboard → extension
The dashboard calls `window.postMessage` with a `{ type: 'leadsgen:capture-session', payload: {...} }` message. A tiny in-page bridge in the dashboard forwards it to `chrome.runtime.sendMessage` (only present when the extension is installed).

### Extension background script
- Listens for `capture-session` messages.
- Persists the session in `chrome.storage.session`.
- Opens the Google Maps search URL in a new tab if no Maps tab is focused.

### Click extension icon
- Reads the pending session from `chrome.storage.session`.
- Injects `src/content.js` into the active Google Maps tab.
- Content script extracts `{ name, address, phone, website, rating }` from each card.
- Background posts:
  - `POST /api/teams/:id/connectors/scrape/session/:sessionId/collecting`
  - `POST /api/teams/:id/connectors/scrape/session/:sessionId/results`
- Returns the summary to the popup; auto-closes the popup if it was triggered from the dashboard.

## Files

- `manifest.json` — MV3 manifest.
- `src/background.js` — service worker (compiled from `background.ts`).
- `src/content.js` — content script (compiled from `content.ts`).
- `src/popup.html` + `src/popup.js` — popup UI.
- `src/lib/scraper.js` — DOM extraction logic.
- `src/assets/icon-*.png` — toolbar icons (placeholder, drop your own).
- `src/scrape-session.d.ts` — type declarations for the shared payload.

## Build (no bundler)

```bash
cd extension
npx tsc -p tsconfig.json
```

Output goes to `extension/src/*.js` (next to the source). The manifest references the compiled `*.js` files.

## Backend CORS

The extension calls the backend with `Origin: chrome-extension://<id>`. The backend CORS allow-list is driven by the `CORS_ORIGIN` env var. For local dev, set in `backend/.env`:

```
CORS_ORIGIN=chrome-extension://hahcoepljmhmiaomolmfhbmpahnfbpep,http://localhost:3000
```

Then restart the backend. If the dashboard shows `Extension belum terdeteksi` even though Chrome says the extension is loaded, the most common cause is a missing or wrong `CORS_ORIGIN` (the dashboard's ping times out).
