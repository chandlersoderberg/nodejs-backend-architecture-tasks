import { Router } from 'express';
import { asyncHandler } from '../middleware/asyncHandler.js';

export function orderRoutes(orderController) {
  const router = Router();

  router.post('/orders', asyncHandler(orderController.create));
  router.get('/orders/:id', asyncHandler(orderController.getById));

  return router;
}
