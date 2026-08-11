import { Router } from 'express';
import { asyncHandler } from '../middleware/asyncHandler.js';

export function metricsRoutes(metricsController) {
  const router = Router();
  router.get('/metrics', asyncHandler(metricsController.getMetrics));
  return router;
}
