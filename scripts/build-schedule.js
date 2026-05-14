#!/usr/bin/env node
// Build www/rail_times_index.json from the Israel MOT GTFS feed.
//
// Usage:
//   node scripts/build-schedule.js <gtfs.zip> <out.json> [--allow-shrink]
//
// We stream stop_times.txt (~820 MB) via `unzip -p` to avoid loading it into
// memory. Other files are small enough to read whole.
//
// rail.co.il station IDs (used by the app's booking API) differ from MOT
// GTFS stop_id/stop_code. We bridge the two via name matching against the
// existing rail_times_index.json — that's the source of truth for which
// stations the app supports and what their rail.co.il IDs are.

const fs = require("node:fs");
const path = require("node:path");
const readline = require("node:readline");
const { spawn } = require("node:child_process");

const RAIL_AGENCY_ID = "2";
const SUPPORTED_DAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday"];
const UNSUPPORTED_DAYS = ["friday", "saturday"];
const TIME_PATTERN = /^\d{1,2}:\d{2}:\d{2}$/;

// The app is Jerusalem-specific (app.js:1, JERUSALEM_STATION_ID = "680") and
// only ever looks up pairs anchored on Jerusalem (app.js:212-214). Emitting
// all (from, to) combinations would balloon the JSON 100x with data the app
// never reads — match the existing schema and keep only Jerusalem-anchored
// pairs.
const JERUSALEM_RAIL_ID = 680;

function die(msg) {
  console.error(`ERROR: ${msg}`);
  process.exit(1);
}

function parseArgs(argv) {
  const opts = { allowShrink: false };
  const positional = [];
  for (const arg of argv) {
    if (arg === "--allow-shrink") opts.allowShrink = true;
    else positional.push(arg);
  }
  if (positional.length < 2) {
    die("usage: build-schedule.js <gtfs.zip> <out.json> [--allow-shrink]");
  }
  opts.zipPath = positional[0];
  opts.outPath = positional[1];
  return opts;
}

// Read a member of the zip fully into a string. Used for small files.
function readZipMember(zipPath, member) {
  return new Promise((resolve, reject) => {
    const child = spawn("unzip", ["-p", zipPath, member]);
    const chunks = [];
    child.stdout.on("data", (chunk) => chunks.push(chunk));
    child.stderr.on("data", () => {});
    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0) return reject(new Error(`unzip exited ${code} for ${member}`));
      // Strip leading BOM if present.
      let buf = Buffer.concat(chunks);
      if (buf.length >= 3 && buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) {
        buf = buf.subarray(3);
      }
      resolve(buf.toString("utf8"));
    });
  });
}

// Stream a member line-by-line. Returns the unzip child so the caller can
// surface non-zero exits.
function streamZipMember(zipPath, member) {
  const child = spawn("unzip", ["-p", zipPath, member]);
  child.stderr.on("data", () => {});
  const rl = readline.createInterface({ input: child.stdout, crlfDelay: Infinity });
  return { rl, child };
}

// Minimal CSV parser: handles "..." quoted fields with "" escapes. GTFS CSVs
// don't contain newlines inside quoted fields, so line-oriented parsing is OK.
function parseCsvLine(line) {
  const out = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQuotes) {
      if (c === '"') {
        if (line[i + 1] === '"') { cur += '"'; i++; }
        else inQuotes = false;
      } else {
        cur += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      out.push(cur);
      cur = "";
    } else {
      cur += c;
    }
  }
  out.push(cur);
  return out;
}

function parseCsv(text) {
  const lines = text.split(/\r?\n/).filter((l) => l.length > 0);
  if (lines.length === 0) return { header: [], rows: [] };
  const header = parseCsvLine(lines[0]).map((h) => h.replace(/^﻿/, ""));
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const cells = parseCsvLine(lines[i]);
    const row = {};
    for (let j = 0; j < header.length; j++) row[header[j]] = cells[j] ?? "";
    rows.push(row);
  }
  return { header, rows };
}

