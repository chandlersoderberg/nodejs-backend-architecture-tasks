import { Router } from 'express';
import { asyncHandler } from '../middleware/asyncHandler.js';

export function workerRoutes(workerController) {
  const router = Router();
  router.get('/workers', asyncHandler(workerController.getStatus));
  return router;
}
