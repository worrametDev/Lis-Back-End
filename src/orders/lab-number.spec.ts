import { formatLabPattern } from './lab-number';
describe('lab number formatting', () => {
  const date = new Date('2026-11-02T18:00:00Z');
  it('uses the Bangkok date and Buddhist year without replacing zeroes in date values', () => {
    expect(formatLabPattern('yymmdd0000', 12, date)).toBe('6911030012');
  });
  it('supports saved legacy brace patterns and Gregorian years', () => {
    expect(formatLabPattern('LN-{YY}{MM}{DD}{SEQ}', 1, date)).toBe(
      'LN-2611030001',
    );
    expect(formatLabPattern('{yy}{MM}{DD}{SEQ}', 1, date)).toBe('6911030001');
  });
  it('rejects patterns that cannot issue unique sequential numbers', () => {
    expect(() => formatLabPattern('LN-YYYY-MM-DD', 1, date)).toThrow();
  });
});
