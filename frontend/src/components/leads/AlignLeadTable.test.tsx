import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AlignLeadTable } from './AlignLeadTable';

describe('AlignLeadTable', () => {
  it('shows enabled and disabled whatsapp actions based on available target', async () => {
    const user = userEvent.setup();
    const onOpenWhatsApp = vi.fn();

    render(
      <AlignLeadTable
        leads={[
          {
            id: '1',
            name: 'Biz One',
            contact: '08123',
            whatsappUrl: 'https://wa.me/628123',
            whatsappNumber: '628123',
            whatsappVerificationStatus: 'unchecked',
            location: 'Jakarta',
            niche: 'Coffee',
            dateFound: '01 Jan 2026',
            sourceLabel: 'Google Maps',
            sourceUrl: null,
            websiteStatus: 'have website',
            status: 'New',
            score: null,
          },
          {
            id: '2',
            name: 'Biz Two',
            contact: '08124',
            whatsappUrl: 'https://wa.me/628124',
            whatsappNumber: '628124',
            whatsappVerificationStatus: 'unchecked',
            location: 'Bandung',
            niche: 'Bakery',
            dateFound: '01 Jan 2026',
            sourceLabel: 'Google Maps',
            sourceUrl: null,
            websiteStatus: 'have website',
            status: 'New',
            score: null,
          },
          {
            id: '2b',
            name: 'Biz Two B',
            contact: '+62 812-2103-2264',
            whatsappUrl: 'https://wa.me/6281221032264',
            whatsappNumber: null,
            whatsappVerificationStatus: 'unchecked',
            location: 'Bandung',
            niche: 'Bakery',
            dateFound: '01 Jan 2026',
            sourceLabel: 'Google Maps',
            sourceUrl: null,
            websiteStatus: 'have website',
            status: 'New',
            score: null,
          },
          {
            id: '3',
            name: 'Biz Three',
            contact: 'hello@example.com',
            whatsappUrl: null,
            whatsappNumber: null,
            whatsappVerificationStatus: 'unchecked',
            location: 'Surabaya',
            niche: 'Salon',
            dateFound: '01 Jan 2026',
            sourceLabel: 'Google Maps',
            sourceUrl: null,
            websiteStatus: 'have website',
            status: 'New',
            score: null,
          },
        ]}
        onOpenWhatsApp={onOpenWhatsApp}
      />,
    );

    const whatsappButtons = screen.getAllByRole('button', { name: 'WhatsApp' });
    expect(whatsappButtons.some((button) => !button.hasAttribute('disabled'))).toBe(true);
    expect(whatsappButtons.some((button) => button.hasAttribute('disabled'))).toBe(true);

    const enabledDesktopButton = screen
      .getAllByRole('button', { name: 'WhatsApp' })
      .find((button) => !button.hasAttribute('disabled'));
    expect(enabledDesktopButton).toBeDefined();
    await user.click(enabledDesktopButton!);

    expect(onOpenWhatsApp).toHaveBeenCalledWith('1');

    await user.click(screen.getByLabelText('More actions for Biz Three'));
    const disabledMenuButton = screen.getAllByRole('button', { name: 'WhatsApp' }).at(-1);
    expect(disabledMenuButton).toBeDefined();
    expect(disabledMenuButton).toBeDisabled();
  });

  it('shows whatsapp verification badges and dispatches verification actions', async () => {
    const user = userEvent.setup();
    const onSetWhatsappVerification = vi.fn();

    render(
      <AlignLeadTable
        leads={[
          {
            id: '1',
            name: 'Biz One',
            contact: '08123',
            whatsappUrl: 'https://wa.me/628123',
            whatsappNumber: '628123',
            whatsappVerificationStatus: 'registered',
            location: 'Jakarta',
            niche: 'Coffee',
            dateFound: '01 Jan 2026',
            sourceLabel: 'Google Maps',
            sourceUrl: null,
            websiteStatus: 'have website',
            status: 'New',
            score: null,
          },
          {
            id: '2',
            name: 'Biz Two',
            contact: '08124',
            whatsappUrl: 'https://wa.me/628124',
            whatsappNumber: '628124',
            whatsappVerificationStatus: 'not_registered',
            location: 'Bandung',
            niche: 'Bakery',
            dateFound: '02 Jan 2026',
            sourceLabel: 'Google Maps',
            sourceUrl: null,
            websiteStatus: 'dont have website',
            status: 'Reviewed',
            score: 60,
          },
        ]}
        onSetWhatsappVerification={onSetWhatsappVerification}
      />,
    );

    expect(screen.getAllByText('Registered').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Not registered').length).toBeGreaterThan(0);

    await user.click(screen.getByLabelText('More actions for Biz One'));
    await user.click(screen.getByRole('button', { name: 'Mark not registered' }));

    expect(onSetWhatsappVerification).toHaveBeenCalledWith('1', 'not_registered');
  });
});
