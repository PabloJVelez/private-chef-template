/** Real module/workflow persistence, confined to an explicitly opted-in test server. */
import { resolve } from 'node:path';
import { createServer } from 'node:http';
import { Client } from '@medusajs/js-sdk';
import { AdminAvailabilityResource } from '../../src/sdk/admin/admin-availability';
// Medusa 2.7 predates the framework/awilix re-export.
// eslint-disable-next-line @medusajs/no-mikroorm-direct-import
import { createContainer, asValue } from 'awilix';
import { AvailabilitySetting } from '../../src/modules/availability/models/availability-setting';
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
      it('creates, updates minute-precision hours, and reloads the persisted schedule through the real routes', async () => {
        const scope = createContainer();
        scope.register('availability', asValue(service));
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
              await POST({ scope, body: JSON.parse(body) } as never, reply as never);
            } else {
              await GET({ scope } as never, reply as never);
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
        const save = async (body: Parameters<typeof api.save>[0]) => (await api.save(body)).settings;
        try {
          expect(await read()).toBeNull();
          const initial = {
            timezone: 'America/Chicago',
            weekly: { '1': [{ start: '09:00', end: '21:00' }] },
            overrides: {},
            google_mode: 'required' as const,
          };
          expect(await save(initial)).toMatchObject(initial);
          const changed = { ...initial, weekly: { '1': [{ start: '09:01', end: '21:02' }] } };
          expect(await save(changed)).toMatchObject(changed);
          expect(await read()).toMatchObject(changed);
          await expect(save({ ...changed, timezone: 'not-a-timezone' })).rejects.toThrow();
          expect(await read()).toMatchObject(changed);
        } finally {
          await new Promise<void>((done, fail) => server.close((error) => (error ? fail(error) : done())));
        }
      });
    },
  });
} else {
  it.skip('requires AVAILABILITY_TEST_DATABASE_URL for isolated save persistence testing', () => {});
}
