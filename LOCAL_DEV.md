# Local development & maintenance notes

Personal-fork notes for `yomach/train_ticket` (a Jerusalem rail-voucher
helper, originally `idshklein/train_ticket`). Captures context that
isn't obvious from reading the source — most importantly, *why* certain
small things exist and *how* this app breaks when rail.co.il rotates
its API.

> **Building the Android app?** See [`ANDROID.md`](ANDROID.md) for
> Capacitor build/install. This file covers the browser FE and the
> Cloudflare Worker proxy.

## What this app does

End-to-end booking of a free Israel Railways "Jerusalem voucher"
ticket without going through the rail.co.il SPA:

1. User picks a direction (from / to Jerusalem), a station, a date,
   a time, and enters a phone number.
2. FE calls `OrderSeatForTrip`. If 401, FE calls `Otp/Send`,
   collects the SMS code, calls `Otp/Verify`, then retries
   `OrderSeatForTrip`. The 200 response returns a `confirmationCode`
   which the FE renders as a QR code — that's the voucher you scan
   at the gate.

`rail_times_index.json` is a static GTFS-derived index of valid
`(fromStation, toStation, time, trainNumber)` tuples; the FE uses it
to build dropdowns without hitting the API for trip discovery.

## Architecture

```
[browser]  →  [Cloudflare Worker proxy]  →  [rail-api.rail.co.il]
   ↑                       ↑
 cookies               adds subscription key,
 (authToken)           browser-like headers,
                       strips Set-Cookie Domain
```

- **Frontend** (`index.html`, `app.js`, `booking-helpers.js`,
  `styles.css`, `rail_times_index.json`) — pure static, no build step.
- **Proxy** — `cloudflare-worker/worker.js` is the only live one.
  - Hardcodes `Ocp-Apim-Subscription-Key` (the one rail.co.il ships
    inside its public SPA bundle — it rotates, see "When it breaks").
  - Forwards cookies both ways. Rewrites upstream `Set-Cookie` to
    strip `Domain=rail.co.il` so the auth cookie persists on the
    proxy's own origin (otherwise the browser silently drops it).
  - Allowed CORS origins: `localhost:8000`, `127.0.0.1:8000`.

## Running locally

```bash
# 1. CF Worker (local mode, no Cloudflare account needed)
cd cloudflare-worker
npx --yes wrangler@latest dev --port 8787 --local

# 2. Static FE (in another terminal). The FE moved into www/ when we
#    added the Capacitor Android wrapper — Capacitor uses www/ as the
#    WebView root. Serve from there in the browser too.
cd /home/yomach/codex/train_ticket/www
python3 -m http.server 8000

# 3. Open http://localhost:8000 in a browser, then in DevTools console:
localStorage.setItem('apiBase', 'http://localhost:8787'); location.reload();
```

The `localStorage.apiBase` override is read by `app.js` at startup
(`DEFAULT_PROXY_BASE` is the production worker URL). To go back to prod
behavior in the same browser:

```js
localStorage.removeItem('apiBase'); location.reload();
```

Tests: `npm test` (runs `node --test` against `tests/*.test.js`).

## When it breaks (and how to diagnose)

rail.co.il evolves. Two things change periodically:

- **Subscription key rotation.** The `Ocp-Apim-Subscription-Key` lives
  inside their public SPA bundle. They rotate it occasionally.
- **Endpoint paths and request bodies.** Past changes, in `2026-04` →
  `2026-05`:
  - `…/TripReservation/SendOtp` → `…/Otp/Send`
  - `…/TripReservation/VerifyOtp` → `…/Otp/Verify`
  - `…/TripReservation/OrderSeatForTrip` — unchanged
  - `Otp/*` bodies gained `languageId: "Hebrew"`.
  - `OrderSeatForTrip` body: dropped `sourceChannel: "web"`, added
    `systemTypeId: "2"`, `languageId: "Hebrew"`; `type: ""` →
    `type: "phone"`.
  - Response shape: `result.result` (string) → `result.data.confirmationCode`
    with sibling `result.success` boolean.

**Diagnosis recipe (low traffic — rail.co.il rate-limits aggressively):**

1. **Don't** scrape the rail.co.il homepage with `curl` — it's behind
   Cloudflare's managed bot challenge and returns HTTP 403 + a JS
   challenge. You can't bypass it from a script.
2. **Do** open `https://www.rail.co.il/` in a real browser, open
   DevTools → Network → "Preserve log" → run one full booking flow
   (you'll get an OTP SMS — that's the cost). Right-click each of
   `Otp/Send`, `Otp/Verify`, `TripReservation/OrderSeatForTrip` →
   "Copy as cURL (bash)".
3. Diff the captured cURLs against `cloudflare-worker/worker.js` and
   `app.js` — paths, request bodies, subscription key.
4. Patch `cloudflare-worker/worker.js` and `app.js`.