// Hardcoded MOT stop_code → rail.co.il station ID.
//
// rail.co.il uses one ID space (e.g. 680 = Jerusalem), MOT GTFS uses another
// (stop_id, stop_code). Names differ too (GTFS: "השלום"; rail.co.il: "תל אביב -
// השלום"), so fuzzy name matching is unreliable. This table is the source
// of truth. To add a new station: find its row in `stops.txt` (filter rail by
// agency_id=2 → stop_code starts 17xxx) and add the mapping below.
//
// If `build-schedule.js` finds a rail stop in the GTFS that isn't in this map,
// it logs a warning and skips it — surface those warnings in PR review.
const STOP_CODE_TO_RAIL_ID = {
  "17000": 300,    // פאתי מודיעין
  "17002": 400,    // מודיעין - מרכז
  "17004": 700,    // קריית חיים
  "17008": 1220,   // מרכזית המפרץ
  "17010": 1300,   // חוצות המפרץ
  "17012": 1500,   // עכו
  "17014": 1600,   // נהריה
  "17016": 2100,   // חיפה - מרכז השמונה
  "17018": 2200,   // חיפה - בת גלים
  "17020": 2300,   // חיפה - חוף הכרמל
  "17022": 2500,   // עתלית
  "17024": 2800,   // בנימינה
  "17026": 2820,   // קיסריה - פרדס חנה
  "17028": 3100,   // חדרה - מערב
  "17030": 3300,   // נתניה
  "17032": 3400,   // בית יהושע
  "17034": 3500,   // הרצליה
  "17036": 3600,   // תל אביב – האוניברסיטה - אקספו
  "17038": 3700,   // תל אביב - סבידור מרכז
  "17040": 4100,   // בני ברק
  "17042": 4170,   // פתח תקווה - קריית אריה
  "17044": 4250,   // פתח תקווה - סגולה
  "17046": 4600,   // תל אביב - השלום
  "17048": 4640,   // צומת חולון
  "17050": 4660,   // חולון - וולפסון
  "17052": 4680,   // בת ים - אלי כהן - יוספטל
  "17054": 4690,   // בת ים - הקוממיות
  "17056": 4800,   // כפר חב"ד
  "17058": 5000,   // לוד
  "17060": 5010,   // רמלה
  "17062": 5150,   // לוד - גני אביב
  "17064": 5200,   // רחובות
  "17066": 5300,   // באר יעקב
  "17068": 5410,   // יבנה - מזרח
  "17070": 5800,   // אשדוד - עד הלום
  "17072": 5900,   // אשקלון
  "17074": 6300,   // בית שמש
  "17080": 7000,   // קריית גת
  "17082": 7300,   // באר שבע - צפון - האוניברסיטה
  "17084": 7320,   // באר שבע - מרכז
  "17086": 7500,   // דימונה
  "17088": 8550,   // להבים - רהט
  "17090": 8600,   // נמל התעופה בן גוריון (נתב"ג)
  "17092": 8700,   // כפר סבא - נורדאו
  "17094": 8800,   // ראש העין - צפון
  "17096": 9000,   // יבנה - מערב
  "17098": 9100,   // ראשון לציון - הראשונים
  "17100": 9200,   // הוד השרון - סוקולוב
  "17102": 9800,   // ראשון לציון - משה דיין
  "17104": 4900,   // תל אביב - ההגנה
  "17106": 9600,   // שדרות
  "17108": 9650,   // נתיבות
  "17109": 9700,   // אופקים
  "17110": 1240,   // יוקנעם - כפר יהושע
  "17111": 1280,   // בית שאן - דוד לוי
  "17112": 1260,   // עפולה
  "17113": 1250,   // מגדל העמק - כפר ברוך
  "17115": 1840,   // כרמיאל
  "17116": 1820,   // אחיהוד
  "17117": 1400,   // קריית מוצקין
  "17118": 680,    // ירושלים - יצחק נבון
  "17119": 6150,   // קריית מלאכי - יואב
  "17120": 6900,   // מזכרת בתיה
  "17121": 2940,   // רעננה - מערב
  "17122": 2960,   // רעננה - דרום
  // Not in current app schedule (jerusalem light rail / new opening, etc.):
  //   17076 (ירושלים גן חיות), 17078 (ירושלים מלחה), 17114 (נתניה קריית ספיר)
};

