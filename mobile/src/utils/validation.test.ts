import {
  isStrongEnoughPassword,
  isValidEmail,
  isValidFullName,
  isValidNigerianAccountNumber,
  isValidNigerianPhone,
  isValidTransactionPin,
  isWeakPin,
  normaliseNigerianPhone,
  passwordStrength,
} from './validation';

describe('email validation', () => {
  it.each([
    ['ada@payflow.demo', true],
    ['ada.obi+demo@payflow.co.uk', true],
    ['ada@localhost', false],
    ['ada example@payflow.demo', false],
    ['@payflow.demo', false],
    ['ada@', false],
  ])('%s -> %s', (value, expected) => {
    expect(isValidEmail(value)).toBe(expected);
  });
});

describe('Nigerian phone numbers', () => {
  it('normalises local numbers to E.164', () => {
    expect(normaliseNigerianPhone('08031234567')).toBe('+2348031234567');
    expect(normaliseNigerianPhone('+2348031234567')).toBe('+2348031234567');
    expect(normaliseNigerianPhone('0803 123 4567')).toBe('+2348031234567');
  });

  it('rejects numbers that are not Nigerian mobile lines', () => {
    expect(isValidNigerianPhone('07031234567')).toBe(true);
    expect(isValidNigerianPhone('0803123456')).toBe(false);
    expect(isValidNigerianPhone('05031234567')).toBe(false);
    expect(isValidNigerianPhone('not-a-number')).toBe(false);
    expect(normaliseNigerianPhone('05031234567')).toBeNull();
  });
});

describe('password strength', () => {
  it('rejects short passwords', () => {
    expect(passwordStrength('Abc1').score).toBe(0);
    expect(passwordStrength('Abc1').label).toBe('Too short');
  });

  it('rates a usable password as fair or better', () => {
    expect(isStrongEnoughPassword('Flow1234')).toBe(true);
    expect(passwordStrength('Flow1234').score).toBeGreaterThanOrEqual(2);
    expect(passwordStrength('Flow1234!long').score).toBe(4);
  });

  it('explains what is missing', () => {
    expect(passwordStrength('flow1234').hints).toContain('An uppercase letter');
  });
});

describe('transaction PIN', () => {
  it('accepts any four digits that are not trivially guessable', () => {
    expect(isValidTransactionPin('1234')).toBe(true);
    expect(isValidTransactionPin('12')).toBe(false);
    expect(isValidTransactionPin('abcd')).toBe(false);
  });

  it('flags weak PINs', () => {
    expect(isWeakPin('0000')).toBe(true);
    expect(isWeakPin('1111')).toBe(true);
    expect(isWeakPin('1234')).toBe(true);
    expect(isWeakPin('2580')).toBe(true);
    expect(isWeakPin('8042')).toBe(false);
  });
});

describe('bank account numbers', () => {
  it('requires exactly ten digits', () => {
    expect(isValidNigerianAccountNumber('0123456789')).toBe(true);
    expect(isValidNigerianAccountNumber('012345678')).toBe(false);
    expect(isValidNigerianAccountNumber('01234567890')).toBe(false);
  });
});

describe('full names', () => {
  it('accepts letters, spaces and common punctuation only', () => {
    expect(isValidFullName('Ada Obi')).toBe(true);
    expect(isValidFullName("Chiamaka N nodim")).toBe(true);
    expect(isValidFullName('Ada Obi-Nwosu')).toBe(true);
    expect(isValidFullName('A')).toBe(false);
    expect(isValidFullName('Ada 123')).toBe(false);
  });
});
