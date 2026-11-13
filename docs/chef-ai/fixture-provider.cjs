// Test-only preload: deterministic OpenAI HTTP responses for the REAL SDK.
// Never load this in deployment. It cannot run against a non-loopback fixture DB.
const db = new URL(process.env.DATABASE_URL || '');
if (!['localhost', '127.0.0.1'].includes(db.hostname) || db.pathname !== '/bts11_admin' || process.env.CHEF_AI_OPENAI_API_KEY !== 'fixture-not-a-real-key') throw Error('BTS-11 disposable fixture required');
const original = globalThis.fetch;
globalThis.fetch = async (input, init) => {
  const url = String(input?.url || input);
  if (!url.startsWith('https://api.openai.com/')) return original(input, init);
  const body = JSON.parse(init.body);
  const prompt = body.messages.at(-1).content.toLowerCase();
  const timeZone = body.tools[0].function.parameters.properties.timeZone.enum[0];
  const period = prompt.includes('weekend') ? 'this_weekend' : prompt.includes('week') ? 'this_week' : prompt.includes('tomorrow') ? 'tomorrow' : 'today';
  const calls = /accept|write|available|ignore/.test(prompt) ? [] : [{ id: 'fixture-call', type: 'function', function: { name: 'get_schedule', arguments: JSON.stringify({ period, startDate: null, endDate: null, timeZone }) } }];
  await new Promise(resolve => setTimeout(resolve, 350));
  return new Response(JSON.stringify({ id: 'fixture-response', object: 'chat.completion', created: 1, model: 'fixture', choices: [{ index: 0, finish_reason: calls.length ? 'tool_calls' : 'stop', message: { role: 'assistant', content: null, tool_calls: calls } }] }), { headers: { 'content-type': 'application/json' } });
};
