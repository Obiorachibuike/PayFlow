/**
 * OpenAPI 3.0 description of the PayFlow API (served at /api/docs).
 * Money is always expressed as integer minor units (kobo) in `*Minor` fields.
 */
const bearer = [{ bearerAuth: [] }];

const errorResponse = (description: string) => ({
  description,
  content: {
    'application/json': {
      schema: { $ref: '#/components/schemas/ErrorResponse' },
    },
  },
});

const jsonBody = (schema: Record<string, unknown>) => ({
  required: true,
  content: { 'application/json': { schema } },
});

const dataResponse = (description: string, schema: Record<string, unknown>) => ({
  description,
  content: {
    'application/json': {
      schema: {
        type: 'object',
        properties: { data: schema },
      },
    },
  },
});

export const openApiSpec = {
  openapi: '3.0.3',
  info: {
    title: 'PayFlow API',
    version: '1.0.0',
    description: [
      'PayFlow is a demo fintech wallet. Every monetary value in requests and responses is an',
      'integer number of minor units (kobo for NGN). All balances are derived from an immutable',
      'double-entry ledger.',
      '',
      '**Sandbox only.** Payments run against the Paystack test environment and internal transfers',
      'move simulated NGN balances. No real money is ever moved.',
    ].join('\n'),
    license: { name: 'MIT' },
  },
  servers: [{ url: '/', description: 'This PayFlow API instance' }],
  tags: [
    { name: 'Auth' },
    { name: 'Wallet' },
    { name: 'Payments' },
    { name: 'Transfers' },
    { name: 'Withdrawals' },
    { name: 'Beneficiaries' },
    { name: 'Transactions' },
    { name: 'Notifications' },
    { name: 'Profile' },
    { name: 'Health' },
  ],
  components: {
    securitySchemes: {
      bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
    },
    parameters: {
      IdempotencyKey: {
        name: 'Idempotency-Key',
        in: 'header',
        required: true,
        schema: { type: 'string', minLength: 8, maxLength: 200 },
        description: 'Unique key per logical operation. Replaying it returns the original result.',
      },
      Limit: { name: 'limit', in: 'query', schema: { type: 'integer', default: 20, maximum: 100 } },
      Cursor: { name: 'cursor', in: 'query', schema: { type: 'string' } },
    },
    schemas: {
      ErrorResponse: {
        type: 'object',
        properties: {
          error: {
            type: 'object',
            properties: {
              code: { type: 'string', example: 'INSUFFICIENT_FUNDS' },
              message: { type: 'string' },
              details: { type: 'object', nullable: true },
            },
          },
          requestId: { type: 'string' },
        },
      },
      Money: { type: 'integer', format: 'int64', description: 'Amount in minor units (kobo)' },
      User: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          fullName: { type: 'string' },
          email: { type: 'string', format: 'email' },
          phone: { type: 'string' },
          emailVerified: { type: 'boolean' },
          kycStatus: { type: 'string', enum: ['UNVERIFIED', 'PENDING', 'VERIFIED'] },
          biometricEnabled: { type: 'boolean' },
          themePreference: { type: 'string', enum: ['SYSTEM', 'LIGHT', 'DARK'] },
        },
      },
      Tokens: {
        type: 'object',
        properties: {
          accessToken: { type: 'string' },
          refreshToken: { type: 'string' },
          accessTokenExpiresIn: { type: 'integer', example: 900 },
          refreshTokenExpiresAt: { type: 'string', format: 'date-time' },
        },
      },
      Wallet: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          walletTag: { type: 'string', example: 'PF-4821-9376' },
          maskedWalletTag: { type: 'string', example: 'PF-****-9376' },
          accountName: { type: 'string' },
          currency: { type: 'string', example: 'NGN' },
          balanceMinor: { $ref: '#/components/schemas/Money' },
          balanceFormatted: { type: 'string', example: '₦12,500.00' },
          status: { type: 'string', enum: ['ACTIVE', 'FROZEN', 'CLOSED'] },
        },
      },
      Transaction: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          reference: { type: 'string', example: 'PF-TRF-20260101-7K3M9Q2B' },
          type: {
            type: 'string',
            enum: ['FUNDING', 'TRANSFER_IN', 'TRANSFER_OUT', 'WITHDRAWAL', 'REFUND', 'PAYMENT', 'ADJUSTMENT'],
          },
          status: { type: 'string', enum: ['PENDING', 'PROCESSING', 'SUCCESSFUL', 'FAILED', 'REVERSED'] },
          direction: { type: 'string', enum: ['in', 'out'] },
          title: { type: 'string' },
          amountMinor: { $ref: '#/components/schemas/Money' },
          signedAmountMinor: { type: 'integer', format: 'int64' },
          amountFormatted: { type: 'string' },
          currency: { type: 'string' },
          createdAt: { type: 'string', format: 'date-time' },
          completedAt: { type: 'string', format: 'date-time', nullable: true },
        },
      },
      Receipt: {
        type: 'object',
        properties: {
          reference: { type: 'string' },
          amountMinor: { $ref: '#/components/schemas/Money' },
          amountFormatted: { type: 'string' },
          status: { type: 'string' },
          sender: { type: 'object' },
          recipient: { type: 'object' },
          ledgerReference: { type: 'string', nullable: true },
          simulated: { type: 'boolean' },
          disclaimer: { type: 'string' },
        },
      },
    },
  },
  security: bearer,
  paths: {
    '/api/health': {
      get: {
        tags: ['Health'],
        summary: 'Service and database health',
        security: [],
        responses: { '200': { description: 'Healthy' }, '503': { description: 'Degraded' } },
      },
    },
    '/api/auth/register': {
      post: {
        tags: ['Auth'],
        summary: 'Create an account, wallet and first session',
        security: [],
        requestBody: jsonBody({
          type: 'object',
          required: ['fullName', 'email', 'phone', 'password', 'confirmPassword'],
          properties: {
            fullName: { type: 'string', example: 'Ada Obi' },
            email: { type: 'string', format: 'email', example: 'ada@example.com' },
            phone: { type: 'string', example: '08031234567' },
            password: { type: 'string', minLength: 8, example: 'Flow1234' },
            confirmPassword: { type: 'string', example: 'Flow1234' },
            device: {
              type: 'object',
              properties: { deviceId: { type: 'string' }, deviceName: { type: 'string' }, platform: { type: 'string' } },
            },
          },
        }),
        responses: {
          '201': dataResponse('Account created', {
            type: 'object',
            properties: {
              user: { $ref: '#/components/schemas/User' },
              tokens: { $ref: '#/components/schemas/Tokens' },
              wallet: { $ref: '#/components/schemas/Wallet' },
              verification: {
                type: 'object',
                properties: {
                  required: { type: 'boolean' },
                  email: { type: 'string' },
                  demoCode: { type: 'string', description: 'Only returned when DEMO_MODE is enabled' },
                },
              },
            },
          }),
          '409': errorResponse('Email or phone already registered'),
        },
      },
    },
    '/api/auth/login': {
      post: {
        tags: ['Auth'],
        summary: 'Sign in (locks the account after repeated failures)',
        security: [],
        requestBody: jsonBody({
          type: 'object',
          required: ['email', 'password'],
          properties: {
            email: { type: 'string', format: 'email' },
            password: { type: 'string' },
            device: { type: 'object' },
          },
        }),
        responses: {
          '200': dataResponse('Signed in', {
            type: 'object',
            properties: {
              user: { $ref: '#/components/schemas/User' },
              tokens: { $ref: '#/components/schemas/Tokens' },
              pinConfigured: { type: 'boolean' },
            },
          }),
          '401': errorResponse('Invalid credentials'),
          '429': errorResponse('Account locked or rate limited'),
        },
      },
    },
    '/api/auth/refresh': {
      post: {
        tags: ['Auth'],
        summary: 'Rotate the refresh token (reuse revokes the whole family)',
        security: [],
        requestBody: jsonBody({
          type: 'object',
          required: ['refreshToken'],
          properties: { refreshToken: { type: 'string' } },
        }),
        responses: {
          '200': dataResponse('Rotated', { $ref: '#/components/schemas/Tokens' }),
          '401': errorResponse('Invalid, expired or reused refresh token'),
        },
      },
    },
    '/api/auth/logout': {
      post: {
        tags: ['Auth'],
        summary: 'Revoke the current session (or all sessions)',
        requestBody: jsonBody({
          type: 'object',
          properties: { refreshToken: { type: 'string' }, allDevices: { type: 'boolean' } },
        }),
        responses: { '200': { description: 'Signed out' } },
      },
    },
    '/api/auth/forgot-password': {
      post: {
        tags: ['Auth'],
        summary: 'Request a password reset code',
        security: [],
        requestBody: jsonBody({ type: 'object', required: ['email'], properties: { email: { type: 'string' } } }),
        responses: { '200': { description: 'Always accepted (no account enumeration)' } },
      },
    },
    '/api/auth/reset-password': {
      post: {
        tags: ['Auth'],
        summary: 'Reset the password with a one-time code',
        security: [],
        requestBody: jsonBody({
          type: 'object',
          required: ['email', 'code', 'newPassword', 'confirmPassword'],
          properties: {
            email: { type: 'string' },
            code: { type: 'string', example: '123456' },
            newPassword: { type: 'string' },
            confirmPassword: { type: 'string' },
          },
        }),
        responses: { '200': { description: 'Password updated' }, '400': errorResponse('Invalid code') },
      },
    },
    '/api/auth/verify-email': {
      post: {
        tags: ['Auth'],
        summary: 'Verify the account email with a one-time code',
        requestBody: jsonBody({
          type: 'object',
          required: ['code'],
          properties: { code: { type: 'string', example: '123456' } },
        }),
        responses: { '200': { description: 'Email verified' } },
      },
    },
    '/api/auth/resend-verification': {
      post: {
        tags: ['Auth'],
        summary: 'Send a new email verification code',
        responses: { '200': { description: 'Code sent' } },
      },
    },
    '/api/wallet': {
      get: {
        tags: ['Wallet'],
        summary: 'Wallet, ledger-derived balance, stats and recent activity',
        responses: {
          '200': dataResponse('Wallet overview', {
            type: 'object',
            properties: {
              wallet: { $ref: '#/components/schemas/Wallet' },
              stats: { type: 'object' },
              recentTransactions: { type: 'array', items: { $ref: '#/components/schemas/Transaction' } },
            },
          }),
        },
      },
      post: {
        tags: ['Wallet'],
        summary: 'Create a wallet for an additional currency (idempotent)',
        requestBody: jsonBody({ type: 'object', properties: { currency: { type: 'string', enum: ['NGN'] } } }),
        responses: { '201': dataResponse('Wallet', { $ref: '#/components/schemas/Wallet' }) },
      },
    },
    '/api/wallet/balance': {
      get: {
        tags: ['Wallet'],
        summary: 'Authoritative balance snapshot',
        responses: {
          '200': dataResponse('Balance', {
            type: 'object',
            properties: {
              balanceMinor: { $ref: '#/components/schemas/Money' },
              availableMinor: { $ref: '#/components/schemas/Money' },
              pendingOutMinor: { $ref: '#/components/schemas/Money' },
              currency: { type: 'string' },
              asOf: { type: 'string', format: 'date-time' },
            },
          }),
        },
      },
    },
    '/api/wallet/transactions': {
      get: {
        tags: ['Wallet'],
        summary: 'Wallet activity feed',
        parameters: [
          { $ref: '#/components/parameters/Limit' },
          { $ref: '#/components/parameters/Cursor' },
          { name: 'status', in: 'query', schema: { type: 'string' } },
          { name: 'direction', in: 'query', schema: { type: 'string', enum: ['ALL', 'in', 'out'] } },
        ],
        responses: {
          '200': {
            description: 'Paginated transactions',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    data: { type: 'array', items: { $ref: '#/components/schemas/Transaction' } },
                    meta: { type: 'object' },
                  },
                },
              },
            },
          },
        },
      },
    },
    '/api/wallet/ledger': {
      get: {
        tags: ['Wallet'],
        summary: 'Immutable ledger entries behind this wallet balance',
        responses: { '200': { description: 'Ledger entries' } },
      },
    },
    '/api/payments/initialize': {
      post: {
        tags: ['Payments'],
        summary: 'Start a Paystack sandbox (or demo) top-up',
        parameters: [{ $ref: '#/components/parameters/IdempotencyKey' }],
        requestBody: jsonBody({
          type: 'object',
          properties: {
            amountMinor: { $ref: '#/components/schemas/Money' },
            amount: { type: 'string', description: 'Alternative to amountMinor, e.g. "2500.00"', example: '2500.00' },
            channel: { type: 'string', enum: ['PAYSTACK', 'DEMO'], default: 'PAYSTACK' },
            simulate: { type: 'string', enum: ['success', 'failure'], description: 'Demo channel only' },
          },
        }),
        responses: {
          '201': dataResponse('Payment initialized', {
            type: 'object',
            properties: {
              reference: { type: 'string' },
              authorizationUrl: { type: 'string', nullable: true },
              accessCode: { type: 'string', nullable: true },
              demo: { type: 'boolean' },
              amountMinor: { $ref: '#/components/schemas/Money' },
            },
          }),
          '409': errorResponse('Idempotency conflict'),
          '503': errorResponse('Payment provider unavailable'),
        },
      },
    },
    '/api/payments/verify/{reference}': {
      get: {
        tags: ['Payments'],
        summary: 'Verify a payment server-side and credit the wallet',
        parameters: [{ name: 'reference', in: 'path', required: true, schema: { type: 'string' } }],
        responses: {
          '200': dataResponse('Verification result', {
            type: 'object',
            properties: {
              status: { type: 'string' },
              alreadyProcessed: { type: 'boolean' },
              credited: { type: 'boolean' },
              walletBalanceMinor: { $ref: '#/components/schemas/Money' },
            },
          }),
          '409': errorResponse('Amount or currency mismatch'),
        },
      },
    },
    '/api/payments/demo/confirm': {
      post: {
        tags: ['Payments'],
        summary: 'Confirm a demo payment (same verification path as the provider)',
        requestBody: jsonBody({
          type: 'object',
          required: ['reference'],
          properties: { reference: { type: 'string' } },
        }),
        responses: { '200': dataResponse('Credited', { type: 'object' }) },
      },
    },
    '/api/payments/webhooks/paystack': {
      post: {
        tags: ['Payments'],
        summary: 'Paystack webhook (HMAC-SHA512 signature over the raw body)',
        security: [],
        parameters: [
          { name: 'x-paystack-signature', in: 'header', required: true, schema: { type: 'string' } },
        ],
        requestBody: jsonBody({ type: 'object' }),
        responses: {
          '200': { description: 'Delivery recorded (duplicates are ignored)' },
          '401': errorResponse('Invalid signature'),
        },
      },
    },
    '/api/transfers/resolve-recipient': {
      post: {
        tags: ['Transfers'],
        summary: 'Resolve a PayFlow recipient before sending',
        requestBody: jsonBody({
          type: 'object',
          properties: {
            email: { type: 'string' },
            phone: { type: 'string' },
            walletTag: { type: 'string', example: 'PF-4821-9376' },
          },
        }),
        responses: {
          '200': dataResponse('Recipient', {
            type: 'object',
            properties: {
              recipient: {
                type: 'object',
                properties: {
                  name: { type: 'string' },
                  maskedWalletTag: { type: 'string' },
                  avatarColor: { type: 'string' },
                },
              },
            },
          }),
          '404': errorResponse('Recipient not found'),
        },
      },
    },
    '/api/transfers': {
      post: {
        tags: ['Transfers'],
        summary: 'Transfer money between PayFlow wallets (PIN authorised, ledger-backed)',
        parameters: [{ $ref: '#/components/parameters/IdempotencyKey' }],
        requestBody: jsonBody({
          type: 'object',
          required: ['recipient', 'amountMinor', 'pin'],
          properties: {
            recipient: {
              type: 'object',
              properties: { email: { type: 'string' }, phone: { type: 'string' }, walletTag: { type: 'string' } },
            },
            amountMinor: { $ref: '#/components/schemas/Money' },
            description: { type: 'string' },
            pin: { type: 'string', example: '1234' },
          },
        }),
        responses: {
          '201': dataResponse('Transfer completed', {
            type: 'object',
            properties: {
              transaction: { $ref: '#/components/schemas/Transaction' },
              walletBalanceMinor: { $ref: '#/components/schemas/Money' },
              receipt: { $ref: '#/components/schemas/Receipt' },
            },
          }),
          '400': errorResponse('Invalid PIN'),
          '409': errorResponse('Insufficient funds or limit exceeded'),
        },
      },
    },
    '/api/transfers/{id}': {
      get: {
        tags: ['Transfers'],
        summary: 'Transfer detail',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        responses: { '200': dataResponse('Transfer', { type: 'object' }), '404': errorResponse('Not found') },
      },
    },
    '/api/withdrawals': {
      post: {
        tags: ['Withdrawals'],
        summary: 'Simulated bank withdrawal (clearly flagged as demo)',
        parameters: [{ $ref: '#/components/parameters/IdempotencyKey' }],
        requestBody: jsonBody({
          type: 'object',
          required: ['amountMinor', 'pin'],
          properties: {
            amountMinor: { $ref: '#/components/schemas/Money' },
            beneficiaryId: { type: 'string', format: 'uuid' },
            bankCode: { type: 'string' },
            bankName: { type: 'string' },
            accountName: { type: 'string' },
            accountNumber: { type: 'string' },
            pin: { type: 'string' },
          },
        }),
        responses: {
          '201': dataResponse('Withdrawal', {
            type: 'object',
            properties: { withdrawal: { type: 'object' }, receipt: { $ref: '#/components/schemas/Receipt' } },
          }),
          '409': errorResponse('Insufficient funds'),
        },
      },
      get: {
        tags: ['Withdrawals'],
        summary: 'List withdrawals',
        responses: { '200': { description: 'Withdrawals' } },
      },
    },
    '/api/withdrawals/{id}': {
      get: {
        tags: ['Withdrawals'],
        summary: 'Withdrawal detail',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        responses: { '200': dataResponse('Withdrawal', { type: 'object' }) },
      },
    },
    '/api/beneficiaries': {
      get: {
        tags: ['Beneficiaries'],
        summary: 'List saved beneficiaries',
        responses: { '200': { description: 'Beneficiaries' } },
      },
      post: {
        tags: ['Beneficiaries'],
        summary: 'Save a beneficiary (unverified until a real lookup exists)',
        requestBody: jsonBody({
          type: 'object',
          required: ['bankCode', 'accountNumber', 'accountName'],
          properties: {
            bankCode: { type: 'string', example: '058' },
            accountNumber: { type: 'string', example: '0123456789' },
            accountName: { type: 'string' },
            isDefault: { type: 'boolean' },
          },
        }),
        responses: { '201': dataResponse('Beneficiary', { type: 'object' }), '409': errorResponse('Duplicate') },
      },
    },
    '/api/beneficiaries/{id}': {
      patch: {
        tags: ['Beneficiaries'],
        summary: 'Update a beneficiary',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        requestBody: jsonBody({
          type: 'object',
          properties: { accountName: { type: 'string' }, isDefault: { type: 'boolean' } },
        }),
        responses: { '200': dataResponse('Beneficiary', { type: 'object' }) },
      },
      delete: {
        tags: ['Beneficiaries'],
        summary: 'Remove a beneficiary (soft delete)',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        responses: { '200': { description: 'Removed' } },
      },
    },
    '/api/beneficiaries/resolve-account': {
      post: {
        tags: ['Beneficiaries'],
        summary: 'Simulated account-name lookup (not a real bank verification)',
        requestBody: jsonBody({
          type: 'object',
          required: ['bankCode', 'accountNumber'],
          properties: { bankCode: { type: 'string' }, accountNumber: { type: 'string' } },
        }),
        responses: { '200': dataResponse('Resolution', { type: 'object' }) },
      },
    },
    '/api/banks': {
      get: { tags: ['Beneficiaries'], summary: 'Supported sandbox banks', responses: { '200': { description: 'Banks' } } },
    },
    '/api/transactions': {
      get: {
        tags: ['Transactions'],
        summary: 'Search and filter transaction history (keyset pagination)',
        parameters: [
          { $ref: '#/components/parameters/Limit' },
          { $ref: '#/components/parameters/Cursor' },
          { name: 'status', in: 'query', schema: { type: 'string' } },
          { name: 'type', in: 'query', schema: { type: 'string' } },
          { name: 'direction', in: 'query', schema: { type: 'string', enum: ['ALL', 'in', 'out'] } },
          { name: 'search', in: 'query', schema: { type: 'string' } },
          { name: 'from', in: 'query', schema: { type: 'string', format: 'date-time' } },
          { name: 'to', in: 'query', schema: { type: 'string', format: 'date-time' } },
        ],
        responses: {
          '200': {
            description: 'Transactions',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    data: { type: 'array', items: { $ref: '#/components/schemas/Transaction' } },
                    meta: { type: 'object' },
                  },
                },
              },
            },
          },
        },
      },
    },
    '/api/transactions/{id}': {
      get: {
        tags: ['Transactions'],
        summary: 'Transaction detail',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        responses: { '200': dataResponse('Transaction', { $ref: '#/components/schemas/Transaction' }) },
      },
    },
    '/api/transactions/{id}/receipt': {
      get: {
        tags: ['Transactions'],
        summary: 'Verified receipt for PDF generation and sharing',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        responses: { '200': dataResponse('Receipt', { $ref: '#/components/schemas/Receipt' }) },
      },
    },
    '/api/notifications': {
      get: {
        tags: ['Notifications'],
        summary: 'Notification centre',
        parameters: [
          { $ref: '#/components/parameters/Limit' },
          { $ref: '#/components/parameters/Cursor' },
          { name: 'unreadOnly', in: 'query', schema: { type: 'boolean' } },
        ],
        responses: { '200': { description: 'Notifications' } },
      },
    },
    '/api/notifications/{id}/read': {
      patch: {
        tags: ['Notifications'],
        summary: 'Mark a notification as read',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        responses: { '200': dataResponse('Notification', { type: 'object' }) },
      },
    },
    '/api/notifications/read-all': {
      post: {
        tags: ['Notifications'],
        summary: 'Mark every notification as read',
        responses: { '200': { description: 'Updated' } },
      },
    },
    '/api/profile': {
      get: {
        tags: ['Profile'],
        summary: 'Profile, wallet summary and security state',
        responses: { '200': dataResponse('Profile', { type: 'object' }) },
      },
      patch: {
        tags: ['Profile'],
        summary: 'Update profile, theme and notification preferences',
        requestBody: jsonBody({
          type: 'object',
          properties: {
            fullName: { type: 'string' },
            themePreference: { type: 'string', enum: ['SYSTEM', 'LIGHT', 'DARK'] },
            biometricEnabled: { type: 'boolean' },
            notifyPush: { type: 'boolean' },
            notifyEmail: { type: 'boolean' },
            notifySecurity: { type: 'boolean' },
          },
        }),
        responses: { '200': dataResponse('Profile', { type: 'object' }) },
      },
    },
    '/api/profile/password': {
      patch: {
        tags: ['Profile'],
        summary: 'Change password (signs out all sessions)',
        requestBody: jsonBody({
          type: 'object',
          required: ['currentPassword', 'newPassword'],
          properties: { currentPassword: { type: 'string' }, newPassword: { type: 'string' } },
        }),
        responses: { '200': { description: 'Password changed' }, '401': errorResponse('Wrong password') },
      },
    },
    '/api/profile/pin': {
      patch: {
        tags: ['Profile'],
        summary: 'Create or change the 4-digit transaction PIN',
        requestBody: jsonBody({
          type: 'object',
          required: ['newPin'],
          properties: {
            newPin: { type: 'string', example: '1234' },
            currentPin: { type: 'string' },
            password: { type: 'string' },
          },
        }),
        responses: { '200': { description: 'PIN saved' }, '400': errorResponse('Validation error') },
      },
    },
    '/api/profile/biometrics': {
      post: {
        tags: ['Profile'],
        summary: 'Record biometric unlock preference (local convenience only)',
        requestBody: jsonBody({ type: 'object', required: ['enabled'], properties: { enabled: { type: 'boolean' } } }),
        responses: { '200': { description: 'Saved' } },
      },
    },
    '/api/profile/sessions': {
      get: {
        tags: ['Profile'],
        summary: 'Active device sessions',
        responses: { '200': { description: 'Sessions' } },
      },
    },
    '/api/profile/sessions/{id}': {
      delete: {
        tags: ['Profile'],
        summary: 'Revoke a device session',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        responses: { '200': { description: 'Revoked' } },
      },
    },
  },
} as const;

export type OpenApiSpec = typeof openApiSpec;
