import { formatPhone, normalizePhone, phoneKey, samePhone, whatsappUri } from '@/lib/phone';

describe('phone helpers', () => {
  it('normalises any shape to digits-only E.164 for the default country', () => {
    expect(normalizePhone('+91 98765 43210')).toBe('919876543210');
    expect(normalizePhone('098765 43210')).toBe('919876543210');
    expect(normalizePhone('9876543210')).toBe('919876543210');
    expect(normalizePhone('+1 (415) 555-2671')).toBe('14155552671');
  });

  it('rejects junk', () => {
    expect(normalizePhone('')).toBe('');
    expect(normalizePhone('abc')).toBe('');
    expect(normalizePhone('12')).toBe('');
  });

  it('formats stored digits for display', () => {
    expect(formatPhone('919876543210')).toBe('+91 98765 43210');
  });

  it('matches numbers by their last ten digits', () => {
    expect(phoneKey('+91 98765-43210')).toBe('9876543210');
    expect(samePhone('919876543210', '09876543210')).toBe(true);
    expect(samePhone('919876543210', '919876543211')).toBe(false);
  });

  it('builds a WhatsApp link with an encoded message', () => {
    expect(whatsappUri('+91 98765 43210', 'Hi there')).toBe('https://wa.me/919876543210?text=Hi%20there');
  });
});

describe('toDialable', () => {
  const { toDialable } = jest.requireActual('@/lib/phone') as typeof import('@/lib/phone');
  it('always dials internationally with a plus', () => {
    expect(toDialable('919876543210', 'IN')).toBe('+919876543210');
    expect(toDialable('98765 43210', 'IN')).toBe('+919876543210');
    expect(toDialable('+1 415 555 0100', 'IN')).toBe('+14155550100');
  });
  it('leaves short codes and USSD alone', () => {
    expect(toDialable('*123#', 'IN')).toBe('*123#');
    expect(toDialable('121', 'IN')).toBe('121');
  });
});

describe('normalizePhone on its own output', () => {
  it('keeps foreign numbers that already carry a country code', () => {
    expect(normalizePhone('+1 415 555 2671')).toBe('14155552671');
    expect(normalizePhone('14155552671')).toBe('14155552671');
    expect(normalizePhone('447911123456')).toBe('447911123456');
    expect(normalizePhone('0091 9876543210')).toBe('919876543210');
  });
  it('is stable when run twice', () => {
    for (const s of ['+1 415 555 2671', '+44 7911 123456', '9876543210', '098765 43210', '+91 98765-43210']) {
      const once = normalizePhone(s);
      expect(normalizePhone(once)).toBe(once);
    }
  });
});
