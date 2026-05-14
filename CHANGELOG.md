# Changelog

All notable changes to this project will be documented in this file.

## [Unreleased]

### Added
- **Platform info on the booking confirmation.** Boarding and arrival platforms appear under the QR. For trips arriving at Yitzhak Navon the line also tells you which side to exit ("לצד ימין/שמאל עם כיוון הנסיעה").
- **Trip details on the confirmation.** Stations, date, time and train number are shown above the QR so you can sanity-check the booking before scanning.
- **OTP screen no longer lets you tap "אמת והזמן" when the field is empty.** Once the SMS arrives (Android), the OTP is filled in and submitted automatically.
- **The schedule stays current on its own.** The app updates train times in the background after launch, so retimed trains and new stations show up without waiting for a new app version.

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
