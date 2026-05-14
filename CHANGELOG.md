# Changelog

All notable changes to this project will be documented in this file.

## [Unreleased]

### Added
- **Live platform info on the confirmation page:** pulls boarding (`originPlatform`) and arrival (`destPlatform`) platforms from the rail.co.il `searchTrain` API. The request is pre-fetched the moment the user clicks הזמן, so it races OTP delivery and the data is ready by the time the confirmation page renders.
- **Jerusalem exit-side hint:** for trips arriving at Yitzhak Navon, the line includes the exit direction — odd platforms (1, 3) → `לצד ימין עם כיוון הנסיעה`, even platforms (2, 4) → `לצד שמאל עם כיוון הנסיעה`.
- **Trip summary on the confirmation page:** `<from> ← <to> • YYYY-MM-DD HH:MM • רכבת NNN` above the QR.
- **OTP confirm button gating:** `אמת והזמן` starts disabled, enables on input, and shows a `:disabled` style (50% opacity, `not-allowed` cursor).
- **OTP auto-continue:** after Android's SMS User Consent fills the OTP, the app auto-submits 600 ms later. Native-only; browser builds still require a manual tap.
- **Non-blocking schedule refresh:** new `scripts/build-schedule.js` regenerates `www/rail_times_index.json` from the Israel MOT GTFS feed. A weekly GitHub Action (`update-schedule.yml`) runs the build and opens a PR on real changes. The app fetches the latest JSON from jsDelivr in the background after first paint and applies it when newer (only on the form step, so the UI never gets yanked from under a user mid-booking). All entry points validate the schema before applying.
- **Shared helpers module** (`www/schedule-helpers.js`): pure, testable `isValidScheduleShape` / `sanitizePlatform` / `extractPlatforms` / `tripKey`. Loaded UMD-style in the browser, required directly by the Node test runner.

### Changed
- **Worker is now a path passthrough:** `cloudflare-worker/worker.js` proxies both `/common/api/v1/*` (booking) and `/rjpa/api/v1/*` (`searchTrain`). `shouldServeStatusPage` was narrowed to GET-on-root (or `/health`) so non-root GETs reach upstream.
- **App-side API paths now include the namespace prefix** (`common/api/v1/Otp/Send`, etc.).
- **Version check moved from GitHub's REST API to jsDelivr's package metadata API** (`data.jsdelivr.com/v1/packages/gh/yomach/train_ticket`) — no more 60-req/hr rate limit on shared mobile NATs.
- **Debug builds get a distinct identity** so they can be installed alongside release: `applicationId com.yomach.trainticket.debug`, label `שובר רכבת (debug)`, filename `train_voucher_<version>-debug.apk`.

## [0.2.0] - 2026-05-10

### Added
- **About Modal:** New "About" section accessible via an info icon in the header.
- **Author Information:** Added "Yoav Romach" as the author in the About section.
- **Auto Version Check:** The app now checks for the latest GitHub release on startup.
- **Update Notification:** Automatic pop-up of the About modal if a newer version is available.
- **Persistent Version Display:** The About page now always shows the latest version from GitHub with a direct link to the release page.
- **Favicon:** Added the train icon as a favicon for the web interface.

### Changed
- **UI Refinements:** Improved header layout and modal styling for better mobile experience.
- **Build Process:** Updated build scripts and environment configuration for consistent APK generation.

## [0.1.0] - 2026-04-15
- Initial release with basic booking functionality.
