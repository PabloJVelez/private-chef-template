import { GoogleAvailabilityError } from '../availability/google-busy';
import { GET } from '../../api/admin/availability/preview/route';
import { availableSlots } from '../availability/query';
jest.mock('../availability/query', () => ({ availableSlots: jest.fn() }));
const calculate = jest.mocked(availableSlots);
const response = () => {
  const res: any = { setHeader: jest.fn(), json: jest.fn(), status: jest.fn() };
  res.status.mockReturnValue(res);
  return res;
};
beforeEach(() => calculate.mockReset());
test('admin preview uses shared calculation and only exposes arrival identifiers and labels', async () => {
  calculate.mockResolvedValue({
    date: '2026-11-01',
    timezone: 'America/Chicago',
    experienceId: 'experience',
    slots: [
      { start: '2026-11-01T07:00:00Z', label: '1:00 AM (UTC-6)', occupiedStart: 'private', occupiedEnd: 'private' },
    ],
    experience: { internal: 'private' },
  } as any);
  const scope = {} as any;
  const res = response();
  await GET({ query: { date: '2026-11-01', experience_id: 'experience' }, scope } as any, res);
  expect(calculate).toHaveBeenCalledWith(scope, '2026-11-01', 'experience');
  expect(res.json).toHaveBeenCalledWith({
    date: '2026-11-01',
    timezone: 'America/Chicago',
    experienceId: 'experience',
    slots: [{ start: '2026-11-01T07:00:00Z', label: '1:00 AM (UTC-6)' }],
  });
  expect(res.setHeader).toHaveBeenCalledWith('Cache-Control', 'no-store');
});
test('invalid dates do not reach calendar lookup', async () => {
  const res = response();
  await GET({ query: { date: '2026-02-30', experience_id: 'experience' } } as any, res);
  expect(res.status).toHaveBeenCalledWith(400);
  expect(calculate).not.toHaveBeenCalled();
});
test('lookup failure is an error, never an empty available day or leaked calendar detail', async () => {
  calculate.mockRejectedValue(new Error('private calendar detail'));
  const res = response();
  await GET({ query: { date: '2026-11-01', experience_id: 'experience' }, scope: {} } as any, res);
  expect(res.status).toHaveBeenCalledWith(503);
  expect(JSON.stringify(res.json.mock.calls)).not.toContain('private calendar detail');
});

test('admin preview explains the missing required connection while remaining unavailable', async () => {
  calculate.mockRejectedValue(new GoogleAvailabilityError('google_not_connected'));
  const res = response();
  await GET({ query: { date: '2026-11-01', experience_id: 'experience' }, scope: {} } as any, res);
  expect(res.status).toHaveBeenCalledWith(503);
  expect(res.json).toHaveBeenCalledWith({
    message: expect.stringContaining('Connect Google Calendar in Availability settings.'),
  });
});
