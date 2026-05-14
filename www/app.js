const JERUSALEM_STATION_ID = "680";
const DEFAULT_OTHER_STATION = "2800";

// Native (Capacitor Android) calls rail-api.rail.co.il directly — no
// CORS, and we inject the subscription key + browser-like headers
// from here instead of from a worker. Browser builds keep using the
// CF Worker proxy because they can't bypass CORS.
const IS_NATIVE = !!(
  window.Capacitor &&
  window.Capacitor.isNativePlatform &&
  window.Capacitor.isNativePlatform()
);

const DEFAULT_PROXY_BASE = "https://rail-proxy.idshk-train-ticket-20260414.workers.dev";
// Host root — callers append the full path (common/api/v1/* for booking,
// rjpa/api/v1/* for searchTrain). Mirrors the worker's pass-through model.
const RAIL_DIRECT_BASE = "https://rail-api.rail.co.il";
const REMOTE_SCHEDULE_URL = "https://cdn.jsdelivr.net/gh/yomach/train_ticket@main/www/rail_times_index.json";
const SUBSCRIPTION_KEY = "5e64d66cf03f4547bcac5de2de06b566";

// Local-dev override (browser only): localStorage.setItem("apiBase", "http://localhost:8787")
const API_BASE = IS_NATIVE
  ? RAIL_DIRECT_BASE
  : (() => {
      try {
        return localStorage.getItem("apiBase") || DEFAULT_PROXY_BASE;
      } catch {
        return DEFAULT_PROXY_BASE;
      }
    })();
const bookingHelpers = window.BookingHelpers || {};
const buildReservationUrl =
  bookingHelpers.buildReservationUrl ||
  ((params) => {
    const query = new URLSearchParams({
      page: "trip-reservation",
      fromStation: String(params.fromStation || ""),
      toStation: String(params.toStation || ""),
      date: params.date || "",
      time: params.time || "",
      scheduleType: params.scheduleType || "1",
      trainType: params.trainType || "empty",
    });

    const trainNumber = String(params.trainNumber || "").trim();
    if (trainNumber) {
      query.set("trainNumber", trainNumber);
    }

    return `https://www.rail.co.il/?${query.toString()}`;
  });
const shouldFallbackToRedirect =
  bookingHelpers.shouldFallbackToRedirect ||
  ((error) => /HTTP 403|Cloudflare|Attention Required|Access denied|fetch failed|NetworkError/i.test(String(error?.message || error || "")));

const state = {
  direction: "from-jerusalem",
  stations: [],
  pairs: {},
  meta: null,
  // booking flow
  step: "form", // "form" | "otp" | "result"
  phone: "",
  tripParams: null,
  // Platform info pre-fetched at submit; consumed at showResult.
  platformInfoPromise: null,
  platformInfoTripKey: "",
};

const { isValidScheduleShape, sanitizePlatform, extractPlatforms, tripKey } = window.ScheduleHelpers;

const elements = {
  directionGroup: document.getElementById("directionGroup"),
  stationLabel: document.getElementById("stationLabel"),
  voucherForm: document.getElementById("voucherForm"),
  otherStation: document.getElementById("otherStation"),
  tripDate: document.getElementById("tripDate"),
  tripTime: document.getElementById("tripTime"),
  trainNumber: document.getElementById("trainNumber"),
  scheduleType: document.getElementById("scheduleType"),
  trainType: document.getElementById("trainType"),
  statusText: document.getElementById("statusText"),
  phoneNumber: document.getElementById("phoneNumber"),
  // steps
  stepForm: document.getElementById("stepForm"),
  stepOtp: document.getElementById("stepOtp"),
  stepResult: document.getElementById("stepResult"),
  // otp
  otpPrompt: document.getElementById("otpPrompt"),
  otpInput: document.getElementById("otpInput"),
  otpStatusText: document.getElementById("otpStatusText"),
  otpBackBtn: document.getElementById("otpBackBtn"),
  otpConfirmBtn: document.getElementById("otpConfirmBtn"),
  // result
  resultId: document.getElementById("resultId"),
  tripSummary: document.getElementById("tripSummary"),
  platformInfo: document.getElementById("platformInfo"),
  qrcode: document.getElementById("qrcode"),
  resetBtn: document.getElementById("resetBtn"),
  // about
  aboutBtn: document.getElementById("aboutBtn"),
  aboutModal: document.getElementById("aboutModal"),
  closeAboutBtn: document.getElementById("closeAboutBtn"),
  currentVersion: document.getElementById("currentVersion"),
  latestVersion: document.getElementById("latestVersion"),
  latestVersionRow: document.getElementById("latestVersionRow"),
  latestVersionLink: document.getElementById("latestVersionLink"),
  dismissUpdateRow: document.getElementById("dismissUpdateRow"),
  dismissUpdateCheckbox: document.getElementById("dismissUpdateCheckbox"),
};

