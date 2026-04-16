import { Router } from 'express';

export function healthRoutes(): Router {
  const router = Router();
  router.get('/health', (_req, res) => {
    res.send('ok');
  });
  return router;
}