function buildStationIdMap(referenceJsonPath, gtfsStops) {
  // Reference JSON gives us the canonical rail.co.il station NAME per ID.
  // Mapping itself is via the hardcoded stop_code table above.
  let refNamesById = new Map();
  if (fs.existsSync(referenceJsonPath)) {
    try {
      const ref = JSON.parse(fs.readFileSync(referenceJsonPath, "utf8"));
      for (const s of ref.stations || []) refNamesById.set(Number(s.stationId), s.stationName);
    } catch (e) {
      console.warn(`[warn] could not parse reference JSON for names: ${e.message}`);
    }
  }
  const map = new Map(); // stop_id → { railId, stationName }
  const warnings = [];
  for (const stop of gtfsStops) {
    const railId = STOP_CODE_TO_RAIL_ID[String(stop.stop_code)];
    if (railId == null) {
      warnings.push(`unmapped GTFS rail stop: stop_code=${stop.stop_code} stop_id=${stop.stop_id} name="${stop.stop_name}"`);
      continue;
    }
    // Prefer the canonical name from the existing ref; fall back to GTFS name.
    const stationName = refNamesById.get(railId) || stop.stop_name;
    map.set(stop.stop_id, { railId, stationName });
  }
  if (warnings.length > 0) {
    console.warn(`[warn] ${warnings.length} GTFS rail stops not in STOP_CODE_TO_RAIL_ID table; skipped:`);
    for (const w of warnings) console.warn(`  ${w}`);
    console.warn(`[warn] If these are real new stations, add them to the table in scripts/build-schedule.js`);
  }
  return map;
}

async function loadRailRouteIds(zipPath) {
  const text = await readZipMember(zipPath, "routes.txt");
  const { rows } = parseCsv(text);
  const set = new Set();
  for (const row of rows) if (row.agency_id === RAIL_AGENCY_ID) set.add(row.route_id);
  return set;
}

async function loadWeekdayServiceIds(zipPath) {
  const text = await readZipMember(zipPath, "calendar.txt");
  const { rows } = parseCsv(text);
  const set = new Set();
  for (const row of rows) {
    if (SUPPORTED_DAYS.some((d) => row[d] === "1")) set.add(row.service_id);
  }
  return set;
}

async function loadRailWeekdayTrips(zipPath, railRouteIds, weekdayServiceIds) {
  const text = await readZipMember(zipPath, "trips.txt");
  const { rows } = parseCsv(text);
  const trips = new Map(); // trip_id → { route_id, service_id, trainNumber }
  for (const row of rows) {
    if (!railRouteIds.has(row.route_id)) continue;
    if (!weekdayServiceIds.has(row.service_id)) continue;
    trips.set(row.trip_id, {
      route_id: row.route_id,
      service_id: row.service_id,
      // For Israel Railways agency_id=2, trip_headsign holds the public train
      // number (e.g. "542"), not a destination string. Verified against the
      // existing rail_times_index.json content.
      trainNumber: row.trip_headsign,
    });
  }
  return trips;
}

async function loadRailStops(zipPath) {
  const text = await readZipMember(zipPath, "stops.txt");
  const { rows } = parseCsv(text);
  return rows; // Filtered later to only those referenced by rail trips.
}

// Stream stop_times.txt, accumulating per trip the ordered list of stops.
async function streamStopTimes(zipPath, tripIds) {
  const { rl, child } = streamZipMember(zipPath, "stop_times.txt");
  const headerCols = [];
  // trip_id → [{ stop_id, departure_time, arrival_time, stop_sequence }]
  const tripStops = new Map();
  for await (const line of rl) {
    if (!line) continue;
    if (headerCols.length === 0) {
      const h = parseCsvLine(line).map((c) => c.replace(/^﻿/, ""));
      headerCols.push(...h);
      continue;
    }
    const cells = parseCsvLine(line);
    const tripId = cells[headerCols.indexOf("trip_id")];
    if (!tripIds.has(tripId)) continue;
    const stopId = cells[headerCols.indexOf("stop_id")];
    const arrival = cells[headerCols.indexOf("arrival_time")];
    const departure = cells[headerCols.indexOf("departure_time")];
    const seq = Number(cells[headerCols.indexOf("stop_sequence")]);
    if (!tripStops.has(tripId)) tripStops.set(tripId, []);
    tripStops.get(tripId).push({ stop_id: stopId, arrival_time: arrival, departure_time: departure, stop_sequence: seq });
  }
  await new Promise((resolve, reject) => {
    child.on("close", (code) => code === 0 ? resolve() : reject(new Error(`unzip exited ${code} for stop_times.txt`)));
  });
  for (const stops of tripStops.values()) stops.sort((a, b) => a.stop_sequence - b.stop_sequence);
  return tripStops;
}

