function errorHandler(err, req, res, next) {
  console.error(`[ERROR] ${err.stack || err.message}`);
  res.status(err.status || 500).json({
    success: false,
    message: err.message || 'Internal server error',
  });
}

module.exports = { errorHandler };
