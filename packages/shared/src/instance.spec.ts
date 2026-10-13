import { describe, expect, it } from 'vitest';
import { Locale } from './instance.js';

describe('Locale', () => {
  it('accepts the two supported languages', () => {
    expect(Locale.parse('fr')).toBe('fr');
    expect(Locale.parse('en')).toBe('en');
  });

  it('rejects anything else', () => {
    expect(Locale.safeParse('de').success).toBe(false);
    expect(Locale.safeParse('FR').success).toBe(false);
    expect(Locale.safeParse(undefined).success).toBe(false);
  });
});
