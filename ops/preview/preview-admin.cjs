// Operator-owned bootstrap, run only inside a managed synthetic preview.
module.exports.default = async function ({ container }) {
  if (process.env.PREVIEW_MODE !== 'true') throw new Error('Preview mode required');
  const email = 'chef@admin.com';
  const password = 'test';
  const users = container.resolve('user');
  const auth = container.resolve('auth');
  let user = (await users.listUsers({ email }))[0];
  if (!user) user = await users.createUsers({ email, first_name: 'Preview', last_name: 'Chef' });
  const [provider] = await auth.listProviderIdentities({ entity_id: email, provider: 'emailpass' });
  let identity = provider?.auth_identity_id ? await auth.retrieveAuthIdentity(provider.auth_identity_id) : undefined;
  if (identity?.app_metadata?.user_id && identity.app_metadata.user_id !== user.id)
    throw new Error('Preview identity belongs to another user');
  if (!identity) {
    const result = await auth.register('emailpass', { body: { email, password } });
    if (!result.success || !result.authIdentity) throw new Error('Preview registration failed');
    identity = result.authIdentity;
  } else {
    const result = await auth.updateProvider('emailpass', { entity_id: email, password });
    if (!result.success) throw new Error('Preview password update failed');
  }
  if (!identity.app_metadata?.user_id)
    await auth.updateAuthIdentities({ id: identity.id, app_metadata: { ...identity.app_metadata, user_id: user.id } });
  console.log('Standard preview Admin configured');
};
