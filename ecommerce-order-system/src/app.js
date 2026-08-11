import express from 'express';
import { errorHandler, notFoundHandler } from './interfaces/http/middleware/errorHandler.js';

export function createApp(routers) {
  const app = express();

  app.use(express.json());

  for (const router of routers) {
    app.use('/', router);
  }

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