// Build the pairs structure: every (from, to) ordered pair that appears on
// at least one trip, with the list of trains serving it.
function buildPairs(tripStops, trips, stationMap, tripIdToTrainNumber) {
  const pairs = {}; // "fromRailId_toRailId" → [{ trainNumber, departureTime, arrivalTime, routeId }]
  const seenKeys = new Map(); // pairKey → Map<trainNumber, true> for dedup

  for (const [tripId, stops] of tripStops.entries()) {
    const trip = trips.get(tripId);
    if (!trip) continue;
    const trainNumber = tripIdToTrainNumber.get(tripId);
    if (!trainNumber) continue;
    const mapped = stops
      .map((s) => ({ ...s, mapped: stationMap.get(s.stop_id) }))
      .filter((s) => s.mapped);
    for (let i = 0; i < mapped.length; i++) {
      for (let j = i + 1; j < mapped.length; j++) {
        const from = mapped[i];
        const to = mapped[j];
        // App only reads pairs anchored on Jerusalem — skip the rest.
        const involvesJerusalem =
          from.mapped.railId === JERUSALEM_RAIL_ID || to.mapped.railId === JERUSALEM_RAIL_ID;
        if (!involvesJerusalem) continue;
        const key = `${from.mapped.railId}_${to.mapped.railId}`;
        if (!seenKeys.has(key)) seenKeys.set(key, new Map());
        // Dedup: a given trainNumber should appear once per pair.
        if (seenKeys.get(key).has(trainNumber)) continue;
        seenKeys.get(key).set(trainNumber, true);
        if (!pairs[key]) pairs[key] = [];
        pairs[key].push({
          trainNumber: String(trainNumber),
          departureTime: from.departure_time,
          arrivalTime: to.arrival_time,
          routeId: String(trip.route_id),
        });
      }
    }
  }

  // Sort each pair by departureTime ascending.
  for (const key of Object.keys(pairs)) {
    pairs[key].sort((a, b) => a.departureTime.localeCompare(b.departureTime));
  }
  return pairs;
}

function validateOutput(out, previous, allowShrink) {
  const issues = [];
  if (!Array.isArray(out.stations) || out.stations.length === 0) issues.push("stations missing/empty");
  if (!out.pairs || typeof out.pairs !== "object") issues.push("pairs missing");
  if (typeof out.generatedAt !== "string") issues.push("generatedAt missing");
  if (out.agencyId !== RAIL_AGENCY_ID) issues.push("agencyId mismatch");
  for (const s of out.stations || []) {
    if (!Number.isFinite(Number(s.stationId))) issues.push(`station ${JSON.stringify(s)} has non-numeric stationId`);
    if (!s.stationName) issues.push(`station ${JSON.stringify(s)} has empty stationName`);
  }
  for (const key of Object.keys(out.pairs || {})) {
    const trips = out.pairs[key];
    if (!Array.isArray(trips) || trips.length === 0) issues.push(`pair ${key} empty`);
    const seen = new Set();
    for (const t of trips || []) {
      if (!t.trainNumber) issues.push(`pair ${key} trip missing trainNumber`);
      if (!TIME_PATTERN.test(String(t.departureTime))) issues.push(`pair ${key} bad departureTime ${t.departureTime}`);
      if (!TIME_PATTERN.test(String(t.arrivalTime))) issues.push(`pair ${key} bad arrivalTime ${t.arrivalTime}`);
      if (seen.has(t.trainNumber)) issues.push(`pair ${key} duplicate trainNumber ${t.trainNumber}`);
      seen.add(t.trainNumber);
      const dep = timeToSeconds(t.departureTime);
      const arr = timeToSeconds(t.arrivalTime);
      if (dep != null && arr != null && arr < dep) issues.push(`pair ${key} arrivalTime ${t.arrivalTime} before departureTime ${t.departureTime}`);
    }
  }

  if (previous && !allowShrink) {
    const prevStationCount = Number(previous.stationCount) || 0;
    const prevPairCount = Number(previous.pairCount) || 0;
    if (prevStationCount > 0 && out.stationCount < prevStationCount * 0.9) {
      issues.push(`stationCount dropped >10%: ${prevStationCount} → ${out.stationCount}`);
    }
    if (prevPairCount > 0 && out.pairCount < prevPairCount * 0.8) {
      issues.push(`pairCount dropped >20%: ${prevPairCount} → ${out.pairCount}`);
    }
  }

  return issues;
}

