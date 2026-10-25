import { GET } from '../../api/admin/availability/route';
import { saveAvailabilityWorkflow } from '../../workflows/save-availability';
import { initialNoticeRules } from '../availability/initial-notice';
import { EXPERIENCE_TYPE_MODULE } from '../../modules/experience-type';
import { asValue } from 'awilix';
import { createMedusaContainer } from '@medusajs/framework/utils';

const legacy = [
  { id: 'dinner', requires_advance_notice: true, advance_notice_days: 7, is_active: true },
  { id: 'inactive', requires_advance_notice: true, advance_notice_days: 14, is_active: false },
];
const rules = [
  { enabled: true, days: 7, scope: 'selected', experience_ids: ['dinner'] },
  { enabled: true, days: 14, scope: 'selected', experience_ids: ['inactive'] },
];
const settings = { timezone: 'UTC', weekly: {}, overrides: {}, google_mode: 'internal_only' as const };
let persisted: any;
const experiences = { listExperienceTypes: jest.fn() };
const availability = {
  listAvailabilitySettings: jest.fn(async () => persisted ? [persisted] : []),
  saveSchedule: jest.fn(async (values) => (persisted = { id: 'chef-default', ...values })),
};
const scope = createMedusaContainer();
scope.register('availability', asValue(availability));
scope.register(EXPERIENCE_TYPE_MODULE, asValue(experiences));
beforeEach(() => {
  jest.clearAllMocks();
  persisted = undefined;
  experiences.listExperienceTypes.mockResolvedValue(legacy);
});
const get = async () => {
  const json = jest.fn();
  await GET({ scope } as never, { json } as never);
  return json.mock.calls[0][0];
};
test('an upgrade with no settings row presents mixed legacy policies without inventing or saving hours', async () => {
  expect(await get()).toEqual({ settings: null, initial_notice_rules: rules });
  expect(await get()).toEqual({ settings: null, initial_notice_rules: rules });
  expect(availability.saveSchedule).not.toHaveBeenCalled();
  expect(experiences.listExperienceTypes).toHaveBeenCalledWith(
    { requires_advance_notice: true }, { skip: 0, take: 100, order: { id: 'ASC' } },
  );
});
test('first save through the real workflow preserves policies for clients omitting rules', async () => {
  const { result } = await saveAvailabilityWorkflow(scope).run({ input: settings });
  expect(result.notice_rules).toEqual(rules);
  expect((await get()).settings.notice_rules).toEqual(rules);
});
test('first save can explicitly turn notice off; subsequent reads never resurrect legacy values', async () => {
  await saveAvailabilityWorkflow(scope).run({ input: { ...settings, notice_rules: [] } });
  expect(await get()).toEqual({ settings: persisted });
  expect(persisted.notice_rules).toEqual([]);
  expect(experiences.listExperienceTypes).not.toHaveBeenCalled();
});
test.each([null, [], [{ ...rules[0], enabled: false }]])('existing schedules remain authoritative: %j', async (notice_rules) => {
  persisted = { ...settings, notice_rules };
  expect(await get()).toEqual({ settings: persisted });
  expect(experiences.listExperienceTypes).not.toHaveBeenCalled();
});
test('loads all policy pages including inactive experiences with deterministic ordering', async () => {
  const firstPage = Array.from({ length: 100 }, (_, i) => ({ ...legacy[0], id: `exp-${i}` }));
  experiences.listExperienceTypes.mockResolvedValueOnce(firstPage).mockResolvedValueOnce([legacy[1]]);
  const result = await initialNoticeRules(scope);
  expect(result[0].experience_ids).toHaveLength(100);
  expect(result[1]).toEqual(rules[1]);
  expect(experiences.listExperienceTypes.mock.calls[1][1].skip).toBe(100);
});
