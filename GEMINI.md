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

### Release Flow
- **Fully Automated:** When a PR containing a version bump in `package.json` is merged to `main`, the `Release` GitHub Action automatically creates the `vX.Y.Z` git tag.
- **APK Generation:** That same Action builds the Android APK and publishes a formal GitHub Release automatically. No manual tagging or `gh release` commands are needed.

## Maintenance & Debugging
- **API Breakers:** rail.co.il rotates `Ocp-Apim-Subscription-Key` and endpoint schemas.
- **Diagnostic Recipe:**
  1. Open `https://www.rail.co.il/` in a browser.
  2. Capture `Otp/Send`, `Otp/Verify`, `OrderSeatForTrip` as cURL.
  3. Compare headers and bodies with `cloudflare-worker/worker.js` and `www/app.js`.
- **Constraint:** Do NOT scrape `rail.co.il` home page; it is protected by Cloudflare JS challenges.
- **Station Mappings:** GTFS `stop_code` to `rail.co.il` ID mapping is hardcoded in `scripts/build-schedule.js` (`STOP_CODE_TO_RAIL_ID`). Update this table when the build script logs "unmapped GTFS rail stop" warnings for real new stations.

## Code Conventions
- **Station IDs:** Always strings (e.g., `"680"`). Do NOT cast to Number.
- **Train Number:** Always Number.
- **Languages:** Use literal string `"Hebrew"`.
- **Cookies:** Hand-rolled helpers in `app.js` (1-year expiry, `path=/`).
- **Sync:** Always update both `cloudflare-worker/worker.js` and `www/app.js` (native branch) when API headers or schemas change.

## AI Agent Rules
1. **Always Sync First:** Before starting any coding task, run `git fetch` and check if the local branch is behind `origin/main`. If the repository is out of sync (e.g. because the bot auto-merged a schedule update), you MUST prompt the user to commit or stash their work and pull the latest `main` before proceeding.
2. **Review Before Fixing:** When utilizing a subagent to perform a code or PR review, you must always pause and share the subagent's raw findings with the user for discussion and explicit approval *before* proceeding to make edits and push commits.
