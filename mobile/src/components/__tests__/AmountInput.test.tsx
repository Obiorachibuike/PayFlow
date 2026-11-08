import { fireEvent, screen } from '@testing-library/react-native';
import { AmountInput } from '../AmountInput';
import { renderScreen } from '../../test/render';

async function setup(onChangeMinor: (minor: number) => void = () => undefined) {
  return await renderScreen(<AmountInput valueMinor={0} onChangeMinor={onChangeMinor} testID="amount" />);
}

describe('<AmountInput />', () => {
  it('converts typed naira into kobo', async () => {
    const onChangeMinor = jest.fn();
    await setup(onChangeMinor);

    fireEvent.changeText(screen.getByTestId('amount'), '12.50');
    expect(onChangeMinor).toHaveBeenLastCalledWith(1250);
  });

  it('strips formatting characters the user pastes', async () => {
    const onChangeMinor = jest.fn();
    await setup(onChangeMinor);

    fireEvent.changeText(screen.getByTestId('amount'), '₦1,250.75');
    expect(onChangeMinor).toHaveBeenLastCalledWith(125_075);
  });

  it('reports zero for text that is not an amount', async () => {
    const onChangeMinor = jest.fn();
    await setup(onChangeMinor);

    fireEvent.changeText(screen.getByTestId('amount'), '12.345');
    expect(onChangeMinor).toHaveBeenLastCalledWith(0);
  });

  it('shows the naira equivalent of the amount', async () => {
    await renderScreen(<AmountInput valueMinor={96_000_00} onChangeMinor={() => undefined} testID="amount" />);
    expect(screen.getByText('₦96,000.00')).toBeTruthy();
  });

  it('warns when the amount is above the maximum', async () => {
    await renderScreen(
      <AmountInput valueMinor={60_000_00} onChangeMinor={() => undefined} maxMinor={50_000_00} testID="amount" />,
    );
    expect(screen.getByText('Maximum is ₦50,000.00')).toBeTruthy();
  });
});
