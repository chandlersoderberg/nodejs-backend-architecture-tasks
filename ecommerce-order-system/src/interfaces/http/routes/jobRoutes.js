import { Router } from 'express';
import { asyncHandler } from '../middleware/asyncHandler.js';

export function jobRoutes(jobController) {
  const router = Router();

  router.get('/jobs/:id', asyncHandler(jobController.getById));
  router.post('/jobs/:id/cancel', asyncHandler(jobController.cancel));
  router.post('/jobs/:id/retry', asyncHandler(jobController.retry));

  return router;
}
