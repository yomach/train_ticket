const JERUSALEM_STATION_ID = "680";
const DEFAULT_OTHER_STATION = "2800";
const API_BASE = "https://rail-proxy.idshk-train-ticket-20260414.workers.dev";
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
};

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
  qrcode: document.getElementById("qrcode"),
  resetBtn: document.getElementById("resetBtn"),
};

// ── Step navigation ──────────────────────────────────────────────────────────

function showStep(step) {
  state.step = step;
  elements.stepForm.classList.toggle("hidden", step !== "form");
  elements.stepOtp.classList.toggle("hidden", step !== "otp");
  elements.stepResult.classList.toggle("hidden", step !== "result");
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

function setLastToJerusalemStation(stationId) {
  const expires = new Date();
  expires.setFullYear(expires.getFullYear() + 1);
  document.cookie = `lastToJerusalemStation=${encodeURIComponent(stationId)};expires=${expires.toUTCString()};path=/`;
}

function getLastToJerusalemStation() {
  const match = document.cookie.match(/(?:^|; )lastToJerusalemStation=([^;]*)/);
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
  const previousValue = elements.otherStation.value;
  const stations = getAvailableStations();
  elements.stationLabel.textContent = state.direction === "from-jerusalem" ? "תחנת יעד" : "תחנת מוצא";
  elements.otherStation.innerHTML = [
    '<option value="">בחר תחנה</option>',
    ...stations.map(
      (station) => `<option value="${station.stationId}">${station.stationName} (${station.stationId})</option>`
    ),
  ].join("");

  const remembered =
    state.direction === "to-jerusalem" ? getLastToJerusalemStation() : "";
  const inList = (id) => stations.some((station) => String(station.stationId) === id);

  // For to-jerusalem, the remembered station wins over the previously-shown
  // value: the dropdown often holds the from-jerusalem destination at toggle
  // time, which would otherwise mask the user's saved origin preference.
  if (remembered && inList(remembered)) {
    elements.otherStation.value = remembered;
  } else if (inList(previousValue)) {
    elements.otherStation.value = previousValue;
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

async function apiPost(path, body) {
  const response = await fetch(`${API_BASE}/${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${await response.text()}`);
  }
  return response.json();
}

async function sendOtp(phone) {
  return apiPost("Otp/Send", {
    userContact: phone,
    type: "phone",
    languageId: "Hebrew",
  });
}

async function verifyOtp(phone, otp) {
  return apiPost("Otp/Verify", {
    userContact: phone,
    type: "phone",
    otp,
    languageId: "Hebrew",
  });
}

async function orderSeat(params) {
  return apiPost("TripReservation/OrderSeatForTrip", {
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
      showResult(confirmationCode);
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
    elements.otpStatusText.textContent = "";
    showStep("otp");
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

    showResult(confirmationCode);
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

function showResult(resultId) {
  elements.resultId.textContent = resultId;

  elements.qrcode.innerHTML = "";
  new QRCode(elements.qrcode, {
    text: resultId,
    width: 200,
    height: 200,
    colorDark: "#16202a",
    colorLight: "#ffffff",
  });

  showStep("result");
}

function handleReset() {
  showStep("form");
  elements.statusText.textContent = "";
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

async function loadData() {
  try {
    const response = await fetch("rail_times_index.json");
    const data = await response.json();
    state.stations = data.stations || [];
    state.pairs = data.pairs || {};
    state.meta = data;

    renderStationOptions();
    updateStatus();
  } catch (error) {
    elements.statusText.textContent = "טעינת נתוני ה-GTFS נכשלה.";
    console.error(error);
  }
}

// ── Event registration ───────────────────────────────────────────────────────

function registerEvents() {
  elements.directionGroup.addEventListener("click", handleDirectionClick);
  elements.otherStation.addEventListener("change", () => {
    if (state.direction === "to-jerusalem" && elements.otherStation.value) {
      setLastToJerusalemStation(elements.otherStation.value);
    }
    updateStatus();
  });
  elements.tripDate.addEventListener("change", updateStatus);
  elements.tripTime.addEventListener("change", syncTrainNumberToTime);
  elements.voucherForm.addEventListener("submit", handleSubmit);
  elements.otpConfirmBtn.addEventListener("click", handleOtpConfirm);
  elements.otpBackBtn.addEventListener("click", () => showStep("form"));
  elements.resetBtn.addEventListener("click", handleReset);
}

// ── Init ─────────────────────────────────────────────────────────────────────

setDefaultDate();
registerEvents();
loadData();

const savedPhone = getPhoneCookie();
if (savedPhone) elements.phoneNumber.value = savedPhone;
