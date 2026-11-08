import { fireEvent, screen } from '@testing-library/react-native';
import { TransactionRow } from '../TransactionRow';
import { renderScreen } from '../../test/render';
import type { Transaction } from '../../types/api';

const incoming: Transaction = {
  id: 'tx-1',
  reference: 'PF-TRF-1',
  type: 'TRANSFER_IN',
  status: 'SUCCESSFUL',
  direction: 'in',
  title: 'Transfer from Tunde Balogun',
  counterparty: 'Tunde Balogun',
  description: null,
  amountMinor: 50_000,
  signedAmountMinor: 50_000,
  amountFormatted: '₦500.00',
  signedAmountFormatted: '+₦500.00',
  feeMinor: 0,
  currency: 'NGN',
  senderName: 'Tunde Balogun',
  recipientName: 'Ada Obi',
  failureReason: null,
  createdAt: new Date().toISOString(),
  completedAt: new Date().toISOString(),
  metadata: null,
};

const failed: Transaction = {
  ...incoming,
  id: 'tx-2',
  direction: 'out',
  signedAmountMinor: -50_000,
  signedAmountFormatted: '-₦500.00',
  status: 'FAILED',
  failureReason: 'Insufficient wallet balance',
};

describe('<TransactionRow />', () => {
  it('renders the counterparty, amount and direction', async () => {
    await renderScreen(<TransactionRow transaction={incoming} testID="row" />);

    expect(screen.getByText('Transfer from Tunde Balogun')).toBeTruthy();
    expect(screen.getByText('+₦500.00')).toBeTruthy();
  });

  it('calls back with the transaction when pressed', async () => {
    const onPress = jest.fn();
    await renderScreen(<TransactionRow transaction={incoming} onPress={onPress} testID="row" />);

    fireEvent.press(screen.getByTestId('row'));
    expect(onPress).toHaveBeenCalledWith(incoming);
  });

  it('surfaces the failure reason instead of a timestamp', async () => {
    await renderScreen(<TransactionRow transaction={failed} testID="row" />);
    expect(screen.getByText('Insufficient wallet balance')).toBeTruthy();
  });
});
