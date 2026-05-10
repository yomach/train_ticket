# Train Ticket - Agent Guidance

## Architecture Summary
- **Hybrid App:** Capacitor wraps a vanilla JS frontend (`www/`).
- **Dual API Path:**
  - **Browser (Dev):** Uses Cloudflare Worker proxy (`cloudflare-worker/`) to bypass CORS and inject headers.
  - **Native (Android):** Calls `rail-api.rail.co.il` directly (no CORS, headers injected in `app.js`).
- **Persistence:** Auth is cookie-based (`authToken` JWT). The proxy rewrites `Set-Cookie` to strip `Domain=rail.co.il`.

## Core Commands

### Development
- **Start Proxy:** `cd cloudflare-worker && npx wrangler dev --port 8787 --local`
- **Start FE:** `cd www && python3 -m http.server 8000`
- **Set Dev Base:** In browser console: `localStorage.setItem('apiBase', 'http://localhost:8787'); location.reload();`
- **Test:** `npm test` (Node.js test runner)

### Android Build
- **Setup Env:** `source ~/.local/opt/android-env.sh`
- **Sync Web Assets:** `npx cap sync android`
- **Build APK:** `cd android && ./gradlew assembleDebug`
- **Install:** `adb install -r android/app/build/outputs/apk/debug/app-debug.apk`

## Maintenance & Debugging
- **API Breakers:** rail.co.il rotates `Ocp-Apim-Subscription-Key` and endpoint schemas.
- **Diagnostic Recipe:**
  1. Open `https://www.rail.co.il/` in a browser.
  2. Capture `Otp/Send`, `Otp/Verify`, `OrderSeatForTrip` as cURL.
  3. Compare headers and bodies with `cloudflare-worker/worker.js` and `www/app.js`.
- **Constraint:** Do NOT scrape `rail.co.il` home page; it is protected by Cloudflare JS challenges.

## Code Conventions
- **Station IDs:** Always strings (e.g., `"680"`). Do NOT cast to Number.
- **Train Number:** Always Number.
- **Languages:** Use literal string `"Hebrew"`.
- **Cookies:** Hand-rolled helpers in `app.js` (1-year expiry, `path=/`).
- **Sync:** Always update both `cloudflare-worker/worker.js` and `www/app.js` (native branch) when API headers or schemas change.
