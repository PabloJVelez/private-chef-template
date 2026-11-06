/** SD-01/02/03/04/08/17: actual Availability module, workflow and HTTP on disposable PostgreSQL. */
import { resolve } from 'node:path';
import { createServer } from 'node:http';
import { createContainer, asValue } from 'awilix';
import { Client } from '@medusajs/js-sdk';
import { AdminAvailabilityResource } from '../../src/sdk/admin/admin-availability';
import { AvailabilitySetting } from '../../src/modules/availability/models/availability-setting';
import { GET as adminGet, POST } from '../../src/api/admin/availability/route';
import { GET } from '../../src/api/store/meal-prep/route';
import { emptyMealPrepSetup, type Settings } from '../../src/lib/availability/slots';
import { evaluateMealPrepDiscovery } from '../../src/lib/meal-prep-discovery';
import { cleanSettings } from '../../src/admin/components/availability/editor';
import { EXPERIENCE_TYPE_MODULE } from '../../src/modules/experience-type';
const url = process.env.AVAILABILITY_TEST_DATABASE_URL;
if (url) {
  const server = new URL(url);
  process.env.DB_HOST = server.host;
  process.env.DB_USERNAME = decodeURIComponent(server.username);
  process.env.DB_PASSWORD = decodeURIComponent(server.password);
  const { moduleIntegrationTestRunner } = require('@medusajs/test-utils');
  moduleIntegrationTestRunner({
    moduleName: 'availability', moduleModels: [AvailabilitySetting],
    resolve: resolve(__dirname, '../../src/modules/availability'), schema: 'public',
    testSuite: ({ service }: { service: any }) => {
      it('fresh reads follow complete committed snapshots; stale/failed/lost saves cannot corrupt discovery', async () => {
        const scope = createContainer();
        scope.register('availability', asValue(service));
        scope.register(EXPERIENCE_TYPE_MODULE, asValue({ listExperienceTypes: async () => [] }));
        let loseResponse = false;
        const server = createServer(async (request, response) => {
          const reply = {
            setHeader(key: string, value: string) { response.setHeader(key, value); },
            status(code: number) { response.statusCode = code; return reply; },
            json(body: unknown) {
              if (loseResponse && request.method === 'POST') { loseResponse = false; response.destroy(); return; }
              response.setHeader('Content-Type', 'application/json'); response.end(JSON.stringify(body));
            },
          };
          try {
            if (request.url === '/store/meal-prep' && request.method === 'GET') await GET({ scope } as any, reply as any);
            else if (request.url === '/admin/availability') {
              const req: any = { scope, auth_context: { actor_type: 'user', actor_id: 'admin' } };
              if (request.method === 'POST') { let body = ''; for await (const chunk of request) body += chunk; req.body = JSON.parse(body); await POST(req, reply as any); }
              else await adminGet(req, reply as any);
            } else reply.status(404).json({ message: 'Unknown route' });
          } catch { reply.status(500).json({ message: 'Test request failed' }); }
        });
        await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
        const base = `http://127.0.0.1:${(server.address() as any).port}`;
        const admin = new AdminAvailabilityResource(new Client({ baseUrl: base, auth: { type: 'session' } }));
        const read = async () => {
          const response = await fetch(`${base}/store/meal-prep`);
          expect(response.status).toBe(200);
          expect(response.headers.get('cache-control')).toBe('no-store');
          return response.json();
        };
        const initial: Settings = { timezone: 'UTC', weekly: {}, overrides: {}, google_mode: 'internal_only', notice_rules: [], version: 0 };
        let saved = initial;
        try {
          expect((await read()).status).toBe('not_offered');
          expect((await admin.get()).settings).toBeNull(); // reads did not initialize persistence
          for (const method of ['in_home', 'delivery', 'pickup'] as const) {
            const setup = emptyMealPrepSetup(); setup.methods[method].enabled = true;
            setup.selection_styles.individual_dishes = true;
            saved = (await admin.save({ ...cleanSettings(saved), meal_prep: setup })).settings;
            expect(await read()).toEqual(evaluateMealPrepDiscovery(setup).projection);
          }
          const beforeRace = structuredClone(cleanSettings(saved));
          const a = emptyMealPrepSetup(); a.methods.in_home.enabled = true; a.selection_styles.chosen_menu = true;
          a.delivery_area = { radius: { address: 'PRIVATE ORIGIN', distance: 10, unit: 'mi' }, zip_codes: ['00501'] };
          a.work_plans = [{ id: 'PRIVATE PLAN', purpose: 'delivery', start: '2026-11-09T10:00:00Z', end: '2026-11-09T11:00:00Z' }];
          const b = emptyMealPrepSetup(); b.methods.delivery.enabled = true; b.methods.pickup.enabled = true; b.selection_styles.package = true;
          const permitted = [evaluateMealPrepDiscovery(saved.meal_prep).projection, evaluateMealPrepDiscovery(a).projection, evaluateMealPrepDiscovery(b).projection];
          const writes = Promise.allSettled([admin.save({ ...cleanSettings(saved), meal_prep: a }), admin.save({ ...cleanSettings(saved), meal_prep: b })]);
          const reads = await Promise.all(Array.from({ length: 32 }, read));
          const race = await writes;
          expect(race.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
          expect((race.find((result) => result.status === 'rejected') as PromiseRejectedResult).reason.status).toBe(409);
          reads.forEach((projection) => expect(permitted).toContainEqual(projection));
          saved = (await admin.get()).settings!;
          expect(saved.version).toBe(beforeRace.version! + 1);
          expect(await read()).toEqual(evaluateMealPrepDiscovery(saved.meal_prep).projection);
          await expect(admin.save(beforeRace)).rejects.toMatchObject({ status: 409 });
          await expect(admin.save({ ...cleanSettings(saved), timezone: 'invalid' })).rejects.toMatchObject({ status: 400 });
          expect(await read()).toEqual(evaluateMealPrepDiscovery(saved.meal_prep).projection);
          // Repeat alternating atomic writes while reading, so both versions are exercised.
          for (let i = 0; i < 12; i++) {
            const next = i % 2 ? a : b;
            const allowed = [evaluateMealPrepDiscovery(saved.meal_prep).projection, evaluateMealPrepDiscovery(next).projection];
            const writing = admin.save({ ...cleanSettings(saved), meal_prep: next });
            const concurrent = await Promise.all(Array.from({ length: 6 }, read));
            concurrent.forEach((projection) => expect(allowed).toContainEqual(projection));
            saved = (await writing).settings;
            expect(await read()).toEqual(evaluateMealPrepDiscovery(next).projection);
          }
          loseResponse = true;
          await expect(admin.save({ ...cleanSettings(saved), meal_prep: b })).rejects.toThrow();
          const checked = (await admin.get()).settings!;
          expect(checked.version).toBe(saved.version! + 1);
          expect(await read()).toEqual(evaluateMealPrepDiscovery(b).projection);
          saved = (await admin.save({ ...cleanSettings(checked), meal_prep: null })).settings;
          expect((await read()).status).toBe('not_offered');
          expect(Object.keys(await read()).sort()).toEqual(['can_request', 'methods', 'selection_styles', 'status']);
          expect((await fetch(`${base}/store/meal-prep`, { method: 'POST' })).status).toBe(404);
        } finally { await new Promise<void>((done) => server.close(() => done())); }
      });
    },
  });
} else it.skip('requires AVAILABILITY_TEST_DATABASE_URL', () => {});
