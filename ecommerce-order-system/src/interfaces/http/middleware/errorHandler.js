import { logger } from '../../../infrastructure/logger/logger.js';

// eslint-disable-next-line no-unused-vars
export function errorHandler(err, req, res, next) {
  logger.error('UNHANDLED_ERROR', { message: err.message, path: req.path });
  res.status(500).json({ error: 'Internal server error' });
}

export function notFoundHandler(req, res) {
  res.status(404).json({ error: 'Route not found' });
}
