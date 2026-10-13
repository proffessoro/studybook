import { describe, expect, it } from 'vitest';
import { CameroonPhone, Email, Pseudo, SignUpInput } from './auth.js';

describe('CameroonPhone', () => {
  it.each([
    ['677123456', '+237677123456'],
    ['6 77 12 34 56', '+237677123456'],
    ['+237 677-12-34-56', '+237677123456'],
    ['00237677123456', '+237677123456'],
    ['237233123456', '+237233123456'],
  ])('normalises %s', (input, expected) => {
    expect(CameroonPhone.parse(input)).toBe(expected);
  });

  it.each(['12345678', '577123456', '+33612345678', '+2376771234567', ''])('rejects %s', (input) => {
    expect(CameroonPhone.safeParse(input).success).toBe(false);
  });
});

describe('Pseudo', () => {
  it.each(['ama', 'Ama_K', 'jean-paul.2', 'Élodie'])('accepts %s', (p) => {
    expect(Pseudo.safeParse(p).success).toBe(true);
  });

  it.each(['ab', 'with space', 'a'.repeat(31), 'emoji😀'])('rejects %s', (p) => {
    expect(Pseudo.safeParse(p).success).toBe(false);
  });
});

describe('Email', () => {
  it('trims and lowercases', () => {
    expect(Email.parse('  Ama@Example.CM ')).toBe('ama@example.cm');
  });
});

describe('SignUpInput', () => {
  const valid = {
    fullName: 'Ama Kouam',
    pseudo: 'ama',
    email: 'ama@example.cm',
    phone: '677123456',
    password: 'longenough',
    locale: 'fr',
    acceptPrivacy: true,
  };

  it('accepts a complete sign-up', () => {
    expect(SignUpInput.parse(valid).phone).toBe('+237677123456');
  });

  it('requires consent to the privacy policy', () => {
    expect(SignUpInput.safeParse({ ...valid, acceptPrivacy: false }).success).toBe(false);
  });

  it('requires 8 characters for the password', () => {
    expect(SignUpInput.safeParse({ ...valid, password: 'short' }).success).toBe(false);
  });
});
