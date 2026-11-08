import type { AuthContext } from '../middleware/auth';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      requestId: string;
      /** Exact request bytes, captured for provider signature verification. */
      rawBody?: Buffer;
      auth?: AuthContext;
    }
  }
}

export {};
