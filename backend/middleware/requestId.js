const { v4: uuidv4 } = require('uuid');

// Only trust a client-supplied ID if it's short and alphanumeric (plus - and _).
// This prevents log-injection / header-spoofing via an arbitrary X-Request-Id.
const SAFE_ID = /^[A-Za-z0-9_-]{1,64}$/;

// Middleware: Attach a unique request ID to every incoming request and send it
// back in the `X-Request-Id` response header. This ID ties the client response
// to the server logs, making it easy to trace a specific request end-to-end.
const requestIdMiddleware = (req, res, next) => {
  const supplied = req.headers['x-request-id'];
  const requestId = typeof supplied === 'string' && SAFE_ID.test(supplied)
    ? supplied
    : `req_${uuidv4().replace(/-/g, '')}`;
  req.requestId = requestId;
  res.setHeader('X-Request-Id', requestId);
  next();
};

module.exports = { requestIdMiddleware };

