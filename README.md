# Train Voucher (שובר רכבת)

Books a free Israel Railways Jerusalem voucher ticket without going through the
rail.co.il SPA. Pick a direction, station, date, time, and phone number — the
app handles the OTP flow and returns a QR code you scan at the gate.

Forked from [idshklein/train_ticket](https://github.com/idshklein/train_ticket)
by [Ido Klein](https://github.com/idshklein). This fork fixes the API endpoints
and request bodies after a rail.co.il schema change (May 2026), and wraps the
app as a sideload-only Android APK via Capacitor so it runs without a server.

## Running locally (browser)

```bash
# Cloudflare Worker proxy (one terminal)
cd cloudflare-worker && npx wrangler@latest dev --port 8787 --local

# Static FE (another terminal)
cd www && python3 -m http.server 8000
```

Open `http://localhost:8000`, then in DevTools console:

```js
localStorage.setItem('apiBase', 'http://localhost:8787'); location.reload();
```

## Building the Android APK

See [ANDROID.md](ANDROID.md) for toolchain setup, build, and sideload instructions.

## License

BSD 3-Clause. See [LICENSE](LICENSE).
Original work © Ido Klein. Modifications © 2026 Yoav Romach.
