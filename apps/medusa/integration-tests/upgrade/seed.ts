import { Modules } from '@medusajs/framework/utils';
import { createStep, createWorkflow, StepResponse, WorkflowResponse } from '@medusajs/framework/workflows-sdk';
import type { ExecArgs } from '@medusajs/framework/types';

const marker = createStep('upgrade-fixture-marker', async () => new StepResponse({ money: 425.25, fixture: true }));
const workflow = createWorkflow({ name: 'upgrade-fixture-history', store: true, retentionTime: 7776000 }, () =>
  new WorkflowResponse(marker()),
);

/** Synthetic rehearsal only; deliberately uses services without outbound event dispatch. */
export default async function seed({ container }: ExecArgs) {
  const url = new URL(process.env.DATABASE_URL || '');
  if (!['localhost', '127.0.0.1'].includes(url.hostname) || url.pathname !== '/upgrade_main')
    throw new Error('Requires task-owned loopback upgrade_main database');
  const chef = container.resolve<any>('chefEventModuleService');
  const scheduling = container.resolve<any>('scheduling');
  const product = await container.resolve<any>(Modules.PRODUCT).createProducts({
    id: 'prod_upgrade_fixture', title: 'Synthetic rehearsal ticket', handle: 'upgrade-fixture', status: 'draft',
  });
  for (const [index, status] of ['held', 'confirmed'].entries()) {
    const id = `upgrade-event-${status}`;
    await chef.createChefEvents({
      id, requestedDate: new Date(`2027-08-0${index + 1}T10:00Z`), requestedTime: '10:00', partySize: 4,
      eventType: 'Synthetic rehearsal', templateProductId: product.id, locationType: 'customer_location',
      locationAddress: 'Synthetic', firstName: 'Fixture', lastName: 'Guest', email: 'fixture@example.invalid',
      phone: '', notes: '', totalPrice: 425.25, depositPaid: false, specialRequirements: '', estimatedDuration: 60, timeZone: 'UTC',
    });
    const attempt = await chef.bindAcceptance({ eventId: id, actorId: 'fixture-admin', requestKey: id, body: { sendAcceptanceEmail: false } });
    const event = await chef.retrieveChefEvent(id);
    const start = `2027-08-0${index + 1}T10:00:00.000Z`, end = `2027-08-0${index + 1}T11:00:00.000Z`;
    await chef.claimAcceptance({ id, token: attempt.id, updatedAt: event.updated_at, start, end, snapshot: { timezone: 'UTC', duration_minutes: 60 } });
    await scheduling.acquire({ id: attempt.id, ownerId: id, attemptId: attempt.id, start, end });
    if (status === 'confirmed') {
      await chef.finalizeAcceptance({ id, token: attempt.id, productId: product.id, sendAcceptanceEmail: false });
      await scheduling.confirm({ id: attempt.id, ownerId: id, attemptId: attempt.id });
      await container.resolve<any>('link').create({ product: { product_id: product.id }, chefEventModuleService: { chef_event_id: id } });
    }
  }
  await workflow(container).run({ input: {}, context: { transactionId: 'upgrade-fixture-history' } });
  console.log('Synthetic held/confirmed events, money, product link and native history seeded.');
}
