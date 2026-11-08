import axios from 'axios';
import { env, paystackConfigured } from '../../config/env';
import { logger } from '../../config/logger';
import { AppError, ErrorCodes, badRequest, serviceUnavailable } from '../../utils/errors';
import { hmacSha512Hex, timingSafeEqualHex } from '../../utils/crypto';

export type ProviderName = 'PAYSTACK' | 'DEMO';

export interface InitializePaymentInput {
  email: string;
  amountMinor: bigint;
  currency: string;
  reference: string;
  callbackUrl: string;
  metadata?: Record<string, unknown>;
}

export interface InitializePaymentResult {
  authorizationUrl: string | null;
  accessCode: string | null;
  providerReference: string;
}

export type ProviderPaymentStatus = 'success' | 'failed' | 'pending';

export interface VerifyPaymentResult {
  status: ProviderPaymentStatus;
  amountMinor: bigint;
  currency: string;
  reference: string;
  providerReference: string | null;
  channel: string | null;
  paidAt: Date | null;
  gatewayResponse: string | null;
  raw: Record<string, unknown>;
}

export interface PaymentProvider {
  readonly name: ProviderName;
  initialize(input: InitializePaymentInput): Promise<InitializePaymentResult>;
  verify(reference: string): Promise<VerifyPaymentResult>;
  verifyWebhookSignature(rawBody: Buffer, signature: string | undefined): boolean;
}

// ---------------------------------------------------------------------------
// Paystack (TEST MODE ONLY)
// ---------------------------------------------------------------------------

function paystackBaseUrl(): string {
  return process.env.PAYSTACK_BASE_URL ?? env.PAYSTACK_BASE_URL;
}

function paystackSecret(): string {
  const secret = process.env.PAYSTACK_SECRET_KEY ?? env.PAYSTACK_SECRET_KEY;
  if (!secret) {
    throw serviceUnavailable(
      ErrorCodes.PAYMENT_PROVIDER_UNAVAILABLE,
      'Paystack is not configured on this server. Use demo funding instead.',
    );
  }
  return secret;
}

export const paystackProvider: PaymentProvider = {
  name: 'PAYSTACK',

  async initialize(input) {
    const secret = paystackSecret();
    try {
      const { data } = await axios.post(
        `${paystackBaseUrl()}/transaction/initialize`,
        {
          email: input.email,
          amount: input.amountMinor.toString(),
          currency: input.currency,
          reference: input.reference,
          callback_url: input.callbackUrl,
          metadata: input.metadata ?? {},
        },
        {
          headers: {
            Authorization: `Bearer ${secret}`,
            'Content-Type': 'application/json',
          },
          timeout: 15_000,
        },
      );

      if (!data?.status || !data?.data?.authorization_url) {
        logger.error({ message: data?.message }, 'Paystack initialization failed');
        throw serviceUnavailable(
          ErrorCodes.PAYMENT_PROVIDER_UNAVAILABLE,
          'The payment provider could not start this transaction. Please try again.',
        );
      }

      return {
        authorizationUrl: data.data.authorization_url as string,
        accessCode: (data.data.access_code as string) ?? null,
        providerReference: (data.data.reference as string) ?? input.reference,
      };
    } catch (error) {
      if (error instanceof AppError) throw error;
      logger.error({ err: error }, 'Paystack initialize request failed');
      throw serviceUnavailable(
        ErrorCodes.PAYMENT_PROVIDER_UNAVAILABLE,
        'The payment provider is unavailable right now. Please try again shortly.',
      );
    }
  },

  async verify(reference) {
    const secret = paystackSecret();
    try {
      const { data } = await axios.get(
        `${paystackBaseUrl()}/transaction/verify/${encodeURIComponent(reference)}`,
        {
          headers: { Authorization: `Bearer ${secret}` },
          timeout: 15_000,
        },
      );

      const payload = data?.data ?? {};
      const status: ProviderPaymentStatus =
        payload.status === 'success' ? 'success' : payload.status === 'failed' ? 'failed' : 'pending';

      return {
        status,
        amountMinor: BigInt(String(payload.amount ?? '0')),
        currency: String(payload.currency ?? 'NGN'),
        reference: String(payload.reference ?? reference),
        providerReference: payload.id ? String(payload.id) : null,
        channel: payload.channel ? String(payload.channel) : null,
        paidAt: payload.paid_at ? new Date(payload.paid_at) : null,
        gatewayResponse: payload.gateway_response ? String(payload.gateway_response) : null,
        raw: payload as Record<string, unknown>,
      };
    } catch (error) {
      if (error instanceof AppError) throw error;
      logger.error({ err: error, reference }, 'Paystack verify request failed');
      throw serviceUnavailable(
        ErrorCodes.PAYMENT_PROVIDER_UNAVAILABLE,
        'Could not reach the payment provider to verify this payment.',
      );
    }
  },

  /**
   * Paystack signs the raw request body with HMAC-SHA512 using the secret key.
   * The raw body (not the re-serialised JSON) must be used for comparison.
   */
  verifyWebhookSignature(rawBody, signature) {
    const secret = process.env.PAYSTACK_WEBHOOK_SECRET ?? env.PAYSTACK_WEBHOOK_SECRET ?? process.env.PAYSTACK_SECRET_KEY ?? env.PAYSTACK_SECRET_KEY;
    if (!secret || !signature) return false;
    const expected = hmacSha512Hex(secret, rawBody);
    try {
      return timingSafeEqualHex(expected, signature);
    } catch {
      return false;
    }
  },
};

// ---------------------------------------------------------------------------
// Demo provider (clearly simulated, never presented as real money)
// ---------------------------------------------------------------------------

export interface DemoProviderOptions {
  simulateFailure?: boolean;
}

export const demoProvider: PaymentProvider = {
  name: 'DEMO',

  async initialize(input) {
    if (!env.DEMO_MODE) {
      throw serviceUnavailable(
        ErrorCodes.DEMO_ONLY,
        'Demo funding is disabled on this server.',
      );
    }
    return {
      authorizationUrl: null,
      accessCode: null,
      providerReference: `DEMO-${input.reference}`,
    };
  },

  async verify(reference) {
    return {
      status: 'success',
      amountMinor: 0n, // Replaced by the caller with the server-side expected amount.
      currency: 'NGN',
      reference,
      providerReference: `DEMO-${reference}`,
      channel: 'demo',
      paidAt: new Date(),
      gatewayResponse: 'Simulated demo payment approved',
      raw: { simulated: true, reference },
    };
  },

  verifyWebhookSignature() {
    return false;
  },
};

export function getProvider(channel: ProviderName): PaymentProvider {
  if (channel === 'PAYSTACK') {
    if (!paystackConfigured) {
      throw serviceUnavailable(
        ErrorCodes.PAYMENT_PROVIDER_UNAVAILABLE,
        'Paystack sandbox is not configured (missing PAYSTACK_SECRET_KEY). Use demo funding.',
      );
    }
    return paystackProvider;
  }
  if (channel === 'DEMO') {
    if (!env.DEMO_MODE) {
      throw badRequest(ErrorCodes.DEMO_ONLY, 'Demo funding is disabled');
    }
    return demoProvider;
  }
  throw badRequest(ErrorCodes.VALIDATION_ERROR, 'Unsupported payment channel');
}
