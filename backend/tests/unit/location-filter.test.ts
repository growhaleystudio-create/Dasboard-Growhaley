import { describe, expect, it } from 'vitest';

import { matchesRequestedLocation } from '../../src/connector/location-filter.js';

describe('matchesRequestedLocation', () => {
  it('keeps results that contain the requested city', () => {
    expect(
      matchesRequestedLocation('Bandung', [
        'Jl. Asia Afrika No. 10, Kota Bandung, Jawa Barat',
      ]),
    ).toBe(true);
  });

  it('rejects results from an unrelated city', () => {
    expect(
      matchesRequestedLocation('Bandung', [
        '123 Madison Avenue, New York, NY, United States',
        'Coffee shop in Manhattan',
      ]),
    ).toBe(false);
  });

  it('supports common Indonesian direction aliases', () => {
    expect(
      matchesRequestedLocation('Jakarta Selatan', [
        'Jl. Kemang Raya, South Jakarta, DKI Jakarta',
      ]),
    ).toBe(true);
  });
});
