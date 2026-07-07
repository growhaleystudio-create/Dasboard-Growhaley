import { describe, expect, it } from 'vitest';
import { extractWhatsappContact } from './lighthouse-website-auditor.js';

describe('extractWhatsappContact', () => {
  it('extracts wa.me url and number', () => {
    expect(
      extractWhatsappContact([
        { href: 'https://wa.me/628123456789', text: 'Chat via WhatsApp' },
      ]),
    ).toEqual({
      whatsappUrl: 'https://wa.me/628123456789',
      whatsappNumber: '628123456789',
    });
  });

  it('extracts api.whatsapp.com url and number', () => {
    expect(
      extractWhatsappContact([
        { href: 'https://api.whatsapp.com/send?phone=628123456789&text=Halo', text: 'Hubungi kami' },
      ]),
    ).toEqual({
      whatsappUrl: 'https://wa.me/628123456789',
      whatsappNumber: '628123456789',
    });
  });
});
