import express, { type Express } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import swaggerUi from 'swagger-ui-express';
import { checkDatabaseHealth } from './db';
import { corsOrigins, env, paystackConfigured } from './config/env';
import { openApiSpec } from './docs/openapi';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';
import { globalLimiter } from './middleware/rateLimit';
import { httpLogger, requestId } from './middleware/requestContext';
import { authRouter } from './modules/auth/auth.routes';
import { banksRouter, beneficiariesRouter } from './modules/beneficiaries/beneficiaries.routes';
import { notificationsRouter } from './modules/notifications/notifications.routes';
import { paymentsRouter } from './modules/payments/payments.routes';
import { profileRouter } from './modules/profile/profile.routes';
import { transactionsRouter } from './modules/transactions/transactions.routes';
import { transfersRouter } from './modules/transfers/transfers.routes';
import { walletRouter } from './modules/wallet/wallet.routes';
import { withdrawalsRouter } from './modules/withdrawals/withdrawals.routes';
import { ok } from './utils/respond';

export function createApp(): Express {
  const app = express();
  app.set('trust proxy', 1);
  app.disable('x-powered-by');

  app.use(
    helmet({
      // The API only serves JSON + API docs; the docs page needs inline assets.
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'", "'unsafe-inline'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", 'data:', 'https:'],
          connectSrc: ["'self'", 'https:'],
        },
      },
      crossOriginEmbedderPolicy: false,
      crossOriginResourcePolicy: { policy: 'cross-origin' },
      frameguard: false,
      referrerPolicy: { policy: 'no-referrer' },
    }),
  );

  app.use(
    cors({
      origin: corsOrigins,
      methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'Idempotency-Key', 'X-Request-Id', 'X-Paystack-Signature'],
      exposedHeaders: ['X-Request-Id', 'Idempotent-Replay'],
      maxAge: 600,
    }),
  );

  app.use(requestId);
  app.use(httpLogger);

  // Keep the exact bytes of JSON requests so provider webhooks can be verified.
  app.use(
    express.json({
      limit: '1mb',
      verify: (req, _res, buffer) => {
        (req as express.Request).rawBody = Buffer.from(buffer);
      },
    }),
  );
  app.use(express.urlencoded({ extended: false, limit: '64kb' }));

  app.use(globalLimiter);

  app.get('/api/health', async (_req, res) => {
    const database = await checkDatabaseHealth();
    res.status(database.ok ? 200 : 503).json({
      data: {
        status: database.ok ? 'ok' : 'degraded',
        service: 'payflow-api',
        version: '1.0.0',
        environment: env.NODE_ENV,
        demoMode: env.DEMO_MODE,
        paystackConfigured,
        database,
        uptimeSeconds: Math.round(process.uptime()),
        timestamp: new Date().toISOString(),
      },
    });
  });

  app.get('/api/health/live', (_req, res) => ok(res, { status: 'live' }));

  app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(openApiSpec, { customSiteTitle: 'PayFlow API' }));
  app.get('/api/openapi.json', (_req, res) => res.json(openApiSpec));
  app.get('/', (_req, res) => ok(res, { name: 'PayFlow API', docs: '/api/docs', health: '/api/health' }));

  app.use('/api/auth', authRouter);
  app.use('/api/wallet', walletRouter);
  app.use('/api/payments', paymentsRouter);
  app.use('/api/transfers', transfersRouter);
  app.use('/api/withdrawals', withdrawalsRouter);
  app.use('/api/beneficiaries', beneficiariesRouter);
  app.use('/api/banks', banksRouter);
  app.use('/api/transactions', transactionsRouter);
  app.use('/api/notifications', notificationsRouter);
  app.use('/api/profile', profileRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
