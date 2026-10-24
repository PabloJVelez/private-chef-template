import { googleBusy } from '../availability/google-busy';
import { toGoogleEventBody } from '../google-calendar/mapping';
import { ensureValidAccessToken } from '../google-calendar/tokens';
jest.mock('../google-calendar/tokens', () => ({ ensureValidAccessToken: jest.fn().mockResolvedValue('test-only') }));
const service = { getPrimaryConnection: jest.fn(), updateGoogleCalendarConnections: jest.fn() };
const fetchMock = jest.fn();
const event = (id: string) => ({
  id,
  start: { dateTime: '2026-11-02T10:00:00Z' },
  end: { dateTime: '2026-11-02T11:00:00Z' },
});
const response = (items: unknown[], extra = {}) => ({
  ok: true,
  json: async () => ({ timeZone: 'UTC', items, ...extra }),
});
const run = (ignored = new Set<string>()) =>
  googleBusy(service as never, '2026-11-02T00:00Z', '2026-11-03T00:00Z', ignored);
beforeEach(() => {
  jest.clearAllMocks();
  global.fetch = fetchMock;
  service.getPrimaryConnection.mockResolvedValue({ id: 'connection', status: 'active', calendarId: 'primary' });
});
afterAll(() => jest.restoreAllMocks());
it('ignores only verified pending mirror IDs, preserving an unrelated overlapping event', async () => {
  fetchMock.mockResolvedValue(response([event('pending-mirror'), event('personal')]));
  expect(await run(new Set(['pending-mirror']))).toHaveLength(1);
  expect(toGoogleEventBody({ id: 'a', status: 'pending' }, 'connection').transparency).toBe('transparent');
  expect(toGoogleEventBody({ id: 'a', status: 'confirmed' }, 'connection').transparency).toBe('opaque');
});
it('paginates, includes all-day busy and ignores transparent/cancelled events', async () => {
  fetchMock
    .mockResolvedValueOnce(
      response([{ ...event('transparent'), transparency: 'transparent' }], { nextPageToken: 'two' }),
    )
    .mockResolvedValueOnce(
      response([
        { id: 'all-day', start: { date: '2026-11-02' }, end: { date: '2026-11-03' } },
        { id: 'cancelled', status: 'cancelled' },
      ]),
    );
  expect(await run()).toEqual([{ start: '2026-11-02T00:00:00.000Z', end: '2026-11-03T00:00:00.000Z' }]);
  expect(fetchMock).toHaveBeenCalledTimes(2);
});
it.each([401, 403, 429, 500])('fails closed for HTTP %s', async (status) => {
  fetchMock.mockResolvedValue({ ok: false, status });
  await expect(run()).rejects.toThrow();
});
it('fails closed for missing connection, errors, timeout, malformed interval and pagination', async () => {
  service.getPrimaryConnection.mockResolvedValueOnce(null);
  await expect(run()).rejects.toThrow();
  service.getPrimaryConnection.mockResolvedValueOnce({ id: 'connection', status: 'sync_error' });
  await expect(run()).rejects.toThrow();
  fetchMock.mockRejectedValueOnce(new Error('timeout'));
  await expect(run()).rejects.toThrow('timeout');
  fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({}) });
  await expect(run()).rejects.toThrow();
  fetchMock.mockResolvedValueOnce(response([{ id: 'missing-start' }]));
  await expect(run()).rejects.toThrow();
  fetchMock.mockResolvedValue(response([], { nextPageToken: 'same' }));
  await expect(run()).rejects.toThrow('pagination');
});

it('identifies missing Google configuration without issuing requests or refreshing tokens', async () => {
  service.getPrimaryConnection.mockResolvedValueOnce(null);
  await expect(run()).rejects.toMatchObject({ code: 'google_not_connected' });
  expect(fetchMock).not.toHaveBeenCalled();
  expect(ensureValidAccessToken).not.toHaveBeenCalled();
});
