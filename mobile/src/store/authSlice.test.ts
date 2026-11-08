import reducer, {
  forceSignOut,
  login,
  logout,
  updateUser,
  type AuthState,
} from './slices/authSlice';
import settingsReducer, { setThemePreference } from './slices/settingsSlice';
import type { AuthUser, Wallet } from '../types/api';

const user: AuthUser = {
  id: 'user-1',
  fullName: 'Ada Obi',
  email: 'ada@payflow.demo',
  phone: '+2348031234567',
  initials: 'AO',
  avatarColor: '#39FF14',
  status: 'ACTIVE',
  kycStatus: 'NONE',
  emailVerified: true,
  emailVerifiedAt: '2026-01-01T00:00:00.000Z',
  phoneVerified: false,
  biometricEnabled: false,
  themePreference: 'SYSTEM',
  notifications: { push: true, email: true, security: true },
  lastLoginAt: null,
  createdAt: '2026-01-01T00:00:00.000Z',
};

const wallet: Wallet = {
  id: 'wallet-1',
  walletTag: 'PF-1234-5678',
  maskedWalletTag: 'PF-****-5678',
  accountName: 'Ada Obi',
  currency: 'NGN',
  balanceMinor: 9600000,
  balanceFormatted: '₦96,000.00',
  status: 'ACTIVE',
  lastActivityAt: null,
  createdAt: '2026-01-01T00:00:00.000Z',
};

const tokens = { accessToken: 'access', refreshToken: 'refresh' };

function initial(): AuthState {
  return reducer(undefined, { type: '@@INIT' });
}

describe('auth slice', () => {
  it('starts signed out', () => {
    expect(initial().status).toBe('idle');
    expect(initial().tokens).toBeNull();
  });

  it('stores the session when login succeeds', () => {
    const state = reducer(
      initial(),
      login.fulfilled({ user, tokens, wallet }, 'request-id', {
        email: user.email,
        password: 'secret',
        device: { deviceId: 'device-1' },
      }),
    );

    expect(state.status).toBe('authenticated');
    expect(state.user?.email).toBe('ada@payflow.demo');
    expect(state.tokens?.accessToken).toBe('access');
    expect(state.wallet?.balanceMinor).toBe(9600000);
  });

  it('surfaces the server message when login fails', () => {
    const state = reducer(
      initial(),
      login.rejected(
        null,
        'request-id',
        { email: user.email, password: 'bad', device: { deviceId: 'device-1' } },
        { message: 'Email or password is incorrect', code: 'INVALID_CREDENTIALS' },
      ),
    );

    expect(state.status).toBe('signedOut');
    expect(state.error).toBe('Email or password is incorrect');
    expect(state.errorCode).toBe('INVALID_CREDENTIALS');
    expect(state.tokens).toBeNull();
  });

  it('clears every credential on logout', () => {
    const signedIn = reducer(
      initial(),
      login.fulfilled({ user, tokens, wallet }, 'request-id', {
        email: user.email,
        password: 'secret',
        device: { deviceId: 'device-1' },
      }),
    );

    const state = reducer(signedIn, logout.fulfilled(true, 'request-id', undefined));
    expect(state.status).toBe('signedOut');
    expect(state.user).toBeNull();
    expect(state.tokens).toBeNull();
    expect(state.wallet).toBeNull();
  });

  it('drops the session when the API reports it as gone', () => {
    const signedIn = reducer(
      initial(),
      login.fulfilled({ user, tokens, wallet }, 'request-id', {
        email: user.email,
        password: 'secret',
        device: { deviceId: 'device-1' },
      }),
    );

    const state = reducer(signedIn, forceSignOut());
    expect(state.tokens).toBeNull();
    expect(state.status).toBe('signedOut');
  });

  it('merges profile updates without touching tokens', () => {
    const signedIn = reducer(
      initial(),
      login.fulfilled({ user, tokens, wallet }, 'request-id', {
        email: user.email,
        password: 'secret',
        device: { deviceId: 'device-1' },
      }),
    );

    const state = reducer(signedIn, updateUser({ fullName: 'Ada Obi-Nwosu', biometricEnabled: true }));
    expect(state.user?.fullName).toBe('Ada Obi-Nwosu');
    expect(state.user?.biometricEnabled).toBe(true);
    expect(state.tokens).toEqual(tokens);
  });
});

describe('settings slice', () => {
  it('maps the LIGHT/DARK preference onto the rendered theme', () => {
    expect(settingsReducer(undefined, setThemePreference('LIGHT')).resolvedTheme).toBe('light');
    expect(settingsReducer(undefined, setThemePreference('DARK')).resolvedTheme).toBe('dark');
  });

  it('keeps the previous theme when the preference follows the system', () => {
    const dark = settingsReducer(undefined, setThemePreference('DARK'));
    const system = settingsReducer(dark, setThemePreference('SYSTEM'));
    expect(system.themePreference).toBe('SYSTEM');
    expect(system.resolvedTheme).toBe('dark');
  });
});
