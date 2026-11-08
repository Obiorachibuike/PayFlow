import { fireEvent } from '@testing-library/react-native';
import { LoginScreen } from '../LoginScreen';
import { renderScreen } from '../../../test/render';

const mockUseNavigation = jest.fn(() => ({ navigate: jest.fn(), reset: jest.fn(), goBack: jest.fn() }));

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => mockUseNavigation(),
}));

const mockLogin = jest.fn();

jest.mock('../../../services/api', () => ({
  authApi: {
    login: (input: unknown) => mockLogin(input),
  },
}));

const session = {
  user: {
    id: 'user-1',
    fullName: 'Ada Obi',
    email: 'ada@payflow.demo',
    phone: '+2348031234567',
    emailVerified: true,
  },
  tokens: { accessToken: 'access', refreshToken: 'refresh' },
  wallet: { id: 'wallet-1', balanceMinor: 9600000, currency: 'NGN' },
};

async function renderLogin() {
  const view = await renderScreen(<LoginScreen />);
  return view;
}

describe('<LoginScreen />', () => {
  beforeEach(() => {
    mockLogin.mockReset();
    mockLogin.mockResolvedValue(session);
  });

  it('blocks the request when the email is not valid', async () => {
    const view = await renderLogin();

    await fireEvent.changeText(view.getByTestId('login-email'), 'not-an-email');
    await fireEvent.changeText(view.getByTestId('login-password'), 'Flow1234');
    await fireEvent.press(view.getByTestId('login-submit'));

    expect(view.getByTestId('login-error')).toBeTruthy();
    expect(mockLogin).not.toHaveBeenCalled();
  });

  it('does not send a short password to the API', async () => {
    const view = await renderLogin();

    await fireEvent.changeText(view.getByTestId('login-email'), 'ada@payflow.demo');
    await fireEvent.changeText(view.getByTestId('login-password'), 'short');
    await fireEvent.press(view.getByTestId('login-submit'));

    expect(view.getByTestId('login-error')).toBeTruthy();
    expect(mockLogin).not.toHaveBeenCalled();
  });

  it('submits a trimmed, lower-cased email with a device context', async () => {
    const view = await renderLogin();

    await fireEvent.changeText(view.getByTestId('login-email'), '  Ada@PayFlow.Demo  ');
    await fireEvent.changeText(view.getByTestId('login-password'), 'Flow1234');
    await fireEvent.press(view.getByTestId('login-submit'));

    expect(mockLogin).toHaveBeenCalledWith({
      email: 'ada@payflow.demo',
      password: 'Flow1234',
      device: expect.objectContaining({ deviceId: expect.any(String) }),
    });
  });

  it('shows the server message when the credentials are wrong', async () => {
    mockLogin.mockRejectedValueOnce(
      Object.assign(new Error('Email or password is incorrect'), {
        status: 401,
        code: 'INVALID_CREDENTIALS',
      }),
    );

    const view = await renderLogin();

    await fireEvent.changeText(view.getByTestId('login-email'), 'ada@payflow.demo');
    await fireEvent.changeText(view.getByTestId('login-password'), 'WrongPass1');
    await fireEvent.press(view.getByTestId('login-submit'));

    await view.findByText('Email or password is incorrect');
  });

  it('tells the user the demo credentials', async () => {
    const view = await renderLogin();
    expect(view.getByText(/ada@payflow.demo · Flow1234 · PIN 1234/)).toBeTruthy();
  });
});
