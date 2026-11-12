const steps = new Map<string, { run: Function; compensate?: Function }>();
jest.mock('@medusajs/framework/workflows-sdk', () => ({
  createStep: (config: string | { name: string }, run: Function, compensate?: Function) => {
    steps.set(typeof config === 'string' ? config : config.name, { run, compensate });
    return jest.fn();
  },
  createWorkflow: jest.fn(),
  WorkflowResponse: jest.fn(),
  StepResponse: class {
    constructor(
      public output: unknown,
      public compensation: unknown,
    ) {}
  },
}));
jest.mock('@medusajs/medusa/core-flows', () => ({
  deleteProductsWorkflow: jest.fn(),
  createProductsWorkflow: jest.fn(),
  createShippingOptionsWorkflow: jest.fn(),
  createShippingProfilesWorkflow: jest.fn(),
  createStockLocationsWorkflow: jest.fn(),
  emitEventStep: jest.fn(),
  linkSalesChannelsToStockLocationWorkflow: jest.fn(),
}));
jest.mock('../booking-execution', () => ({ bookingStepConfig: {}, assertEventProductAbsent: jest.fn(), eventProductExecution: (id: string) => `ticket-${id}`, recoverEventProduct: jest.fn(), eventProductWorkflow: (container: unknown) => require('@medusajs/medusa/core-flows').createProductsWorkflow(container), withEventProductLock: (_container: unknown, _id: string, work: Function) => work() }));
jest.mock('../availability/query', () => ({ requireSlot: jest.fn() }));
import { requireSlot } from '../availability/query';
import { createProductsWorkflow, deleteProductsWorkflow } from '@medusajs/medusa/core-flows';
import { Modules } from '@medusajs/framework/utils';
import { CHEF_EVENT_MODULE } from '../../modules/chef-event';
// Import after mock registry is initialized.
require('../../workflows/accept-chef-event');
const event = {
  id: 'event',
  acceptanceExecution: 'owner',
  status: 'pending',
  experience_type_id: 'experience',
  requestedDate: new Date('2026-11-02T10:00Z'),
  requestedTime: '10:00',
  timeZone: 'UTC',
  updated_at: new Date(),
  eventType: 'Dinner',
  firstName: 'Test',
  lastName: 'Guest',
  partySize: 4,
  totalPrice: 400,
};
const chef = {
  retrieveChefEvent: jest.fn(),
  retrieveAcceptanceAttempt: jest.fn(),
  finalizeAcceptance: jest.fn(),
  claimAcceptance: jest.fn(),
  releaseAcceptance: jest.fn(),
  completeAcceptanceCleanup: jest.fn(),
  updateChefEvents: jest.fn(),
};
const product = { deleteProducts: jest.fn(), updateProducts: jest.fn(), listProducts: jest.fn(), retrieveProduct: jest.fn() };
const scheduling = { listReservations: jest.fn().mockResolvedValue([{ id: "owner" }]), acquire: jest.fn(), confirm: jest.fn(), release: jest.fn() };
const inventory = { listInventoryItems: jest.fn() };
const container = {
  resolve: (key: string) =>
    key === 'scheduling' ? scheduling : key === CHEF_EVENT_MODULE
      ? chef
      : key === Modules.PRODUCT
        ? product
        : key === Modules.INVENTORY
          ? inventory
          : { error: jest.fn() },
};
const claim = () => steps.get('accept-chef-event-step')!.run({ chefEventId: 'event', attemptId: 'owner' }, { container });
beforeEach(() => {
  jest.clearAllMocks();
  (deleteProductsWorkflow as unknown as jest.Mock).mockReturnValue({ run: product.deleteProducts });
  chef.retrieveChefEvent.mockResolvedValue({ ...event });
  chef.retrieveAcceptanceAttempt.mockResolvedValue({ id: 'owner', event_id: 'event', state: 'active' });
  chef.releaseAcceptance.mockResolvedValue(true);
  product.listProducts.mockResolvedValue([]);
  product.retrieveProduct.mockResolvedValue({ id: 'ticket', metadata: { acceptance_attempt: 'owner', chef_event_id: 'event' } });
  (requireSlot as jest.Mock).mockResolvedValue({
    slot: { time: '10:00', occupiedStart: '2026-11-02T09:00Z', occupiedEnd: '2026-11-02T12:00Z' },
    timezone: 'UTC',
    experience: { duration_minutes: 120, preparation_minutes: 0, travel_minutes: 60, cleanup_minutes: 0 },
  });
});
it('revalidates before claiming, snapshots duration/buffers and leaves request pending until tickets exist', async () => {
  const result = await claim();
  expect(requireSlot).toHaveBeenCalledWith(container, '2026-11-02', 'experience', '2026-11-02T10:00:00.000Z', 'event');
  expect(chef.claimAcceptance).toHaveBeenCalledWith(
    expect.objectContaining({
      id: 'event',
      snapshot: expect.objectContaining({ duration_minutes: 120, travel_minutes: 60 }),
    }),
  );
  expect(chef.updateChefEvents).not.toHaveBeenCalled();
  expect(result.compensation.token).toBeTruthy();
});
it.each([{ status: 'confirmed' }, { acceptanceToken: 'another-worker' }, { productId: 'already-created' }])(
  'rejects duplicate acceptance before creating anything: %s',
  async (extra) => {
    chef.retrieveChefEvent.mockResolvedValue({ ...event, ...extra });
    await expect(claim()).rejects.toThrow();
    expect(chef.claimAcceptance).not.toHaveBeenCalled();
  },
);
it('does not claim stale or unavailable requests when Google or slot revalidation fails', async () => {
  (requireSlot as jest.Mock).mockRejectedValue(new Error('Unavailable'));
  await expect(claim()).rejects.toThrow('Unavailable');
  expect(chef.claimAcceptance).not.toHaveBeenCalled();
});
it('compensates only its owned claim', async () => {
  const result = await claim();
  await steps.get('accept-chef-event-step')!.compensate!(result.compensation, { container });
  expect(chef.releaseAcceptance).toHaveBeenCalledWith('event', result.compensation.token);
});
it('retains correlated draft tickets and protection when inventory setup fails', async () => {
  const run = jest.fn().mockResolvedValue({ transaction: { hasFinished: () => true }, result: [{ id: 'ticket', variants: [{ sku: 'sku', title: 'Ticket' }] }] });
  (createProductsWorkflow as unknown as jest.Mock).mockReturnValue({ run, setOptions: jest.fn(), commit: jest.fn() });
  inventory.listInventoryItems.mockRejectedValue(new Error('Inventory failure'));
  await expect(
    steps
      .get('create-event-product-step')!
      .run(
        {
          originalChefEvent: event,
          token: 'owner',
          digitalShippingProfile: { id: 'shipping' },
          defaultSalesChannel: { id: 'sales' },
          digitalLocation: { id: 'location' },
        },
        { container },
      ),
  ).rejects.toThrow('Inventory failure');
  expect(run.mock.calls[0][0].input.products[0].status).toBe('draft');
  expect(product.deleteProducts).not.toHaveBeenCalled();
});
it('does not delete ticket products after acceptance was finalized', async () => {
  chef.retrieveChefEvent.mockResolvedValue({ ...event, status: 'confirmed' });
  chef.releaseAcceptance.mockResolvedValue(false);
  await steps.get('create-event-product-step')!.compensate!({ productId: 'ticket', eventId: 'event', token: 'owner' }, { container });
  expect(product.deleteProducts).not.toHaveBeenCalled();
});
it('finalizes only an owned claim after creating tickets', async () => {
  chef.retrieveChefEvent.mockResolvedValue({ ...event, acceptanceToken: 'owner' });
  chef.finalizeAcceptance.mockResolvedValue({ ...event, status: 'confirmed' });
  await steps
    .get('link-chef-event-to-product-step')!
    .run({ originalChefEvent: event, product: { id: 'ticket' }, token: 'owner', acceptance: {} }, { container });
  expect(chef.finalizeAcceptance).toHaveBeenCalledWith(
    expect.objectContaining({ token: 'owner', productId: 'ticket' }),
  );
  chef.finalizeAcceptance.mockRejectedValue(new Error('Acceptance claim was lost.'));
  await expect(
    steps
      .get('link-chef-event-to-product-step')!
      .run({ originalChefEvent: event, product: { id: 'ticket' }, token: 'owner', acceptance: {} }, { container }),
  ).rejects.toThrow('claim was lost');
});
