import { describe, expect, it } from 'vitest';

import { inferSourceFromProfileUrl, isBusinessWebsiteUrl } from './business-website.js';

describe('business website classifier', () => {
  it('treats social profile URLs as not a business website', () => {
    expect(isBusinessWebsiteUrl('https://www.instagram.com/oneeightycoffee')).toBe(false);
    expect(isBusinessWebsiteUrl('https://facebook.com/examplebiz')).toBe(false);
    expect(isBusinessWebsiteUrl('https://x.com/examplebiz')).toBe(false);
    expect(isBusinessWebsiteUrl('https://twitter.com/examplebiz')).toBe(false);
    expect(isBusinessWebsiteUrl('https://www.linkedin.com/company/examplebiz')).toBe(false);
    expect(isBusinessWebsiteUrl('https://threads.net/@examplebiz')).toBe(false);
  });

  it('treats openstreetmap URLs as not a business website', () => {
    expect(isBusinessWebsiteUrl('https://www.openstreetmap.org/node/123')).toBe(false);
  });

  it('treats standalone business domains as business websites', () => {
    expect(isBusinessWebsiteUrl('https://example.com')).toBe(true);
    expect(isBusinessWebsiteUrl('example.com')).toBe(true);
  });

  it('infers source from known profile URLs', () => {
    expect(inferSourceFromProfileUrl('https://www.instagram.com/oneeightycoffee')).toBe('instagram');
    expect(inferSourceFromProfileUrl('https://x.com/examplebiz')).toBe('twitter');
    expect(inferSourceFromProfileUrl('https://www.openstreetmap.org/node/123')).toBe('openstreetmap');
    expect(inferSourceFromProfileUrl('https://example.com')).toBeUndefined();
  });
});
