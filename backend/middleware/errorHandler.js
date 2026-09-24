// Global Express error handler, extracted from server.js unchanged (apart
// from the ImageValidationError branch) so route-level tests can mount the
// exact production error mapping.
// eslint-disable-next-line no-unused-vars -- Express needs the 4-arg signature
const errorHandler = (err, req, res, next) => {
  console.error(`[Error] [${req.requestId}] ${req.method} ${req.path}:`, err.message, err.stack);

  // Multer errors
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({
      success: false,
      error: 'File too large (max 10MB)',
      code: 'FILE_TOO_LARGE',
      request_id: req.requestId,
    });
  }
  // Rejected image upload (utils/safeImage.js) -- a client error with a
  // user-safe message, so it is returned as-is even in production.
  if (err.name === 'ImageValidationError') {
    return res
      .status(400)
      .json({ success: false, error: err.message, code: err.code, request_id: req.requestId });
  }
  if (err.code === 'LIMIT_FILE_COUNT') {
    return res.status(400).json({
      success: false,
      error: 'Too many files (max 100)',
      code: 'TOO_MANY_FILES',
      request_id: req.requestId,
    });
  }
  if (err.message?.includes('CORS')) {
    return res
      .status(403)
      .json({ success: false, error: 'CORS error', code: 'CORS_ERROR', request_id: req.requestId });
  }

  const status = err.status || err.statusCode || 500;
  return res.status(status).json({
    success: false,
    error: process.env.NODE_ENV === 'production' ? 'Internal server error' : err.message,
    code: err.code || 'INTERNAL_ERROR',
    request_id: req.requestId,
  });
};

module.exports = { errorHandler };