const VERSION = "0.3.0rc2";

// ── Step navigation ──────────────────────────────────────────────────────────

function showStep(step) {
  state.step = step;
  elements.stepForm.classList.toggle("hidden", step !== "form");
  elements.stepOtp.classList.toggle("hidden", step !== "otp");
  elements.stepResult.classList.toggle("hidden", step !== "result");
}

function showAbout(visible) {
  elements.aboutModal.classList.toggle("hidden", !visible);
  if (visible) {
    elements.aboutBtn.classList.remove("has-update");
  }
}

// ── Version Check ────────────────────────────────────────────────────────────

async function checkVersion() {
  // jsDelivr instead of GitHub API: GitHub limits unauth requests to 60/hr
  // per IP — bad on shared mobile NATs. jsDelivr's metadata API has no such
  // limit. Tradeoff: no release URL in the response — we construct it.
  try {
    const response = await fetch("https://data.jsdelivr.com/v1/packages/gh/yomach/train_ticket");
    if (!response.ok) {
      elements.latestVersion.textContent = "שגיאה בבדיקה";
      return;
    }
    const data = await response.json();
    // jsDelivr populates tags.latest only for packages that publish formal
    // releases. For tag-only GitHub repos it's often empty, so fall back to
    // the first entry in versions[] (jsDelivr orders newest-first).
    const latestTag = data?.tags?.latest || data?.versions?.[0]?.version;
    if (!latestTag) {
      elements.latestVersion.textContent = "שגיאה בבדיקה";
      return;
    }
    const latest = String(latestTag).replace(/^v/, "");

    elements.currentVersion.textContent = VERSION;
    elements.latestVersion.textContent = latest;
    elements.latestVersionLink.href = `https://github.com/yomach/train_ticket/releases/tag/v${latest}`;

    if (latest !== VERSION) {
      elements.aboutBtn.classList.add("has-update");
      const dismissed = localStorage.getItem("dismissedUpdateVersion");
      elements.dismissUpdateCheckbox.checked = dismissed === latest;
      elements.dismissUpdateRow.dataset.version = latest;
      elements.dismissUpdateRow.classList.remove("hidden");
      // Auto-popup only the first time the user sees this latest version.
      if (dismissed !== latest) showAbout(true);
    } else {
      elements.dismissUpdateRow.classList.add("hidden");
    }
  } catch (error) {
    console.error("Failed to check version:", error);
    elements.latestVersion.textContent = "שגיאה בבדיקה";
  }
}

// ── Cookie helpers ───────────────────────────────────────────────────────────

function setPhoneCookie(phone) {
  const expires = new Date();
  expires.setFullYear(expires.getFullYear() + 1);
  document.cookie = `phone=${encodeURIComponent(phone)};expires=${expires.toUTCString()};path=/`;
}

function getPhoneCookie() {
  const match = document.cookie.match(/(?:^|; )phone=([^;]*)/);
  return match ? decodeURIComponent(match[1]) : "";
}

// Per-direction last-picked station. Two cookies, one per direction —
// without this, switching from-jerusalem → to-jerusalem → from-jerusalem
// would carry the to-jerusalem origin into the from-jerusalem destination
// dropdown.
function lastStationCookieName(direction) {
  return direction === "to-jerusalem"
    ? "lastToJerusalemStation"
    : "lastFromJerusalemStation";
}

function setLastStationForDirection(direction, stationId) {
  const expires = new Date();
  expires.setFullYear(expires.getFullYear() + 1);
  document.cookie = `${lastStationCookieName(direction)}=${encodeURIComponent(stationId)};expires=${expires.toUTCString()};path=/`;
}

function getLastStationForDirection(direction) {
  const name = lastStationCookieName(direction);
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : "";
}

