/** Real core HTTP dispatch + production Redis engine; fixture identities/providers only. */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { ApiLoader } from '@medusajs/framework/http';
import { configManager } from '@medusajs/framework/config';
import { asValue } from '@medusajs/framework/awilix';
import { createWorkflow, WorkflowResponse } from '@medusajs/framework/workflows-sdk';
import { verifyReference } from '../../src/lib/private-event-schedule/contract';
import type { MedusaContainer } from '@medusajs/framework/types';
import type ChefEventModuleService from '../../src/modules/chef-event/service';

export async function verifyExecutionBoundary(container: MedusaContainer, reference: string, secret: string) {
  const core = path.join(path.dirname(require.resolve('@medusajs/medusa/package.json')), 'dist/api');
  const routesDir = fs.mkdtempSync(path.join(os.tmpdir(), 'schedule-boundary-'));
  const config = configManager.loadConfig({
    baseDir: process.cwd(),
    projectConfig: { projectConfig: { http: {
      jwtSecret: secret, cookieSecret: secret, adminCors: '', storeCors: '', authCors: '',
    } } },
  });
  container.register('configModule', asValue(config));
  // Prove the guard is workflow-specific by executing a harmless registered control.
  createWorkflow('schedule-boundary-control', (input: { value: string }) => new WorkflowResponse(input));
  const mount = (route: string, source: string) => {
    const dir = path.join(routesDir, route);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'route.js'), `module.exports = require(${JSON.stringify(source)})`);
  };
  for (const suffix of ['run', 'steps/success', 'steps/failure']) {
    const route = `admin/workflows-executions/[workflow_id]/${suffix}`;
    mount(route, path.join(core, route, 'route.js'));
  }
  for (const action of ['confirm', 'recover']) {
    mount(`admin/chef-events/schedule-edit/${action}`,
      path.resolve(__dirname, '../../src/api/admin/chef-events/schedule-edit', action, 'route.ts'));
  }
  fs.writeFileSync(path.join(routesDir, 'middlewares.js'), `
    const project = require(${JSON.stringify(path.resolve(__dirname, '../../src/api/middlewares.ts'))}).default;
    const core = require(${JSON.stringify(path.join(core, 'admin/workflows-executions/middlewares.js'))}).adminWorkflowsExecutionsMiddlewares;
    module.exports.default = {...project, routes: [...core, ...project.routes]};
  `);
  process.env.SENTRY_DSN = '';
  const app = require('express')();
  app.use((req: any, _res: any, next: any) => { req.scope = container.createScope(); next(); });
  let server: any;
  try {
    await new ApiLoader({ app, sourceDir: routesDir, container }).load();
    server = await new Promise<any>(resolve => {
      const s = app.listen(0, '127.0.0.1', () => resolve(s));
    });
    const post = async (route: string, body: unknown, actor = 'admin') => {
      const token = require('jsonwebtoken').sign({ actor_id: actor, actor_type: 'user', auth_identity_id: 'fixture' }, secret);
      const response = await fetch(`http://127.0.0.1:${server.address().port}/admin/${route}`, {
        method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
      });
      return { code: response.status, body: await response.json() };
    };
    const input = verifyReference(reference, 'admin', secret);
    const forged = { ...input, operationId: randomUUID(), time: '12:00', instant: '2030-03-09T12:00:00.000Z' };
    const cases = [
      { name: 'unsigned-modified', actor: 'admin', input: forged },
      { name: 'impersonated-actor', actor: 'not-allowlisted', input: forged },
      { name: 'original-unsigned', actor: 'admin', input },
      { name: 'signed-reference-different-caller', actor: 'not-allowlisted', input: { ...input, reference } },
      { name: 'writes-disabled', actor: 'admin', input: forged, disabled: true },
      { name: 'encoded-id', actor: 'admin', input: forged, id: '%65dit-pending-event-schedule' },
      { name: 'trailing-slash', actor: 'admin', input: forged, suffix: 'run/' },
      { name: 'step-success', actor: 'admin', input: forged, suffix: 'steps/success' },
      { name: 'step-failure', actor: 'admin', input: forged, suffix: 'steps/failure' },
    ];
    const chef = container.resolve<ChefEventModuleService>('chefEventModuleService');
    for (const test of cases) {
      process.env.CHEF_AI_SCHEDULE_WRITE_ENABLED = test.disabled ? 'false' : 'true';
      const result = await post(`workflows-executions/${test.id || 'edit-pending-event-schedule'}/${test.suffix || 'run'}`, {
        ...(test.suffix?.startsWith('steps/')
          ? { transaction_id: forged.operationId, step_id: 'edit-pending-event-schedule', response: { outcome: 'saved' } }
          : { input: test.input, transaction_id: forged.operationId }),
      }, test.actor);
      process.send?.({ type: 'boundary', name: test.name, ...result,
        time: (await chef.retrieveChefEvent(input.eventId)).requestedTime,
        receipt: await chef.readScheduleEdit(forged),
        originalReceipt: await chef.readScheduleEdit(input),
      });
    }
    process.env.CHEF_AI_SCHEDULE_WRITE_ENABLED = 'true';
    process.send?.({ type: 'control', ...await post('workflows-executions/schedule-boundary-control/run', { input: { value: 'untouched' } }) });
    process.send?.({ type: 'dedicated', ...await post('chef-events/schedule-edit/confirm', { reference }) });
    process.send?.({ type: 'recovered', ...await post('chef-events/schedule-edit/recover', { reference }) });
  } finally {
    if (server) await new Promise<void>(resolve => server.close(() => resolve()));
    fs.rmSync(routesDir, { recursive: true, force: true });
  }
}
