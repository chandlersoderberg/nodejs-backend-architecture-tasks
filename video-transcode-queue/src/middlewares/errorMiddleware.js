const ApiError = require('../utils/ApiError');
const logger = require('../utils/logger');

const errorHandler = (err, req, res, next) => {
  if (err instanceof ApiError) {
    return res.status(err.statusCode).json({ success: false, message: err.message });
  }

  logger.error('UnhandledError', { message: err.message, stack: err.stack });
  return res.status(500).json({ success: false, message: 'Something went wrong on the server.' });
};

const notFoundHandler = (req, res) => {
  res.status(404).json({ success: false, message: 'Route not found.' });
};

module.exports = { errorHandler, notFoundHandler };