// ── Date helpers ─────────────────────────────────────────────────────────────

function setDefaultDate() {
  const now = new Date();
  const day = now.getDay();
  const offset = day === 5 ? 2 : day === 6 ? 1 : 0;
  now.setDate(now.getDate() + offset);

  const localDate = new Date(now.getTime() - now.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 10);
  elements.tripDate.value = localDate;
}

function isSupportedWeekday(value) {
  if (!value) return false;
  const day = new Date(`${value}T12:00:00`).getDay();
  return day >= 0 && day <= 4;
}

function formatTime(value) {
  if (!value) return "";
  const [hoursText, minutesText] = value.split(":");
  const hours = Number(hoursText);
  const normalizedHours = String(hours % 24).padStart(2, "0");
  return `${normalizedHours}:${minutesText}`;
}

// ── Station / trip rendering ─────────────────────────────────────────────────

function getPairKey(otherStationId) {
  return state.direction === "from-jerusalem"
    ? `${JERUSALEM_STATION_ID}_${otherStationId}`
    : `${otherStationId}_${JERUSALEM_STATION_ID}`;
}

function getAvailableStations() {
  return state.stations
    .filter((station) => String(station.stationId) !== JERUSALEM_STATION_ID)
    .filter((station) => (state.pairs[getPairKey(String(station.stationId))] || []).length > 0)
    .sort((a, b) => a.stationName.localeCompare(b.stationName, "he"));
}

function renderStationOptions() {
  const stations = getAvailableStations();
  elements.stationLabel.textContent = state.direction === "from-jerusalem" ? "תחנת יעד" : "תחנת מוצא";
  elements.otherStation.innerHTML = [
    '<option value="">בחר תחנה</option>',
    ...stations.map(
      (station) => `<option value="${station.stationId}">${station.stationName} (${station.stationId})</option>`
    ),
  ].join("");

  // Each direction has its own remembered station. We deliberately do NOT
  // fall back to the dropdown's current value across directions — the
  // to-jerusalem origin and the from-jerusalem destination are independent.
  const remembered = getLastStationForDirection(state.direction);
  const inList = (id) => stations.some((station) => String(station.stationId) === id);

  if (remembered && inList(remembered)) {
    elements.otherStation.value = remembered;
  } else if (inList(DEFAULT_OTHER_STATION)) {
    elements.otherStation.value = DEFAULT_OTHER_STATION;
  } else if (stations[0]) {
    elements.otherStation.value = String(stations[0].stationId);
  }
}

