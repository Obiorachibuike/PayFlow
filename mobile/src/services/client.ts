import { API_URL, TIMEOUTS } from '../constants/config';
import type { ApiErrorBody } from '../types/api';

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details: unknown;
  readonly requestId: string | null;

  constructor(status: number, code: string, message: string, details?: unknown, requestId?: string | null) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
    this.requestId = requestId ?? null;
  }

  /** Codes the UI treats as "the session is gone, send the user to sign in". */
  get isAuthError(): boolean {
    return (
      this.status === 401 &&
      ['UNAUTHORIZED', 'INVALID_TOKEN', 'TOKEN_EXPIRED', 'TOKEN_REUSE_DETECTED', 'ACCOUNT_SUSPENDED'].includes(
        this.code,
      )
    );
  }
}

export interface TokenSource {
  getAccessToken: () => string | null;
  getRefreshToken: () => string | null;
  onTokensRefreshed: (tokens: { accessToken: string; refreshToken: string }) => void | Promise<void>;
  onSessionExpired: () => void | Promise<void>;
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  body?: unknown;
  query?: Record<string, string | number | boolean | undefined>;
  headers?: Record<string, string>;
  /** Set for money-moving calls so the backend can deduplicate retries. */
  idempotencyKey?: string;
  skipAuth?: boolean;
  timeoutMs?: number;
}

let tokenSource: TokenSource | null = null;

/** Wired once by the Redux store so the client can refresh tokens and sign out. */
export function configureApiClient(source: TokenSource): void {
  tokenSource = source;
}

function buildUrl(path: string, query?: RequestOptions['query']): string {
  const url = `${API_URL}${path.startsWith('/') ? path : `/${path}`}`;
  if (!query) return url;
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === '') continue;
    params.append(key, String(value));
  }
  const qs = params.toString();
  return qs ? `${url}?${qs}` : url;
}

async function parseBody(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return { raw: text } as unknown;
  }
}

function toApiError(status: number, body: unknown): ApiError {
  const errorBody = body as ApiErrorBody | null;
  const code = errorBody?.error?.code ?? (status === 401 ? 'UNAUTHORIZED' : 'UNKNOWN_ERROR');
  const message = errorBody?.error?.message ?? 'Something went wrong. Please try again.';
  return new ApiError(status, code, message, errorBody?.error?.details, errorBody?.requestId ?? null);
}

let refreshInFlight: Promise<{ accessToken: string; refreshToken: string } | null> | null = null;

async function refreshTokens(source: TokenSource): Promise<{ accessToken: string; refreshToken: string } | null> {
  const refreshToken = source.getRefreshToken();
  if (!refreshToken) return null;

  refreshInFlight ??= (async () => {
    try {
      const response = await fetch(buildUrl('/auth/refresh'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken }),
      });
      const body = await parseBody(response);
      if (!response.ok) return null;

      const data = (body as { data?: { accessToken?: string; refreshToken?: string } } | null)?.data;
      if (!data?.accessToken || !data.refreshToken) return null;

      const tokens = { accessToken: data.accessToken, refreshToken: data.refreshToken };
      await source.onTokensRefreshed(tokens);
      return tokens;
    } catch {
      return null;
    } finally {
      setTimeout(() => {
        refreshInFlight = null;
      }, 0);
    }
  })();

  return refreshInFlight;
}

async function request<T>(path: string, options: RequestOptions = {}, isRetry = false): Promise<T> {
  const source = tokenSource;
  const headers: Record<string, string> = { Accept: 'application/json', ...options.headers };
  if (options.body !== undefined) headers['Content-Type'] = 'application/json';

  if (!options.skipAuth) {
    const accessToken = source?.getAccessToken();
    if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
  }

  if (options.idempotencyKey) headers['Idempotency-Key'] = options.idempotencyKey;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? TIMEOUTS.requestMs);

  let response: Response;
  try {
    response = await fetch(buildUrl(path, options.query), {
      method: options.method ?? 'GET',
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: controller.signal,
    });
  } catch (error) {
    clearTimeout(timeout);
    if (error instanceof Error && error.name === 'AbortError') {
      throw new ApiError(0, 'NETWORK_TIMEOUT', 'The request timed out. Check your connection and try again.');
    }
    throw new ApiError(0, 'NETWORK_ERROR', 'We could not reach PayFlow. Check your connection and try again.');
  } finally {
    clearTimeout(timeout);
  }

  const body = await parseBody(response);

  if (response.status === 401 && !isRetry && !options.skipAuth && source && source.getRefreshToken()) {
    const tokens = await refreshTokens(source);
    if (tokens) {
      return request<T>(path, options, true);
    }
    await source.onSessionExpired();
  }

  if (!response.ok) throw toApiError(response.status, body);

  // The API returns `{ data, meta }`; callers usually want the payload itself.
  if (body && typeof body === 'object' && 'data' in (body as Record<string, unknown>)) {
    return (body as { data: T }).data;
  }
  return body as T;
}

/** Raw request that keeps the `{ data, meta }` envelope (pagination). */
export async function requestWithMeta<T>(
  path: string,
  options: RequestOptions = {},
): Promise<{ data: T; meta?: Record<string, unknown> | null }> {
  const source = tokenSource;
  const headers: Record<string, string> = { Accept: 'application/json', ...options.headers };
  if (!options.skipAuth) {
    const accessToken = source?.getAccessToken();
    if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
  }

  const response = await fetch(buildUrl(path, options.query), {
    method: options.method ?? 'GET',
    headers,
    body: options.body === undefined ? undefined : JSON.stringify({ ...(options.body as object) }),
  });

  const body = await parseBody(response);
  if (!response.ok) throw toApiError(response.status, body);
  return body as { data: T; meta?: Record<string, unknown> | null };
}

export const http = {
  get: <T>(path: string, options?: RequestOptions) => request<T>(path, { ...options, method: 'GET' }),
  post: <T>(path: string, body?: unknown, options?: RequestOptions) =>
    request<T>(path, { ...options, method: 'POST', body }),
  patch: <T>(path: string, body?: unknown, options?: RequestOptions) =>
    request<T>(path, { ...options, method: 'PATCH', body }),
  put: <T>(path: string, body?: unknown, options?: RequestOptions) =>
    request<T>(path, { ...options, method: 'PUT', body }),
  delete: <T>(path: string, body?: unknown, options?: RequestOptions) =>
    request<T>(path, { ...options, method: 'DELETE', body }),
  withMeta: requestWithMeta,
};

export const apiClientInternals = {
  buildUrl,
  resetRefresh: () => {
    refreshInFlight = null;
  },
};
