import { renderToStaticMarkup } from 'react-dom/server';
import { Modules, ContainerRegistrationKeys } from '@medusajs/framework/utils';
import accepted from '../../subscribers/chef-event-accepted';
import { chefEventAcceptedEmail } from '../../modules/resend/emails/chef-event-accepted';

// SD-15: exercise the existing notification boundary and rendered ticket/payment
// email without sending any message or invoking a payment provider.
test.each([3, 8])('private-event acceptance retains guest/payment email semantics for %i guests', async (partySize) => {
  const createNotifications = jest.fn();
  const retrieveChefEvent = jest.fn().mockResolvedValue({
    id: 'event-fixture', firstName: 'Test', lastName: 'Guest', email: 'guest@example.invalid',
    eventType: 'plated_dinner', partySize, totalPrice: partySize * 100,
    requestedDate: '2026-11-12T00:00:00Z', requestedTime: '18:00', locationType: 'customer_location',
    locationAddress: 'Test event address',
  });
  const services: Record<string, unknown> = {
    [Modules.NOTIFICATION]: { createNotifications },
    chefEventModuleService: { retrieveChefEvent },
    product: { retrieveProduct: async () => ({ id: 'prod_event', handle: 'event-tickets', title: 'Private dinner' }) },
    [ContainerRegistrationKeys.LOGGER]: { info: jest.fn(), error: jest.fn() },
  };
  const original = process.env.STOREFRONT_URL;
  process.env.STOREFRONT_URL = 'https://store.example.invalid';
  try {
    await accepted({ event: { data: { chefEventId: 'event-fixture', productId: 'prod_event' } }, container: { resolve: (key: string) => {
      if (!(key in services)) throw new Error(`Unexpected dependency ${key}`);
      return services[key];
    } } } as never);
    expect(createNotifications).toHaveBeenCalledTimes(1);
    const notification = createNotifications.mock.calls[0][0];
    expect(notification).toMatchObject({ to: 'guest@example.invalid', channel: 'email', template: 'chef-event-accepted', data: {
      event: { total_price: `${partySize * 100}.00`, price_per_person: '100.00', minimum_tickets: Math.min(partySize, 4), is_full_deposit: partySize <= 4 },
      product: { purchase_url: 'https://store.example.invalid/products/event-tickets' },
    } });
    const html = renderToStaticMarkup(chefEventAcceptedEmail(notification.data));
    expect(html).toContain(`${partySize} guests`);
    expect(html).toContain('https://store.example.invalid/products/event-tickets');
    expect(html).toContain(partySize <= 4 ? 'Pay full amount' : 'Purchase tickets');
    expect(html).not.toMatch(/meal.prep/i);
  } finally {
    if (original === undefined) delete process.env.STOREFRONT_URL;
    else process.env.STOREFRONT_URL = original;
  }
});
