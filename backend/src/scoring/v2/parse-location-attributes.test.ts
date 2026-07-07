import { describe, expect, it } from 'vitest';

import {
  mergeLocationAttributes,
  parseLocationAttributes,
} from './parse-location-attributes.js';

describe('parseLocationAttributes', () => {
  it('parses rating (comma decimal), reviews (dot thousands), and category', () => {
    expect(parseLocationAttributes('Pengacara IN Lawyer Bandung 5,0(940)Kantor Pengacara Publik')).toEqual({
      rating: 5,
      reviewCount: 940,
      category: 'Kantor Pengacara Publik',
    });
  });

  it('handles thousands separators in the review count', () => {
    expect(parseLocationAttributes('Travourse | Garuda 4,9(3.320)Tempat Cukur Rambut')).toEqual({
      rating: 4.9,
      reviewCount: 3320,
      category: 'Tempat Cukur Rambut',
    });
  });

  it('parses a real sample with punctuation in the name', () => {
    expect(
      parseLocationAttributes('Kantor Hukum Dr. Roely Panggabean,SH,MH. & Rekan 4,7(30)Firma Hukum'),
    ).toEqual({ rating: 4.7, reviewCount: 30, category: 'Firma Hukum' });
  });

  it('returns null for a plain street address', () => {
    expect(
      parseLocationAttributes('Jl. Gatot Subroto No.112, Kec. Lengkong, Kota Bandung, Jawa Barat'),
    ).toBeNull();
  });

  it('returns null when there is no location', () => {
    expect(parseLocationAttributes(undefined)).toBeNull();
    expect(parseLocationAttributes('')).toBeNull();
  });

  it('rejects an out-of-range rating', () => {
    expect(parseLocationAttributes('Weird 9,9(10)Something')).toBeNull();
  });

  it('rejects a match whose category is actually an address tail', () => {
    expect(parseLocationAttributes('Ruko 4,5(20)Jl. Merdeka No. 3')).toBeNull();
  });
});

describe('mergeLocationAttributes', () => {
  it('fills missing fields without overwriting existing ones', () => {
    const merged = mergeLocationAttributes('X 4,8(263)Firma Hukum', { category: 'Existing Cat' });
    expect(merged).toEqual({ rating: 4.8, reviewCount: 263, category: 'Existing Cat' });
  });

  it('returns null when nothing new can be filled', () => {
    const merged = mergeLocationAttributes('X 4,8(263)Firma Hukum', {
      rating: 4.0,
      reviewCount: 10,
      category: 'Cat',
    });
    expect(merged).toBeNull();
  });

  it('returns null when the location has nothing to rescue', () => {
    expect(mergeLocationAttributes('Jl. Merdeka No. 1', undefined)).toBeNull();
  });
});
