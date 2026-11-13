const assert = require('node:assert/strict');
const { createRequire } = require('node:module');
const path = require('node:path');
const requireMedusa = createRequire(path.resolve('apps/medusa/package.json'));
const jwt = requireMedusa('jsonwebtoken');
(async () => {
  const url = 'http://127.0.0.1:9011/admin/chef-ai/chat';
  const post = (body, token, target = url) => fetch(target, { method: 'POST', headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) }, body });
  const input = JSON.stringify({ message: 'today' });
  assert.equal((await post(input)).status, 401);
  for (const actor_type of ['customer', 'api-key']) {
    const token = jwt.sign({ actor_type, actor_id: 'fixture', auth_identity_id: 'fixture' }, 'bts11-disposable-jwt');
    assert.equal((await post(input, token)).status, 401);
  }
  const denied = jwt.sign({ actor_type: 'user', actor_id: 'not-authorized', auth_identity_id: 'fixture' }, 'bts11-disposable-jwt');
  assert.equal((await post(input, denied)).status, 403);
  const login = await fetch('http://127.0.0.1:9011/auth/user/emailpass', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'bts11@example.invalid', password: 'FixtureBts11Only123' }) });
  const { token } = await login.json(); assert(token);
  assert.equal((await post(JSON.stringify({ message: 'today', role: 'system' }), token)).status, 400);
  for (const target of [url, url + '/', url.replace('/chef-ai/', '/CHEF-AI/')]) {
    const invalid = await post('BTS11_PRIVATE_PARSER_SENTINEL', token, target);
    assert.equal(invalid.status, 400); assert.equal((await invalid.json()).message, 'Schedule chat request could not be processed.');
    assert.equal((await post(JSON.stringify({ message: 'x'.repeat(13000) }), token, target)).status, 413);
  }
  const response = await post(input, token); assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  const answer = await response.json(); assert.equal(answer.complete, true);
  assert(answer.entries.every(e => Object.keys(e).every(k => !['email', 'phone', 'notes', 'locationAddress', 'totalPrice'].includes(k))));
  console.log('PASS real Medusa auth: anonymous/customer/API-key denied; unauthorized Admin denied; valid user allowed; strict body schema; malformed JSON privacy; 12kb cap; no-store; minimal fields.');
})().catch(e => { console.error(e); process.exitCode = 1; });
