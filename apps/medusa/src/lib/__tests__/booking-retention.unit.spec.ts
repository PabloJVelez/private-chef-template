import { runEventAcceptance } from '../run-event-acceptance';
import { BOOKING_EXECUTION_RETENTION_SECONDS, BOOKING_HISTORY_UNAVAILABLE } from '../booking-retention';
jest.mock('../../workflows/accept-chef-event', () => ({ acceptChefEventWorkflow: jest.fn() }));
jest.mock('../booking-execution', () => ({ eventProductWorkflow: jest.fn(), eventProductExecution: (id: string) => `ticket-${id}` }));
import { acceptChefEventWorkflow } from '../../workflows/accept-chef-event';
import { eventProductWorkflow } from '../booking-execution';
const run = jest.fn();
const original = jest.fn();
const input = { attemptId: 'attempt', chefEventId: 'event' };
let attempt: any, event: any;
const container = { resolve: (key: string) => key === 'locking'
  ? { execute: (_key: string, work: () => unknown) => work() }
  : { retrieveAcceptanceAttempt: async () => attempt, retrieveChefEvent: async () => event } } as any;
beforeEach(() => {
  jest.clearAllMocks();
  attempt = { state: 'active', created_at: new Date() }; event = {};
  original.mockResolvedValue(undefined);
  (acceptChefEventWorkflow as unknown as jest.Mock).mockReturnValue({ getRunningTransaction: original, run });
  (eventProductWorkflow as jest.Mock).mockReturnValue({ getRunningTransaction: async () => undefined });
});
test('fresh unstarted attempt enters the native workflow', async () => {
  await runEventAcceptance(container, input);
  expect(run).toHaveBeenCalledTimes(1);
});
test.each(['finalized', 'aborted'])('missing %s history cannot dispatch again', async (state) => {
  attempt.state = state;
  await expect(runEventAcceptance(container, input)).rejects.toThrow(BOOKING_HISTORY_UNAVAILABLE);
  expect(run).not.toHaveBeenCalled();
});
test('old active attempt without history remains protected for explicit reconciliation', async () => {
  attempt.created_at = new Date(Date.now() - (BOOKING_EXECUTION_RETENTION_SECONDS + 1) * 1000);
  await expect(runEventAcceptance(container, input)).rejects.toThrow(BOOKING_HISTORY_UNAVAILABLE);
  expect(run).not.toHaveBeenCalled();
});
test('missing original never authorizes a replacement recovery execution', async () => {
  await expect(runEventAcceptance(container, input, 'recover-attempt')).rejects.toThrow('terminally failed');
  expect(run).not.toHaveBeenCalled();
});
test('retained terminal failure authorizes native recovery', async () => {
  original.mockResolvedValue({ hasFinished: () => true, getState: () => 'reverted' });
  await runEventAcceptance(container, input, 'recover-attempt');
  expect(run).toHaveBeenCalledWith(expect.objectContaining({ context: { transactionId: 'recover-attempt' } }));
});
