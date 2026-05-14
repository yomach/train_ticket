function shouldServeStatusPage(method = '', pathname = '/') {
  if (String(method).toUpperCase() !== 'GET') return false;
  const path = String(pathname || '/').replace(/\/+$/, '') || '/';
  return path === '/' || path === '/health';
}

function buildStatusPayload(path = '/') {
  return {
    ok: true,
    service: 'rail-proxy',
    path,
    message: 'Worker is running',
    usage: 'Use POST requests for VerifyOtp, SendOtp, and OrderSeatForTrip.',
  };
}

module.exports = {
  shouldServeStatusPage,
  buildStatusPayload,
};
