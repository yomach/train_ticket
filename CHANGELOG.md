# Changelog

All notable changes to this project will be documented in this file.

## [Unreleased]

## [0.6.3] - 2026-08-18

### Changed
- **Schedule Refresh.** Updated train schedule.


## [0.6.2] - 2026-07-01

### Changed
- **Schedule Refresh.** Updated train schedule.


## [0.6.1] - 2026-06-10

### Changed
- **Schedule Refresh.** Updated train schedule.


## [0.6.0] - 2026-06-06

### Added
- Added a "Show QR Code" toggle button to save screen real-estate.
- Added loading indicators to the booking process.
- Added warnings for potentially canceled trains (no real-time data found).
- Added real-time delay minutes to the platform info text.

### Changed
- Replaced the large barcode container with a QR code toggle.

## [0.5.6] - 2026-06-04

### Changed
- **Schedule Refresh.** Updated train schedule.


## [0.5.5] - 2026-05-30

### Changed
- **Schedule Refresh.** Updated train schedule.


## [0.5.4] - 2026-05-29

### Changed
- **Schedule Refresh.** Updated train schedule.


## [0.5.3] - 2026-05-27

### Changed
- **Schedule Refresh.** Updated train schedule.


## [0.5.2] - 2026-05-26

### Changed
- **Schedule Refresh.** Updated train schedule.


## [0.5.1] - 2026-05-25

### Changed
- **Schedule Refresh.** Updated train schedule.


## [0.5.0] - 2026-05-23

### Added
- **Schedule Info Modal.** Added a new power-user panel accessible from the "About" dialog ("פרטי לוח זמנים ›"). It displays the currently active schedule date vs. the bundled date, and provides manual "Refresh" and "Reset" controls.
- **Auto-Update Toggle.** Added a checkbox in the schedule panel to opt out of background schedule updates.

### Changed
- **Smarter Update Prompts.** The app will no longer pop up the "New Version" dialog or display a red dot badge for patch-only updates (e.g., automated schedule refreshes). The intrusive popup and badge are now reserved exclusively for minor and major feature updates.
- **Optimized Network Fetch.** Background schedule refreshes now perform a lightweight `HEAD` request to check the jsDelivr CDN's `ETag` before downloading. This avoids pulling down the 3MB JSON file if the data hasn't actually changed.
- **Offline Reliability.** Forced `cache: "no-cache"` on manual schedule refreshes to prevent the browser from spoofing a successful refresh from its offline cache when there's no internet connection.

## [0.4.4] - 2026-05-22

### Changed
- **Schedule Refresh.** Updated train schedule.

## [0.4.3] - 2026-05-21

### Changed
- **Schedule Refresh.** Updated train schedule.

## [0.4.2] - 2026-05-17

### Fixed
- **Version Display.** Fixed a bug where the "About" page reported an outdated version number (0.4.0 instead of 0.4.1).

### Changed
- **Release Automation.** Centralized version management to ensure all platforms (Web and Android) stay in sync automatically on every release.

## [0.4.1] - 2026-05-17

### Changed
- **Schedule Refresh.** Updated train schedule.
- **CI Workflow.** Upgraded the `Update rail schedule` workflow to use Node.js 22 and the latest `peter-evans/create-pull-request@v8`. The workflow now ignores fluctuations in `serviceCount` when detecting changes, reducing unnecessary PRs.
- **Maintenance.** Updated `scripts/build-schedule.js` to include mappings for **Netanya Sapir** and additional **Merkazit HaMifratz** stop codes, resolving build warnings.

## [0.4.0] - 2026-05-15

### Added
- **Weekend schedules.** The schedule now carries per-trip day-of-week availability and includes Friday/Saturday trains. The picker only shows trains that actually run on the selected date, matching what `searchTrain` returns.
- **Past dates are disabled.** The date input enforces `min` = today, so the picker won't let you select a date in the past.

### Changed
- **Default date & time logic.** On open (and on direction/station change) the date defaults to today and the time defaults to the next available departure. The date only auto-bumps to the next day when today has no remaining trains for the selected route. A previously-selected time is preserved as long as it hasn't passed; otherwise it snaps back to the next available train.
- **No more weekend block.** Picking a weekend date no longer shows the "אין יכולת לעשות לסופשים" message — the schedule now answers honestly with whichever trains run that day.
- **Build script.** `scripts/build-schedule.js` drops the Sun–Thu service filter and attaches a `days: [0..6]` array to every trip; same `(trainNumber, departure, arrival)` across multiple services collapses to one entry with merged days. `serviceMode` is now `"all-days"`.

### Fixed
- **Update popup no longer fires when the remote version is older.** The version check now does a real semver compare (major/minor/patch + natural-sorted prerelease suffix) instead of plain string inequality, so a prerelease build no longer gets nagged to "upgrade" to an older stable release.

## [0.3.0] - 2026-05-15

### Added
- **Platform info on the booking confirmation.** Boarding and arrival platforms appear under the QR. For trips arriving at Yitzhak Navon the line also tells you which side to exit ("לצד ימין/שמאל עם כיוון הנסיעה").
- **Trip details on the confirmation.** Stations, date, time and train number are shown above the QR so you can sanity-check the booking before scanning.
- **OTP screen no longer lets you tap "אמת והזמן" when the field is empty.** Once the SMS arrives (Android), the OTP is filled in and submitted automatically.
- **The schedule stays current on its own.** The app updates train times in the background after launch, so retimed trains and new stations show up without waiting for a new app version.
- **"Don't show again" option for the update notification.** When a new version is detected the About modal pops up; you can now tick a box to suppress the popup for that specific version (the badge still shows so you can open About manually).

### Changed
- Debug and release builds can be installed side-by-side on the same device — the debug build shows up as "שובר רכבת (debug)".

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
