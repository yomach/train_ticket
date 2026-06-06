const test = require("node:test");
const assert = require("node:assert/strict");

const { isValidScheduleShape, sanitizePlatform, extractTrainDetails, tripKey } =
  require("../www/schedule-helpers.js");

// Minimal valid schedule meeting the sanity-floor counts.
function makeValidSchedule() {
  const stations = [];
  for (let i = 0; i < 50; i++) {
    stations.push({ stationId: 100 + i, stationName: `station ${i}` });
  }
  const pairs = {};
  for (let i = 0; i < 10; i++) {
    pairs[`100_${100 + i + 1}`] = [
      { trainNumber: String(500 + i), departureTime: "05:59:00", arrivalTime: "06:24:00", routeId: "32433" },
    ];
  }
  return { stations, pairs, stationCount: 50, pairCount: 10, generatedAt: "2026-01-01T00:00:00Z" };
}

test("isValidScheduleShape accepts a well-formed schedule", () => {
  assert.equal(isValidScheduleShape(makeValidSchedule()), true);
});

test("isValidScheduleShape rejects non-objects and missing keys", () => {
  assert.equal(isValidScheduleShape(null), false);
  assert.equal(isValidScheduleShape(undefined), false);
  assert.equal(isValidScheduleShape("string"), false);
  assert.equal(isValidScheduleShape({}), false);
});

test("isValidScheduleShape rejects below-floor station/pair counts", () => {
  const s = makeValidSchedule();
  s.stationCount = 49;
  assert.equal(isValidScheduleShape(s), false, "stationCount below floor");
  const t = makeValidSchedule();
  t.pairCount = 9;
  assert.equal(isValidScheduleShape(t), false, "pairCount below floor");
});

test("isValidScheduleShape rejects malformed station entries", () => {
  const s = makeValidSchedule();
  s.stations[0] = { stationId: "abc", stationName: "x" }; // non-numeric ID
  assert.equal(isValidScheduleShape(s), false);
  const t = makeValidSchedule();
  t.stations[0] = { stationId: 100, stationName: "" }; // empty name
  assert.equal(isValidScheduleShape(t), false);
});

test("isValidScheduleShape rejects malformed pair entries", () => {
  const s = makeValidSchedule();
  s.pairs["100_101"][0].departureTime = "5:59"; // wrong format
  assert.equal(isValidScheduleShape(s), false);
  const t = makeValidSchedule();
  t.pairs["100_101"][0].trainNumber = "";
  assert.equal(isValidScheduleShape(t), false);
});

test("isValidScheduleShape accepts 24+ hour times for after-midnight services", () => {
  const s = makeValidSchedule();
  s.pairs["100_101"][0].departureTime = "23:59:00";
  s.pairs["100_101"][0].arrivalTime = "24:30:00";
  assert.equal(isValidScheduleShape(s), true);
});

test("sanitizePlatform accepts integers in [1,50]", () => {
  assert.equal(sanitizePlatform(1), 1);
  assert.equal(sanitizePlatform(20), 20);
  assert.equal(sanitizePlatform(50), 50);
  assert.equal(sanitizePlatform("7"), 7); // numeric strings OK
});

test("sanitizePlatform rejects out-of-range, non-integer, and garbage", () => {
  assert.equal(sanitizePlatform(0), null);
  assert.equal(sanitizePlatform(51), null);
  assert.equal(sanitizePlatform(-1), null);
  assert.equal(sanitizePlatform(2.5), null);
  assert.equal(sanitizePlatform(null), null);
  assert.equal(sanitizePlatform(undefined), null);
  assert.equal(sanitizePlatform("abc"), null);
  assert.equal(sanitizePlatform({}), null);
});

test("extractTrainDetails finds the train by exact number match and extracts delay", () => {
  const data = {
    result: {
      travels: [
        { trains: [{ trainNumber: 542, originPlatform: 3, destPlatform: 2, etaDiffTimes: [{ difMin: 5 }] }] },
      ],
    },
  };
  assert.deepEqual(extractTrainDetails(data, "542"), { found: true, originPlatform: 3, destPlatform: 2, delayMinutes: 5 });
  // string-vs-number trainNumber should still match
  assert.deepEqual(extractTrainDetails(data, 542), { found: true, originPlatform: 3, destPlatform: 2, delayMinutes: 5 });
});

test("extractTrainDetails returns found: false when no train matches", () => {
  const data = {
    result: { travels: [{ trains: [{ trainNumber: 999, originPlatform: 3, destPlatform: 2 }] }] },
  };
  assert.deepEqual(extractTrainDetails(data, "542"), { found: false });
});

test("extractTrainDetails handles missing/malformed shapes gracefully", () => {
  assert.deepEqual(extractTrainDetails(null, "542"), { found: false });
  assert.deepEqual(extractTrainDetails({}, "542"), { found: false });
  assert.deepEqual(extractTrainDetails({ result: {} }, "542"), { found: false });
  assert.deepEqual(extractTrainDetails({ result: { travels: "nope" } }, "542"), { found: false });
  assert.deepEqual(extractTrainDetails({ result: { travels: [{}] } }, "542"), { found: false });
  assert.deepEqual(extractTrainDetails({ result: { travels: [{ trains: "nope" }] } }, "542"), { found: false });
});

test("extractTrainDetails returns null for platforms when they are out of range", () => {
  const data = {
    result: { travels: [{ trains: [{ trainNumber: 542, originPlatform: 99, destPlatform: -1 }] }] },
  };
  assert.deepEqual(extractTrainDetails(data, "542"), { found: true, originPlatform: null, destPlatform: null, delayMinutes: 0 });
});

test("extractTrainDetails returns partial info when one platform is valid", () => {
  const data = {
    result: { travels: [{ trains: [{ trainNumber: 542, originPlatform: 99, destPlatform: 2 }] }] },
  };
  assert.deepEqual(extractTrainDetails(data, "542"), { found: true, originPlatform: null, destPlatform: 2, delayMinutes: 0 });
});

test("tripKey is deterministic and uses all booking-identity fields", () => {
  const p = { fromStation: "680", toStation: "400", date: "2026-05-14", time: "07:29", trainNumber: "548" };
  assert.equal(tripKey(p), "680|400|2026-05-14|07:29|548");
});

test("tripKey distinguishes trips that share most params", () => {
  const a = { fromStation: "680", toStation: "400", date: "2026-05-14", time: "07:29", trainNumber: "548" };
  const b = { ...a, trainNumber: "550" };
  const c = { ...a, time: "08:29" };
  assert.notEqual(tripKey(a), tripKey(b));
  assert.notEqual(tripKey(a), tripKey(c));
  assert.notEqual(tripKey(b), tripKey(c));
});

test("tripKey returns empty string on null", () => {
  assert.equal(tripKey(null), "");
  assert.equal(tripKey(undefined), "");
});

test("bundled rail_times_index.json passes validation", () => {
  // Live regression check: the bundled schedule must continue to pass the
  // same shape rules the app uses to validate remote refreshes.
  const fs = require("node:fs");
  const path = require("node:path");
  const data = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "www", "rail_times_index.json"), "utf8"));
  assert.equal(isValidScheduleShape(data), true);
});