function todayLocalStr() {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

function getTripOptions() {
  const otherStationId = elements.otherStation.value;
  if (!otherStationId) return [];
  const options = state.pairs[getPairKey(otherStationId)] || [];

  if (elements.tripDate.value !== todayLocalStr()) return options;

  const now = new Date();
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  return options.filter((option) => {
    const [h, m] = formatTime(option.departureTime).split(":").map(Number);
    return h * 60 + m >= nowMinutes;
  });
}

function renderTimeOptions() {
  const options = getTripOptions();
  const previousValue = elements.tripTime.value;

  elements.tripTime.innerHTML = [
    '<option value="">בחר שעה</option>',
    ...options.map(
      (option) =>
        `<option value="${formatTime(option.departureTime)}">${formatTime(option.departureTime)} ← ${formatTime(option.arrivalTime)} • רכבת ${option.trainNumber}</option>`
    ),
  ].join("");

  if (options.some((option) => formatTime(option.departureTime) === previousValue)) {
    elements.tripTime.value = previousValue;
  } else if (options[0]) {
    elements.tripTime.value = formatTime(options[0].departureTime);
  }

  syncTrainNumberToTime();
}

function updateStatus() {
  if (!isSupportedWeekday(elements.tripDate.value)) {
    elements.tripTime.innerHTML = '<option value="">אין יכולת לעשות לסופשים</option>';
    elements.trainNumber.value = "";
    elements.statusText.textContent = "אין יכולת לעשות לסופשים.";
    return;
  }

  renderTimeOptions();

  const options = getTripOptions();
  if (!elements.otherStation.value || !options.length) {
    elements.statusText.textContent = "";
    return;
  }

  elements.statusText.textContent = "";
}

function syncTrainNumberToTime() {
  const selectedOption = getTripOptions().find(
    (option) => formatTime(option.departureTime) === elements.tripTime.value
  );
  elements.trainNumber.value = selectedOption ? String(selectedOption.trainNumber || "") : "";
}

// ── API calls ────────────────────────────────────────────────────────────────

// Mirrors cloudflare-worker/worker.js:18-29 — APIM rejects requests
// without these. In browser mode the proxy adds them; the fetch API
// would refuse most of these as forbidden headers anyway.
function apiHeaders() {
  if (!IS_NATIVE) return { "Content-Type": "application/json" };
  return {
    "Content-Type": "application/json",
    Accept: "application/json, text/plain, */*",
    "Accept-Language": "he-IL,he;q=0.9,en-US;q=0.8,en;q=0.7",
    Origin: "https://www.rail.co.il",
    Referer: "https://www.rail.co.il/",
    "Ocp-Apim-Subscription-Key": SUBSCRIPTION_KEY,
  };
}

async function apiPost(path, body) {
  const response = await fetch(`${API_BASE}/${path}`, {
    method: "POST",
    headers: apiHeaders(),
    credentials: "include",
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${await response.text()}`);
  }
  return response.json();
}

// Native-only: ask Android's SMS User Consent API to watch for the
// incoming OTP SMS. The system shows a one-tap dialog; on consent we
// auto-fill the OTP input. Browser builds skip this entirely.
function armSmsAutoFill() {
  if (!IS_NATIVE) return;
  const plugin = window.Capacitor?.Plugins?.SmsUserConsent;
  if (!plugin) return;
  plugin
    .startListening({})
    .then((result) => {
      if (!result || !result.otp) return;
      // Only fill if the user hasn't already typed something.
      if (elements.otpInput.value && elements.otpInput.value !== "") return;
      elements.otpInput.value = result.otp;
      elements.otpInput.dispatchEvent(new Event("input"));
      elements.otpStatusText.textContent = "קוד אימות מולא אוטומטית, ממשיך...";
      // Brief delay so the user can see the auto-fill before we submit.
      setTimeout(() => {
        if (state.step !== "otp") return;
        if (elements.otpConfirmBtn.disabled) return;
        handleOtpConfirm();
      }, 600);
    })
    .catch(() => {
      // User dismissed, timeout, or platform error — leave manual entry.
    });
}

async function sendOtp(phone) {
  return apiPost("common/api/v1/Otp/Send", {
    userContact: phone,
    type: "phone",
    languageId: "Hebrew",
  });
}

async function verifyOtp(phone, otp) {
  return apiPost("common/api/v1/Otp/Verify", {
    userContact: phone,
    type: "phone",
    otp,
    languageId: "Hebrew",
  });
}

async function orderSeat(params) {
  return apiPost("common/api/v1/TripReservation/OrderSeatForTrip", {
    fromStation: params.fromStation,
    toStation: params.toStation,
    departureDate: params.date,
    numberSeats: 1,
    systemTypeId: "2",
    trainNumber: Number(params.trainNumber),
    type: "phone",
    languageId: "Hebrew",
  });
}

// ── Platform info (searchTrain) ──────────────────────────────────────────────

async function fetchPlatformInfo({ fromStation, toStation, date, time, trainNumber }) {
  // searchTrain is POST with JSON (confirmed against the deployed API and
  // sh0oki/israel-rail-api). scheduleType is "ByDeparture", not "Departure".
  const url = `${API_BASE}/rjpa/api/v1/timetable/searchTrain`;
  const body = JSON.stringify({
    fromStation, toStation, date,
    hour: time,
    scheduleType: "ByDeparture",
    systemType: "2",
    languageId: "Hebrew",
  });

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: apiHeaders(),
        credentials: "include",
        body,
        signal: AbortSignal.timeout(8_000),
      });
      if (!res.ok) {
        if (res.status >= 500 && attempt === 0) continue;
        return null;
      }
      const data = await res.json();
      return extractPlatforms(data, trainNumber);
    } catch (e) {
      if (attempt === 0 && /Abort|Network|fetch/i.test(String(e?.message))) continue;
      return null;
    }
  }
  return null;
}

function redirectToOfficialBooking(params, statusElement) {
  if (statusElement) {
    statusElement.textContent = "המערכת הישירה חסומה כרגע. מעביר לאתר רכבת ישראל להשלמת ההזמנה...";
  }

  window.setTimeout(() => {
    window.location.assign(buildReservationUrl(params));
  }, 150);
}

// ── Form submission (step 1 → send OTP) ──────────────────────────────────────

async function handleSubmit(event) {
  event.preventDefault();

  if (!isSupportedWeekday(elements.tripDate.value)) {
    elements.statusText.textContent = "אין יכולת לבצע הזמנה לסופשים. נא לבחור יום ראשון עד חמישי.";
    return;
  }

  const otherStationId = elements.otherStation.value;
  if (!otherStationId || !elements.tripTime.value) {
    elements.statusText.textContent = "יש לבחור תחנה ושעה מתוך הרשימה.";
    return;
  }

  const phone = elements.phoneNumber.value.trim();
  if (!phone) {
    elements.statusText.textContent = "יש להזין מספר טלפון.";
    return;
  }

  const fromStation = state.direction === "from-jerusalem" ? JERUSALEM_STATION_ID : otherStationId;
  const toStation = state.direction === "from-jerusalem" ? otherStationId : JERUSALEM_STATION_ID;

  state.phone = phone;
  state.tripParams = {
    fromStation,
    toStation,
    date: elements.tripDate.value,
    time: elements.tripTime.value,
    trainNumber: elements.trainNumber.value,
    scheduleType: elements.scheduleType.value || "1",
    trainType: elements.trainType.value || "empty",
  };

  // Kick off platform lookup in parallel with orderSeat / OTP flow — by the
  // time showResult runs it's almost always already resolved.
  state.platformInfoTripKey = tripKey(state.tripParams);
  state.platformInfoPromise = fetchPlatformInfo(state.tripParams);

  const submitBtn = elements.voucherForm.querySelector("button[type=submit]");
  submitBtn.disabled = true;
  elements.statusText.textContent = "מזמין מקום...";

  // Try ordering with existing authToken first
  try {
    const data = await orderSeat(state.tripParams);
    const confirmationCode = data.result?.data?.confirmationCode;
    if (data.statusCode === 200 && data.result?.success && confirmationCode) {
      submitBtn.disabled = false;
      elements.statusText.textContent = "";
      await showResult(confirmationCode);
      return;
    }
    throw new Error(JSON.stringify(data.errorMessages || data));
  } catch (error) {
    if (!error.message.includes("401")) {
      submitBtn.disabled = false;
      console.error(error);

      //if (shouldFallbackToRedirect(error)) {
      //  redirectToOfficialBooking(state.tripParams, elements.statusText);
      //  return;
      //}

      elements.statusText.textContent = "שגיאה בהזמנה. נסה שנית.";
      return;
    }
  }

  // 401 — need fresh OTP
  elements.statusText.textContent = "שולח קוד אימות...";
  try {
    await sendOtp(phone);
    setPhoneCookie(phone);
    elements.statusText.textContent = "";
    submitBtn.disabled = false;
    elements.otpPrompt.textContent = `קוד אימות נשלח למספר ${phone}. יש להזין אותו כאן:`;
    elements.otpInput.value = "";
    elements.otpConfirmBtn.disabled = true;
    elements.otpStatusText.textContent = "";
    showStep("otp");
    armSmsAutoFill();
  } catch (error) {
    submitBtn.disabled = false;
    console.error(error);

    //if (shouldFallbackToRedirect(error)) {
    //  redirectToOfficialBooking(state.tripParams, elements.statusText);
    //  return;
    //}

    elements.statusText.textContent = "שגיאה בשליחת קוד האימות. נסה שנית.";
  }
}

// ── OTP confirmation (step 2 → verify + order) ───────────────────────────────

async function handleOtpConfirm() {
  const otp = elements.otpInput.value.trim();
  if (!otp) {
    elements.otpStatusText.textContent = "יש להזין קוד אימות.";
    return;
  }

  elements.otpStatusText.textContent = "מאמת קוד...";
  elements.otpConfirmBtn.disabled = true;
  elements.otpBackBtn.disabled = true;

  try {
    await verifyOtp(state.phone, otp);
  } catch (error) {
    console.error(error);

    //if (shouldFallbackToRedirect(error)) {
    //  redirectToOfficialBooking(state.tripParams, elements.otpStatusText);
    //  return;
    //}

    elements.otpStatusText.textContent = "קוד שגוי או פג תוקף. נסה שנית.";
    elements.otpConfirmBtn.disabled = false;
    elements.otpBackBtn.disabled = false;
    return;
  }

  elements.otpStatusText.textContent = "מזמין מקום...";

  try {
    const data = await orderSeat(state.tripParams);
    const confirmationCode = data.result?.data?.confirmationCode;

    if (data.statusCode !== 200 || !data.result?.success || !confirmationCode) {
      throw new Error(JSON.stringify(data.errorMessages || data));
    }

    await showResult(confirmationCode);
  } catch (error) {
    console.error(error);

    //if (shouldFallbackToRedirect(error)) {
    //  redirectToOfficialBooking(state.tripParams, elements.otpStatusText);
    //  return;
    //}

    elements.otpStatusText.textContent = "שגיאה בהזמנת המקום. נסה שנית.";
    elements.otpConfirmBtn.disabled = false;
    elements.otpBackBtn.disabled = false;
  }
}

// ── Result + barcode (step 3) ────────────────────────────────────────────────

function renderTripSummary() {
  if (!elements.tripSummary || !state.tripParams) return;
  const findName = (id) => {
    const match = state.stations.find((s) => String(s.stationId) === String(id));
    return match?.stationName || String(id);
  };
  const fromName = findName(state.tripParams.fromStation);
  const toName = findName(state.tripParams.toStation);
  const { date, time, trainNumber } = state.tripParams;
  // RTL: ← reads as "to" in the visual flow, matching the dropdown labels.
  elements.tripSummary.textContent = `${fromName} ← ${toName} • ${date} ${time} • רכבת ${trainNumber}`;
}

function renderPlatformLine(info) {
  if (!elements.platformInfo) return;
  const lines = [];
  if (info?.originPlatform != null) {
    lines.push(`עליה מרציף ${info.originPlatform}`);
  }
  if (info?.destPlatform != null) {
    const isJerusalem = state.tripParams?.toStation === JERUSALEM_STATION_ID;
    if (isJerusalem) {
      // Odd platforms (1, 3) exit right; even (2, 4) exit left — "with the
      // direction of travel" at Yitzhak Navon.
      const side = info.destPlatform % 2 === 1 ? "ימין" : "שמאל";
      lines.push(`ירידה ברציף ${info.destPlatform} לצד ${side} עם כיוון הנסיעה`);
    } else {
      lines.push(`ירידה ברציף ${info.destPlatform}`);
    }
  }
  if (lines.length) {
    elements.platformInfo.textContent = lines.join(" • ");
    elements.platformInfo.classList.remove("hidden");
  } else {
    elements.platformInfo.classList.add("hidden");
    elements.platformInfo.textContent = "";
  }
}

async function showResult(resultId) {
  elements.resultId.textContent = resultId;

  elements.qrcode.innerHTML = "";
  new QRCode(elements.qrcode, {
    text: resultId,
    width: 200,
    height: 200,
    colorDark: "#16202a",
    colorLight: "#ffffff",
  });

  renderTripSummary();

  if (elements.platformInfo) {
    elements.platformInfo.classList.add("hidden");
    elements.platformInfo.textContent = "";
  }

  showStep("result");

  // Consume the pre-fetch kicked off at submit. Usually already resolved.
  const expectedKey = tripKey(state.tripParams);
  const promise = state.platformInfoPromise;
  if (!promise || state.platformInfoTripKey !== expectedKey) return;

  let info = null;
  try {
    info = await promise;
  } catch {
    return;
  }
  // User may have started a new booking while we awaited.
  if (!info || state.platformInfoTripKey !== expectedKey) return;
  if (state.step !== "result") return;

  renderPlatformLine(info);
}

function handleReset() {
  showStep("form");
  elements.statusText.textContent = "";
  state.platformInfoPromise = null;
  state.platformInfoTripKey = "";
}

// ── Direction toggle ─────────────────────────────────────────────────────────

function handleDirectionClick(event) {
  const button = event.target.closest(".direction-btn");
  if (!button) return;

  state.direction = button.dataset.direction;
  document.querySelectorAll(".direction-btn").forEach((item) => {
    item.classList.toggle("active", item === button);
  });

  renderStationOptions();
  updateStatus();
}

// ── Data loading ─────────────────────────────────────────────────────────────

const SCHEDULE_CACHE_KEY = "scheduleCache";

function applySchedule(data) {
  state.stations = data.stations || [];
  state.pairs = data.pairs || {};
  state.meta = data;
  renderStationOptions();
  updateStatus();
}

function readScheduleCache() {
  try {
    const raw = localStorage.getItem(SCHEDULE_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!isValidScheduleShape(parsed)) {
      localStorage.removeItem(SCHEDULE_CACHE_KEY);
      return null;
    }
    return parsed;
  } catch {
    try { localStorage.removeItem(SCHEDULE_CACHE_KEY); } catch {}
    return null;
  }
}

async function refreshScheduleInBackground() {
  // 1. Apply a newer cached copy if present (no network needed).
  const cached = readScheduleCache();
  if (cached && (!state.meta?.generatedAt || cached.generatedAt > state.meta.generatedAt)) {
    if (state.step === "form") applySchedule(cached);
  }

  // 2. Try to refresh from the CDN.
  let remote = null;
  try {
    const res = await fetch(REMOTE_SCHEDULE_URL, { signal: AbortSignal.timeout(10_000) });
    if (!res.ok) return;
    remote = await res.json();
  } catch (e) {
    console.warn("Schedule refresh fetch failed:", e?.message || e);
    return;
  }
  if (!isValidScheduleShape(remote)) {
    console.warn("Schedule refresh: remote payload failed validation");
    return;
  }
  if (state.meta?.generatedAt && !(remote.generatedAt > state.meta.generatedAt)) return;

  try {
    localStorage.setItem(SCHEDULE_CACHE_KEY, JSON.stringify(remote));
  } catch (e) {
    console.warn("Schedule refresh: could not persist cache:", e?.message || e);
  }
  // Don't yank the UI under a user mid-OTP or viewing a result — the cache will
  // pick up next session either way.
  if (state.step === "form") applySchedule(remote);
}

async function loadData() {
  try {
    const response = await fetch("rail_times_index.json");
    const data = await response.json();
    if (!isValidScheduleShape(data)) throw new Error("bundled rail_times_index.json failed validation");
    applySchedule(data);
  } catch (error) {
    elements.statusText.textContent = "טעינת נתוני ה-GTFS נכשלה.";
    console.error(error);
    return;
  }

  // Fire-and-forget — never awaited.
  refreshScheduleInBackground();
}

// ── Event registration ───────────────────────────────────────────────────────

function registerEvents() {
  elements.directionGroup.addEventListener("click", handleDirectionClick);
  elements.otherStation.addEventListener("change", () => {
    if (elements.otherStation.value) {
      setLastStationForDirection(state.direction, elements.otherStation.value);
    }
    updateStatus();
  });
  elements.tripDate.addEventListener("change", updateStatus);
  elements.tripTime.addEventListener("change", syncTrainNumberToTime);
  elements.voucherForm.addEventListener("submit", handleSubmit);
  elements.otpInput.addEventListener("input", () => {
    elements.otpConfirmBtn.disabled = elements.otpInput.value.trim() === "";
  });
  elements.otpConfirmBtn.addEventListener("click", handleOtpConfirm);
  elements.otpBackBtn.addEventListener("click", () => showStep("form"));
  elements.resetBtn.addEventListener("click", handleReset);
  elements.aboutBtn.addEventListener("click", () => showAbout(true));
  elements.closeAboutBtn.addEventListener("click", () => showAbout(false));
  elements.aboutModal.addEventListener("click", (e) => {
    if (e.target === elements.aboutModal) showAbout(false);
  });
  elements.dismissUpdateCheckbox.addEventListener("change", () => {
    const version = elements.dismissUpdateRow.dataset.version;
    if (!version) return;
    if (elements.dismissUpdateCheckbox.checked) {
      localStorage.setItem("dismissedUpdateVersion", version);
    } else {
      localStorage.removeItem("dismissedUpdateVersion");
    }
  });
}

// ── Init ─────────────────────────────────────────────────────────────────────

setDefaultDate();
registerEvents();
loadData();
checkVersion();

const savedPhone = getPhoneCookie();
if (savedPhone) elements.phoneNumber.value = savedPhone;