function timeToSeconds(t) {
  if (!TIME_PATTERN.test(String(t))) return null;
  const [h, m, s] = String(t).split(":").map(Number);
  return h * 3600 + m * 60 + s;
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (!fs.existsSync(opts.zipPath)) die(`zip not found: ${opts.zipPath}`);

  console.log(`[info] reading GTFS from ${opts.zipPath}`);
  const railRouteIds = await loadRailRouteIds(opts.zipPath);
  console.log(`[info] rail routes: ${railRouteIds.size}`);
  if (railRouteIds.size === 0) die("no rail routes found — check agency_id");

  const weekdayServiceIds = await loadWeekdayServiceIds(opts.zipPath);
  console.log(`[info] weekday services: ${weekdayServiceIds.size}`);

  const trips = await loadRailWeekdayTrips(opts.zipPath, railRouteIds, weekdayServiceIds);
  console.log(`[info] rail weekday trips: ${trips.size}`);
  if (trips.size === 0) die("no rail weekday trips found");

  // trip_headsign carries the train number on agency 2 (rail).
  const tripIdToTrainNumber = new Map();
  for (const [tripId, info] of trips.entries()) {
    if (info.trainNumber) tripIdToTrainNumber.set(tripId, info.trainNumber);
  }

  const allStops = await loadRailStops(opts.zipPath);
  // Filter to stops referenced by rail trips (the GTFS has thousands of bus stops).
  // We need stop_times to know which stop_ids matter. Stream once to collect them
  // and then filter (we also do this within streamStopTimes for accumulation).
  console.log(`[info] streaming stop_times.txt …`);
  const tripStops = await streamStopTimes(opts.zipPath, new Set(trips.keys()));
  const usedStopIds = new Set();
  for (const stops of tripStops.values()) for (const s of stops) usedStopIds.add(s.stop_id);
  const railStops = allStops.filter((s) => usedStopIds.has(s.stop_id));
  console.log(`[info] rail stops referenced by weekday trips: ${railStops.length}`);

  const referenceJsonPath = opts.outPath; // existing file at the output path is our mapping reference
  const stationMap = buildStationIdMap(referenceJsonPath, railStops);
  console.log(`[info] mapped ${stationMap.size}/${railStops.length} rail stops to rail.co.il IDs`);

  const pairs = buildPairs(tripStops, trips, stationMap, tripIdToTrainNumber);
  const pairKeys = Object.keys(pairs);
  console.log(`[info] generated ${pairKeys.length} station pairs`);

  // Stations: every rail station present in the GTFS that we have a mapping
  // for. The app filters these to those with active Jerusalem pairs at render
  // time (app.js:217-221) — but emitting the full list matches the existing
  // schema (currently 65 stations) and future-proofs the dropdown if more
  // pairs are added.
  const stationsSet = new Map(); // railId → stationName
  for (const mapped of stationMap.values()) {
    stationsSet.set(mapped.railId, mapped.stationName);
  }
  const stations = [...stationsSet.entries()]
    .map(([id, name]) => ({ stationId: id, stationName: name }))
    .sort((a, b) => a.stationName.localeCompare(b.stationName, "he"));

  const out = {
    generatedFrom: path.basename(opts.zipPath),
    generatedAt: new Date().toISOString(),
    agencyId: RAIL_AGENCY_ID,
    serviceMode: "weekday-only",
    supportedDays: SUPPORTED_DAYS,
    unsupportedDays: UNSUPPORTED_DAYS,
    serviceCount: weekdayServiceIds.size,
    stationCount: stations.length,
    pairCount: pairKeys.length,
    stations,
    pairs,
  };

  let previous = null;
  if (fs.existsSync(opts.outPath)) {
    try { previous = JSON.parse(fs.readFileSync(opts.outPath, "utf8")); }
    catch (e) { console.warn(`[warn] could not parse existing output for regression check: ${e.message}`); }
  }

  const issues = validateOutput(out, previous, opts.allowShrink);
  if (issues.length > 0) {
    console.error(`[fail] validation found ${issues.length} issue(s):`);
    for (const i of issues.slice(0, 50)) console.error(`  - ${i}`);
    if (issues.length > 50) console.error(`  ... and ${issues.length - 50} more`);
    process.exit(2);
  }

  fs.writeFileSync(opts.outPath, JSON.stringify(out, null, 2) + "\n");
  console.log(`[done] wrote ${opts.outPath} (${stations.length} stations, ${pairKeys.length} pairs)`);
}

main().catch((e) => die(e?.stack || e?.message || String(e)));
