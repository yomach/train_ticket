# Implementation Plan - Jerusalem Platform Information & Persistent Schedule Sync

This plan addresses item #3 in `train_ticket/TODO.md`: "To Jerusalem: Add what platform the train gets to in Jerusalem, and add 'Left' for odd numbers and 'Right' for even numbers". It also implements a persistent schedule sync as requested.

## Objective
Display arrival platform and exit side (Left/Right) for trips arriving in Jerusalem (Yitzhak Navon), and maintain a dynamically updated, persistent schedule cache.

## Persistent Cache
- The app will maintain a "Live Cache" in `localStorage`.
- On startup, the app loads `rail_times_index.json` and merges it with the `localStorage` data.
- When `searchTrain` data is fetched, the app updates the `localStorage` cache with real-time info (platforms, times, train numbers).

## Dynamic Updates
- Background sync triggers on app startup and whenever the route (station/date) changes.
- Uses the `searchTrain` API (`/rjpa/api/v1/timetable/searchTrain`).

## UI Enhancements
- **Time Selection:** The dropdown will display the platform number (e.g., `10:30 ← 11:00 (רציף 2)`) if available in the cache.
- **Confirmation Page:** On successful booking, display the exit side message: `"הירידה מהרכבת תתבצע לצד [שמאל/ימין] (רציף [מספר])"`.

## Logic
- **Odd** platform numbers (1, 3) -> **Left ("שמאל")**
- **Even** platform numbers (2, 4) -> **Right ("ימין")**

## Changes
### `cloudflare-worker/worker.js`
- Update the proxy logic to handle both `common/api/v1` and `rjpa/api/v1` base URLs.

### `index.html`
- Add `<p id="platformInfo" class="microcopy hidden"></p>` to the `stepResult` section.

### `app.js`
- Update the `elements` object to include `platformInfo`.
- Implement `loadPersistentCache()` and `savePersistentCache()`.
- Implement `syncRealTimeSchedule(from, to, date)` to fetch and merge data into the cache.
- Update `updateStatus` and event listeners to trigger synchronization.
- Update `renderTimeOptions` to use the augmented cache data and display platforms.
- Update `showResult` to display the exit side message based on the platform of the selected train.

## Verification & Testing
- **Manual Testing:**
  - Open the app, change the route/date, and verify the dropdown updates with platform info.
  - Refresh the page and ensure the platform info persists in the dropdown.
  - Complete a booking to Jerusalem and verify the platform/exit side message.
