/**
 * Expo dynamic config.
 *
 * The API base URL is read from the public `EXPO_PUBLIC_API_BASE_URL` variable so
 * the same source can point at a local machine, a tunnel or a deployed API
 * without ever shipping a secret in the bundle. Only Paystack *test* keys are
 * ever used, and the mobile client never holds a Paystack secret key.
 */
const apiBaseUrl = process.env.EXPO_PUBLIC_API_BASE_URL ?? 'http://localhost:4000';

export default ({ config }) => ({
  ...config,
  extra: {
    ...config.extra,
    apiBaseUrl,
    demoMode: true,
  },
});
