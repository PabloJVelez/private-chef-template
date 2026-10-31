/** Real module/workflow persistence, confined to an explicitly opted-in test server. */
import { resolve } from 'node:path';
import { createServer } from 'node:http';
import { Client } from '@medusajs/js-sdk';
import { AdminAvailabilityResource } from '../../src/sdk/admin/admin-availability';
// Medusa 2.7 predates the framework/awilix re-export.
// eslint-disable-next-line @medusajs/no-mikroorm-direct-import
import { createContainer, asValue } from 'awilix';
import { AvailabilitySetting } from '../../src/modules/availability/models/availability-setting';
import { EXPERIENCE_TYPE_MODULE } from '../../src/modules/experience-type';
import { emptyMealPrepSetup } from '../../src/lib/availability/slots';
import { cleanSettings } from '../../src/admin/components/availability/editor';
import { GET, POST } from '../../src/api/admin/availability/route';

const url = process.env.AVAILABILITY_TEST_DATABASE_URL;
if (url) {
  const testServer = new URL(url);
  process.env.DB_HOST = testServer.host;
  process.env.DB_USERNAME = decodeURIComponent(testServer.username);
  process.env.DB_PASSWORD = decodeURIComponent(testServer.password);
  const { moduleIntegrationTestRunner } = require('@medusajs/test-utils');
  moduleIntegrationTestRunner({
    moduleName: 'availability',
    moduleModels: [AvailabilitySetting],
    resolve: resolve(__dirname, '../../src/modules/availability'),
    // The runner owns medusa-availability-integration-1 on the opted-in test server.
    schema: 'public',
    testSuite: ({ service }: { service: unknown }) => {
      it('replaces complete schedules through SDK/HTTP/workflow and persists weekday and exception deletions', async () => {
        const scope = createContainer();
        scope.register('availability', asValue(service));
        const initialRules = [{ enabled: true, days: 7, scope: 'selected', experience_ids: ['legacy-dinner'] }];
        scope.register(EXPERIENCE_TYPE_MODULE, asValue({
          listExperienceTypes: async () => [{ id: 'legacy-dinner', requires_advance_notice: true, advance_notice_days: 7 }],
        }));
        const server = createServer(async (request, response) => {
          const reply = {
            status(code: number) {
              response.statusCode = code;
              return reply;
            },
            json(body: unknown) {
              response.setHeader('Content-Type', 'application/json');
              response.end(JSON.stringify(body));
            },
          };
          if (request.url !== '/admin/availability') {
            reply.status(404).json({ message: 'Unknown route' });
            return;
          }
          try {
            if (request.method === 'POST') {
              let body = '';
              for await (const chunk of request) body += chunk;
              await POST({ scope, auth_context: { actor_type: 'user', actor_id: 'admin' }, body: JSON.parse(body) } as never, reply as never);
            } else {
              await GET({ scope, auth_context: { actor_type: 'user', actor_id: 'admin' } } as never, reply as never);
            }
          } catch (error) {
            reply.status(500).json({ message: String(error) });
          }
        });
        await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
        const port = (server.address() as { port: number }).port;
        const api = new AdminAvailabilityResource(
          new Client({ baseUrl: `http://127.0.0.1:${port}`, auth: { type: 'session' } }),
        );
        const read = async () => (await api.get()).settings;
        const save = async (body: Parameters<typeof api.save>[0]) =>
          (await api.save({ ...body, version: (await read())?.version ?? 0 })).settings;
        try {
          expect(await read()).toBeNull();
          expect((await api.get()).initial_notice_rules).toEqual(initialRules);
          const initial = {
            timezone: 'America/Chicago',
            weekly: { '1': [{ start: '09:00', end: '21:00' }] },
            overrides: {},
            google_mode: 'required' as const,
          };
          const firstRace = await Promise.allSettled([api.save({ ...initial, version: 0 }), api.save({ ...initial, version: 0 })]);
          expect(firstRace.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
          const firstConflict = firstRace.find((r) => r.status === 'rejected') as PromiseRejectedResult;
          expect(firstConflict.reason.status).toBe(409);
          expect((await read())?.version).toBe(1);
          expect(await save(initial)).toMatchObject({ ...initial, notice_rules: initialRules });
          expect((await read())?.notice_rules).toEqual(initialRules);
          await save({ ...initial, notice_rules: [] });
          expect((await api.get()).initial_notice_rules).toBeUndefined();
          expect((await read())?.notice_rules).toEqual([]);
          const changed = { ...initial, weekly: { '1': [{ start: '09:01', end: '21:02' }] } };
          expect(await save(changed)).toMatchObject(changed);
          expect(await read()).toMatchObject(changed);
          const fullWeek = {
            ...changed,
            weekly: Object.fromEntries(
              Array.from({ length: 7 }, (_, i) => [String(i + 1), [{ start: '09:01', end: '21:02' }]]),
            ),
          };
          await save(fullWeek);
          const withoutSunday = { ...fullWeek, weekly: { ...fullWeek.weekly } };
          delete withoutSunday.weekly['7'];
          expect((await save(withoutSunday)).weekly).toEqual(withoutSunday.weekly);
          expect((await read())?.weekly).toEqual(withoutSunday.weekly);
          const exceptions = {
            ...withoutSunday,
            overrides: { '2026-11-01': [], '2026-11-02': [{ start: '10:00', end: '14:00' }] },
          };
          await save(exceptions);
          const oneException = { ...exceptions, overrides: { '2026-11-02': exceptions.overrides['2026-11-02'] } };
          expect((await save(oneException)).overrides).toEqual(oneException.overrides);
          expect((await read())?.overrides).toEqual(oneException.overrides);
          const empty = { ...changed, weekly: {}, overrides: {} };
          expect((await save(empty)).weekly).toEqual({});
          expect((await read())?.weekly).toEqual({});
          expect((await read())?.overrides).toEqual({});
          await save(changed);
          await expect(save({ ...changed, timezone: 'not-a-timezone' })).rejects.toThrow();
          expect(await read()).toMatchObject(changed);
          const setup = emptyMealPrepSetup();
          setup.methods.delivery.enabled = true;
          setup.methods.pickup.enabled = true;
          setup.selection_styles.package = true;
          setup.methods.delivery.weekly = { '1': [{ start: '10:00', end: '12:00' }], '2': [{ start: '11:00', end: '13:00' }] };
          setup.methods.pickup.dates = { '2026-11-02': [], '2026-11-03': [{ start: '12:00', end: '14:00' }] };
          setup.delivery_area = { radius: { address: 'Draft address', distance: 12.5, unit: 'mi' }, zip_codes: ['00501', '10001'] };
          setup.work_plans = [{ id: 'draft', purpose: 'handoff', start: '2026-11-02T10:00:00Z', end: '2026-11-02T11:00:00Z' }];
          expect((await save({ ...changed, meal_prep: setup })).meal_prep).toEqual(setup);
          expect((await read())?.meal_prep).toEqual(setup);
          const loaded = (await read())!;
          const race = await Promise.allSettled([
            api.save({ ...changed, version: loaded.version, timezone: 'UTC', meal_prep: setup }),
            api.save({ ...changed, version: loaded.version, timezone: 'Europe/London', meal_prep: setup }),
          ]);
          expect(race.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
          expect((race.find((r) => r.status === 'rejected') as PromiseRejectedResult).reason.status).toBe(409);
          expect((await read())?.version).toBe(loaded.version! + 1);
          // Omitted setup from a compatible versioned caller preserves it.
          await save(changed);
          expect((await read())?.meal_prep).toEqual(setup);
          delete setup.methods.delivery.weekly['2'];
          delete setup.methods.pickup.dates['2026-11-02'];
          setup.delivery_area = { radius: null, zip_codes: [] };
          setup.work_plans = [];
          await save({ ...changed, meal_prep: setup });
          expect((await read())?.meal_prep).toEqual(setup);
          // The tabbed editor submits one snapshot, including the inactive experience.
          const acrossTabs = await save({
            ...changed,
            timezone: 'Europe/London',
            google_mode: 'internal_only',
            overrides: { '2026-11-04': [] },
            notice_rules: [{ enabled: true, days: 4, scope: 'all', experience_ids: [] }],
            meal_prep: setup,
          });
          const methodEdit = structuredClone(cleanSettings(acrossTabs));
          methodEdit.meal_prep!.methods.pickup.weekly = { '3': [{ start: '12:15', end: '15:45' }] };
          methodEdit.meal_prep!.methods.in_home.enabled = true;
          const fromMealTab = (await api.save(methodEdit)).settings;
          expect(await read()).toMatchObject({ ...methodEdit, version: acrossTabs.version! + 1 });
          // Returning to private events must preserve the entire saved method draft.
          const eventEdit = { ...cleanSettings(fromMealTab), notice_rules: [], weekly: {} };
          const fromEventTab = (await api.save(eventEdit)).settings;
          expect(await read()).toMatchObject({ ...eventEdit, version: fromMealTab.version! + 1 });
          expect(fromEventTab.meal_prep).toEqual(methodEdit.meal_prep);
          // A stale snapshot from either experience cannot restore deleted event hours or rules.
          await expect(api.save(methodEdit)).rejects.toMatchObject({ status: 409 });
          expect(await read()).toEqual(fromEventTab);
          await save({ ...changed, meal_prep: emptyMealPrepSetup() });
          expect((await read())?.meal_prep).toEqual(emptyMealPrepSetup());
          const beforeInvalid = await read();
          await expect(api.save({ ...changed, version: beforeInvalid!.version, meal_prep: { ...setup, max_orders: 1 } } as never)).rejects.toThrow();
          await expect(api.save(changed)).rejects.toThrow();
          expect(await read()).toEqual(beforeInvalid);
          await save({ ...changed, meal_prep: null });
          expect((await read())?.meal_prep).toBeNull();
        } finally {
          await new Promise<void>((done, fail) => server.close((error) => (error ? fail(error) : done())));
        }
      });
    },
  });
} else {
  it.skip('requires AVAILABILITY_TEST_DATABASE_URL for isolated save persistence testing', () => {});
}
