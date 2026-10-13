import { describe, expect, it } from 'vitest';
import { Tags, UpdateCategoryInput } from './catalogue.js';
import { UpdateGroupInput } from './groups.js';
import { UpdateProfileInput } from './auth.js';

describe('update schemas', () => {
  it('fill in nothing that was not sent, so updates never overwrite other fields', () => {
    expect(UpdateCategoryInput.parse({ nameEn: 'Arts' })).toEqual({ nameEn: 'Arts' });
    expect(UpdateGroupInput.parse({ name: 'New name' })).toEqual({ name: 'New name' });
    expect(UpdateProfileInput.parse({ locale: 'en' })).toEqual({ locale: 'en' });
  });
});

describe('Tags', () => {
  it('lowercases, trims, and drops duplicates', () => {
    expect(Tags.parse([' BEPC', 'bepc', 'C++', 'Python'])).toEqual(['bepc', 'c++', 'python']);
  });
});
