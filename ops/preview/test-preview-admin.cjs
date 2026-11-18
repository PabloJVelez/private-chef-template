const { test } = require('node:test');
const assert = require('node:assert/strict');
const bootstrap = require('./preview-admin.cjs').default;
test('preview-only guard rejects before resolving services', async () => {
  delete process.env.PREVIEW_MODE;
  await assert.rejects(bootstrap({ container: { resolve() { throw Error('must not resolve'); } } }), /Preview mode required/);
});
test('creates, binds, then resets the same account without duplicates', async () => {
  process.env.PREVIEW_MODE = 'true';
  let user, identity, password, creates = 0, registrations = 0;
  const users = {
    listUsers: async ({email}) => { assert.equal(email, 'chef@admin.com'); return user ? [user] : []; },
    createUsers: async data => { creates++; return user = { ...data, id: 'usr_preview' }; }
  };
  const auth = {
    listProviderIdentities: async () => identity ? [{auth_identity_id: identity.id}] : [],
    retrieveAuthIdentity: async () => identity,
    register: async (provider, {body}) => { registrations++; assert.equal(body.email, 'chef@admin.com'); password = body.password; return {success:true, authIdentity: identity = {id:'auth_preview', app_metadata:{retained:true}}}; },
    updateProvider: async (provider, data) => { assert.equal(data.entity_id, 'chef@admin.com'); password = data.password; return {success:true}; },
    updateAuthIdentities: async data => { identity = data; }
  };
  const container = { resolve: name => ({user:users, auth})[name] };
  await bootstrap({container});
  assert.equal(password, 'test'); assert.equal(identity.app_metadata.user_id, user.id);
  assert.equal(identity.app_metadata.retained, true);
  password = 'changed'; await bootstrap({container});
  assert.equal(password, 'test'); assert.equal(creates, 1); assert.equal(registrations, 1);
  identity.app_metadata.user_id = 'different';
  await assert.rejects(bootstrap({container}), /belongs to another user/);
});
