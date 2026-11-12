const { createStep, createWorkflow, WorkflowResponse } = require('node:module').createRequire(process.cwd() + '/package.json')('@medusajs/framework/workflows-sdk');
const marker = createStep('upgrade-fixture-marker', async () => { throw new Error('RESTORED COMPLETED STEP WAS REPLAYED'); });
const workflow = createWorkflow({ name: 'upgrade-fixture-history', store: true, idempotent: true, retentionTime: 7776000 }, () => new WorkflowResponse(marker()));
export default async function verify({ container }: any) {
  const url = new URL(process.env.DATABASE_URL!);
  if (!['localhost','127.0.0.1'].includes(url.hostname) || !['/upgrade_history','/upgrade_final_restore'].includes(url.pathname)) throw new Error('Disposable rehearsal only');
  const result = await workflow(container).run({ input: {}, context: { transactionId: 'upgrade-fixture-history' } });
  if (result.transaction.getState() !== 'done' || result.result.money !== 425.25 || !result.result.fixture) throw new Error('Restored history mismatch');
  console.log('PASS completed workflow recovered from PostgreSQL with empty isolated Redis; no step replay, money 425.25');
}