Alternative low-risk single-shot diagnostic that doesn't burn an SMS:
one POST to `OrderSeatForTrip` with no auth cookie. Expected: HTTP
401 with `WWW-Authenticate: Bearer`. If you instead see HTTP 403 →
the worker's IP is being WAF'd. If you see "subscription invalid" →
key rotated. (The `WWW-Authenticate: Bearer` is .NET's default
challenge response; the actual flow uses a cookie-based JWT, not a
bearer header. Don't be misled.)

## Auth cookie mechanics

`Otp/Verify` sets a cookie `authToken=<JWT>` (5-min TTL) on the
response. The FE uses `credentials: "include"` so the browser stores
it on the proxy origin, then sends it back on `OrderSeatForTrip`. The
proxy forwards it as the upstream `Cookie` header.

The upstream emits `Set-Cookie: authToken=…; Domain=rail.co.il; …`.
Without rewriting, the browser rejects this on the proxy host.
`worker.js`'s `rewriteSetCookie` strips the `Domain` attribute.

## Deploy

There is no current deploy target — the fork is local-only. The
upstream maintainer's Cloudflare Worker
(`rail-proxy.idshk-train-ticket-20260414.workers.dev`) is the only
public instance, and it's owned by `idshklein`.

If you want to host it yourself:
- Serve the `www/` directory as static files (Netlify, Cloudflare Pages,
  or any static host).
- Deploy `cloudflare-worker/worker.js` under a Cloudflare account you
  control: add your static host URL to `ALLOWED_ORIGINS`, then
  `wrangler deploy`. Update `DEFAULT_PROXY_BASE` in `app.js` to your
  worker URL.

## Branch / fork hygiene

This fork's `main` is **upstream/main + the upstream-bound fix +
one local-dev `chore` commit on top** (the `localStorage` override,
the localhost CORS additions, this file). When the upstream PR
([idshklein/train_ticket#3](https://github.com/idshklein/train_ticket/pull/3))
merges, drop the now-duplicate fix commit and keep only the
local-dev one:

```bash
git fetch upstream
git rebase upstream/main   # drops the duplicated fix commit; keeps chore(local-dev)
git push --force-with-lease origin main
```

When sending another upstream PR in the future, branch from
`upstream/main` (not your local `main`) and **omit** these
local-dev pieces:

- `localStorage.apiBase` override block in `app.js`
- `localhost:8000` / `127.0.0.1:8000` in `ALLOWED_ORIGINS` (and the
  `Vary: Origin` header that comes with multi-origin)
- `LOCAL_DEV.md` itself

The general rule: anything that only exists to make `wrangler dev`
+ a static server work on your laptop stays out of upstream.

## Files that matter

| Path | Purpose |
|---|---|
| `www/app.js` | All FE logic: form state, OTP flow, cookies, `apiPost`, native vs browser branch |
| `www/booking-helpers.js` | URL builder + redirect-fallback heuristic, exposed for tests |
| `www/index.html` | Three steps: form → OTP → result |
| `www/rail_times_index.json` | Pre-built GTFS index (~85KB) of valid trips |
| `www/vendor/qrcode.min.js` | Vendored qrcodejs (was a CDN script) |
| `cloudflare-worker/worker.js` | The live proxy for the **browser** build — UPSTREAM, headers, CORS, cookie rewrite |
| `cloudflare-worker/wrangler.toml` | Worker name + compat date |
| `capacitor.config.json` | Capacitor app config (appId, webDir, plugins) |
| `android/` | Capacitor-generated Android Studio project |
| `tests/booking-helpers.test.js` | Tests `buildReservationUrl` + redirect heuristic |
| `tests/worker-health.test.js` | Tests the worker's `GET /` status page |

## Conventions

- Direction value strings are `"from-jerusalem"` and `"to-jerusalem"`
  (used both as state and as `data-direction` on the buttons). Don't
  rename without auditing both places.
- Station IDs flow as **strings** end-to-end — `JERUSALEM_STATION_ID
  = "680"`, `DEFAULT_OTHER_STATION = "2800"`, dropdown values are
  strings, the upstream API now expects strings. Don't `Number(...)` them.
- `trainNumber` is the one numeric ID — always wrap with `Number(...)`
  before sending.
- `languageId: "Hebrew"` on every body. The API takes the literal
  string `"Hebrew"`, not a code.
- Cookie helpers are domain-specific and hand-rolled (no library).
  See `setPhoneCookie`, `getPhoneCookie`, `setLastToJerusalemStation`,
  `getLastToJerusalemStation`. The pattern is 1-year `expires`,
  `path=/`. New per-user preferences should follow that pattern.

## Recent fixes (history this doc was written for)

- 2026-05-09 → API endpoint paths and body schemas changed. Patched
  `worker.js` UPSTREAM and `app.js` `apiPost` callers + response
  parsing. Added `localhost` origins, `Set-Cookie` Domain rewrite,
  `localStorage.apiBase` override.
- 2026-05-10 → "Remember last `to-jerusalem` station" via cookie
  (`lastToJerusalemStation`). Rendered as default in
  `renderStationOptions` when direction is `to-jerusalem`; saved on
  `<select>` change. Not applied to `from-jerusalem` (destinations
  vary more there).
