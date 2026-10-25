import { refreshAccessToken, ensureValidAccessToken } from '../google-calendar/tokens';
jest.mock('../google-calendar/crypto', () => ({
  decryptSecret: () => 'test-only',
  encryptSecret: () => 'encrypted-test',
}));
const originalFetch = global.fetch;
const originalId = process.env.GOOGLE_CALENDAR_CLIENT_ID,
  originalSecret = process.env.GOOGLE_CALENDAR_CLIENT_SECRET;
beforeEach(() => {
  process.env.GOOGLE_CALENDAR_CLIENT_ID = 'test';
  process.env.GOOGLE_CALENDAR_CLIENT_SECRET = 'test';
});
afterAll(() => {
  global.fetch = originalFetch;
  if (originalId === undefined) delete process.env.GOOGLE_CALENDAR_CLIENT_ID;
  else process.env.GOOGLE_CALENDAR_CLIENT_ID = originalId;
  if (originalSecret === undefined) delete process.env.GOOGLE_CALENDAR_CLIENT_SECRET;
  else process.env.GOOGLE_CALENDAR_CLIENT_SECRET = originalSecret;
});
it('does not retry permanent refresh failures', async () => {
  const mock = jest.fn().mockResolvedValue({ ok: false, status: 400 });
  global.fetch = mock;
  await expect(refreshAccessToken('test-only')).rejects.toThrow('Reconnect');
  expect(mock).toHaveBeenCalledTimes(1);
});
it('retains distinction between temporary outage and revoked access', async () => {
  global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 503 });
  const persist = jest.fn();
  await expect(ensureValidAccessToken({ refreshTokenEnc: 'test-only' }, persist)).rejects.toThrow('temporarily');
  expect(persist).toHaveBeenCalledWith(expect.objectContaining({ status: 'sync_error' }));
  global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 400 });
  persist.mockClear();
  await expect(ensureValidAccessToken({ refreshTokenEnc: 'test-only' }, persist)).rejects.toThrow('Reconnect');
  expect(persist).toHaveBeenCalledWith(expect.objectContaining({ status: 'reauthorization_required' }));
});
