import { ApiError, apiClientInternals, configureApiClient, http } from '../client';

interface MockResponse {
  ok?: boolean;
  status?: number;
  body?: unknown;
}

type FetchMock = jest.Mock<
  (input: RequestInfo | URL, init?: RequestInit) => Promise<Partial<Response>>
>;

function mockFetchOnce(response: MockResponse): FetchMock {
  const fetchMock = jest.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => ({
    ok: response.ok ?? true,
    status: response.status ?? 200,
    text: async () => JSON.stringify(response.body ?? { data: {} }),
  })) as unknown as FetchMock;
  global.fetch = fetchMock as unknown as typeof fetch;
  return fetchMock;
}

describe('API client', () => {
  beforeEach(() => {
    apiClientInternals.resetRefresh();
    configureApiClient({
      getAccessToken: () => 'access-token',
      getRefreshToken: () => null,
      onTokensRefreshed: () => undefined,
      onSessionExpired: () => undefined,
    });
  });

  it('unwraps the { data } envelope', async () => {
    const fetchMock = mockFetchOnce({ body: { data: { balanceMinor: 5000 }, meta: { limit: 20 } } });

    const result = await http.get<{ balanceMinor: number }>('/wallet/balance');

    expect(result.balanceMinor).toBe(5000);
    expect(fetchMock.mock.calls[0]?.[1]?.headers).toMatchObject({ Authorization: 'Bearer access-token' });
  });

  it('appends query parameters and skips empty values', async () => {
    const fetchMock = mockFetchOnce({ body: { data: [] } });
    await http.get('/transactions', { query: { limit: 20, search: '', cursor: undefined } });
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain('limit=20');
    expect(String(fetchMock.mock.calls[0]?.[0])).not.toContain('search');
  });

  it('maps error envelopes onto ApiError with the server code', async () => {
    mockFetchOnce({
      ok: false,
      status: 409,
      body: { error: { code: 'INSUFFICIENT_FUNDS', message: 'Insufficient wallet balance' }, requestId: 'req-1' },
    });

    await expect(http.post('/transfers', {})).rejects.toMatchObject({
      name: 'ApiError',
      status: 409,
      code: 'INSUFFICIENT_FUNDS',
    });
  });

  it('reports a network failure as an ApiError', async () => {
    global.fetch = jest.fn(async (_input: RequestInfo | URL, _init?: RequestInit): Promise<Response> => {
      throw new TypeError('Network request failed');
    }) as unknown as typeof fetch;

    await expect(http.get('/wallet')).rejects.toBeInstanceOf(ApiError);
  });

  it('sends the idempotency key on money-moving calls', async () => {
    const fetchMock = mockFetchOnce({ body: { data: { reference: 'PF-1' } } });
    await http.post('/transfers', { amountMinor: 100 }, { idempotencyKey: 'key-1' });
    expect(fetchMock.mock.calls[0]?.[1]?.headers).toMatchObject({ 'Idempotency-Key': 'key-1' });
  });

  it('refreshes an expired access token once and retries the original call', async () => {
    const tokens: string[] = [];
    configureApiClient({
      getAccessToken: () => tokens[tokens.length - 1] ?? 'stale-token',
      getRefreshToken: () => 'refresh-token',
      onTokensRefreshed: (next) => {
        tokens.push(next.accessToken);
      },
      onSessionExpired: () => undefined,
    });

    const calls: string[] = [];
    global.fetch = jest.fn(async (input: RequestInfo | URL, _init?: RequestInit) => {
      const url = String(input);
      calls.push(url);
      if (url.includes('/auth/refresh')) {
        return {
          ok: true,
          status: 200,
          text: async () => JSON.stringify({ data: { accessToken: 'fresh-token', refreshToken: 'next-refresh' } }),
        } as unknown as Response;
      }
      if (calls.filter((entry) => entry.includes('/wallet')).length === 1) {
        return {
          ok: false,
          status: 401,
          text: async () => JSON.stringify({ error: { code: 'TOKEN_EXPIRED', message: 'expired' } }),
        } as unknown as Response;
      }
      return { ok: true, status: 200, text: async () => JSON.stringify({ data: { ok: true } }) } as unknown as Response;
    }) as unknown as typeof fetch;

    const result = await http.get<{ ok: boolean }>('/wallet');
    expect(result.ok).toBe(true);
    expect(calls.filter((entry) => entry.includes('/auth/refresh'))).toHaveLength(1);
    expect(tokens).toEqual(['fresh-token']);
  });

  it('signs the user out when the refresh token is rejected', async () => {
    const onSessionExpired = jest.fn();
    configureApiClient({
      getAccessToken: () => 'stale',
      getRefreshToken: () => 'refresh-token',
      onTokensRefreshed: () => undefined,
      onSessionExpired,
    });

    global.fetch = jest.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/auth/refresh')) {
        return {
          ok: false,
          status: 401,
          text: async () => JSON.stringify({ error: { code: 'TOKEN_REUSE_DETECTED', message: 'reuse' } }),
        } as unknown as Response;
      }
      return {
        ok: false,
        status: 401,
        text: async () => JSON.stringify({ error: { code: 'TOKEN_EXPIRED', message: 'expired' } }),
      } as unknown as Response;
    }) as unknown as typeof fetch;

    await expect(http.get('/wallet')).rejects.toBeInstanceOf(ApiError);
    expect(onSessionExpired).toHaveBeenCalled();
  });
});
