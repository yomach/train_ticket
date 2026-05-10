(function (root) {
  function buildReservationUrl(params) {
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
  }

  function shouldFallbackToRedirect(error) {
    const message = String(error?.message || error || "");
    return /HTTP 403|Cloudflare|Attention Required|Access denied|fetch failed|NetworkError/i.test(message);
  }

  const api = {
    buildReservationUrl,
    shouldFallbackToRedirect,
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }

  root.BookingHelpers = api;
})(typeof globalThis !== "undefined" ? globalThis : window);
