import {
  applyPercentageFee,
  formatCompactNaira,
  formatNaira,
  formatSignedNaira,
  isValidMinorAmount,
  minorToInputValue,
  parseNairaToMinor,
} from './money';

describe('formatNaira', () => {
  it('renders kobo as grouped naira', () => {
    expect(formatNaira(0)).toBe('₦0.00');
    expect(formatNaira(5)).toBe('₦0.05');
    expect(formatNaira(100)).toBe('₦1.00');
    expect(formatNaira(123456)).toBe('₦1,234.56');
    expect(formatNaira(9_600_000)).toBe('₦96,000.00');
  });

  it('keeps the sign on negative amounts', () => {
    expect(formatNaira(-2500)).toBe('-₦25.00');
  });

  it('never loses precision on large balances', () => {
    expect(formatNaira(50_000_000_00)).toBe('₦50,000,000.00');
  });
});

describe('formatSignedNaira', () => {
  it('prefixes inflows with + and outflows with -', () => {
    expect(formatSignedNaira(50_000)).toBe('+₦500.00');
    expect(formatSignedNaira(-50_000)).toBe('-₦500.00');
    expect(formatSignedNaira(0)).toBe('₦0.00');
  });
});

describe('parseNairaToMinor', () => {
  it('converts typed naira into integer kobo', () => {
    expect(parseNairaToMinor('0')).toBe(0);
    expect(parseNairaToMinor('1')).toBe(100);
    expect(parseNairaToMinor('1,250')).toBe(125_000);
    expect(parseNairaToMinor('1250.5')).toBe(125_050);
    expect(parseNairaToMinor('₦1,250.05')).toBe(125_005);
    expect(parseNairaToMinor('.5')).toBe(50);
  });

  it('rejects text that is not an amount', () => {
    expect(parseNairaToMinor('')).toBeNull();
    expect(parseNairaToMinor('abc')).toBeNull();
    expect(parseNairaToMinor('12.345')).toBeNull();
    expect(parseNairaToMinor('1..2')).toBeNull();
  });
});

describe('minorToInputValue', () => {
  it('round-trips through the parser', () => {
    expect(minorToInputValue(125_000)).toBe('1,250');
    expect(minorToInputValue(125_005)).toBe('1,250.05');
    expect(parseNairaToMinor(minorToInputValue(987_654))).toBe(987_654);
  });
});

describe('isValidMinorAmount', () => {
  it('accepts only positive integer kobo', () => {
    expect(isValidMinorAmount(100)).toBe(true);
    expect(isValidMinorAmount(0)).toBe(false);
    expect(isValidMinorAmount(-1)).toBe(false);
    expect(isValidMinorAmount(10.5)).toBe(false);
    expect(isValidMinorAmount('100')).toBe(false);
  });
});

describe('applyPercentageFee', () => {
  it('rounds the fee to the nearest kobo', () => {
    expect(applyPercentageFee(10_000, 1.5)).toEqual({ feeMinor: 150, totalMinor: 10_150 });
    expect(applyPercentageFee(1_01, 1)).toEqual({ feeMinor: 1, totalMinor: 1_02 });
  });
});

describe('formatCompactNaira', () => {
  it('abbreviates large amounts', () => {
    expect(formatCompactNaira(125_000)).toBe('₦1.3k');
    expect(formatCompactNaira(1_250_000_00)).toBe('₦1.3m');
    expect(formatCompactNaira(5_000)).toBe('₦50');
  });
});
