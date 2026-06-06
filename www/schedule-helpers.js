// Pure helpers shared between the browser app and the test runner.
// Loaded in the browser via <script src="schedule-helpers.js"> and exposed
// on globalThis.ScheduleHelpers. Imported from Node tests via require().
(function (root) {
  const TIME_PATTERN = /^\d{1,2}:\d{2}:\d{2}$/;

  // Schedule JSON shape guardrail. Mirrors the CI build script's validation
  // so a corrupted localStorage cache or truncated CDN response can't
  // overwrite a working schedule.
  function isValidScheduleShape(data) {
    if (!data || typeof data !== "object") return false;
    if (!Array.isArray(data.stations) || data.stations.length === 0) return false;
    if (!data.pairs || typeof data.pairs !== "object") return false;
    // Sanity floor. Current values are 65 / 16; anything well below is corruption.
    if (!(Number(data.stationCount) >= 50)) return false;
    if (!(Number(data.pairCount) >= 10)) return false;
    for (const station of data.stations) {
      if (!station || typeof station !== "object") return false;
      if (!Number.isFinite(Number(station.stationId))) return false;
      if (!station.stationName || typeof station.stationName !== "string") return false;
    }
    const pairKeys = Object.keys(data.pairs);
    if (pairKeys.length === 0) return false;
    let sawNonEmptyPair = false;
    for (const key of pairKeys) {
      const trips = data.pairs[key];
      if (!Array.isArray(trips)) return false;
      if (trips.length > 0) sawNonEmptyPair = true;
      for (const trip of trips) {
        if (!trip || typeof trip !== "object") return false;
        if (!trip.trainNumber) return false;
        if (!TIME_PATTERN.test(String(trip.departureTime))) return false;
        if (!TIME_PATTERN.test(String(trip.arrivalTime))) return false;
        // `days` is optional for backward compat with legacy weekday-only
        // builds (no `days` ⇒ assume Sun–Thu at runtime). When present it
        // must be a non-empty list of valid weekday indexes.
        if (trip.days !== undefined) {
          if (!Array.isArray(trip.days) || trip.days.length === 0) return false;
          for (const d of trip.days) {
            if (!Number.isInteger(d) || d < 0 || d > 6) return false;
          }
        }
      }
    }
    return sawNonEmptyPair;
  }

  // Real platforms are 1–20; bound generously and reject anything else.
  function sanitizePlatform(value) {
    const n = Number(value);
    return Number.isInteger(n) && n >= 1 && n <= 50 ? n : null;
  }

  // Extract details for `trainNumber` out of a searchTrain
  // response. Returns `{ found: boolean, originPlatform, destPlatform, delayMinutes }`
  function extractTrainDetails(data, trainNumber) {
    const travels = Array.isArray(data?.result?.travels) ? data.result.travels : [];
    for (const travel of travels) {
      const trains = Array.isArray(travel?.trains) ? travel.trains : [];
      for (const train of trains) {
        if (String(train?.trainNumber) !== String(trainNumber)) continue;
        const origin = sanitizePlatform(train.originPlatform);
        const dest = sanitizePlatform(train.destPlatform);
        
        let delayMinutes = 0;
        if (Array.isArray(train.etaDiffTimes)) {
          for (const eta of train.etaDiffTimes) {
            const dif = Number(eta.difMin);
            if (!Number.isNaN(dif) && dif > delayMinutes) {
              delayMinutes = dif;
            }
          }
        }
        
        return { found: true, originPlatform: origin, destPlatform: dest, delayMinutes };
      }
    }
    return { found: false };
  }

  // Fingerprint a trip so we can detect stale pre-fetch promises if the user
  // re-submits with different params before showResult runs.
  function tripKey(p) {
    if (!p) return "";
    return `${p.fromStation}|${p.toStation}|${p.date}|${p.time}|${p.trainNumber}`;
  }

  const api = { isValidScheduleShape, sanitizePlatform, extractTrainDetails, tripKey, TIME_PATTERN };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }

  root.ScheduleHelpers = api;
})(typeof globalThis !== "undefined" ? globalThis : window);
