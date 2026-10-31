// Run only against a disposable PostgreSQL server with CREATE DATABASE permission.
// Never reads DATABASE_URL. Databases created here are uniquely named and retained.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createRequire } = require('node:module');
const { spawnSync } = require('node:child_process');
const { randomBytes } = require('node:crypto');
const root = path.resolve(__dirname, '../..');
const { Client } = createRequire(path.join(root, 'apps/medusa/package.json'))('pg');
const report = process.env.REPORT_DIR || path.join(root, 'artifacts/meal-prep-verification');
fs.mkdirSync(report, { recursive: true });
// PR7's exact manual-payment parent, not a moving branch or synthetic merge ref.
const parent = '7d11dc33b9392f3b8082ab23b70e7c93b15a56dc';
for (const key of ['PGHOST', 'PGPORT', 'PGUSER', 'PGPASSWORD']) {
  if (!process.env[key]) throw new Error(`Set ${key} for an explicitly disposable PostgreSQL server`);
}
function command(label, binary, args, cwd = root, env = process.env) {
  const logfile = path.join(report, `${label}.log`);
  const fd = fs.openSync(logfile, 'w');
  let result;
  try { result = spawnSync(binary, args, { cwd, env, stdio: ['ignore', fd, fd] }); }
  finally { fs.closeSync(fd); }
  if (result.error || result.status !== 0) throw new Error(`${label} failed; inspect ${logfile}`);
  console.log(`${label}: passed`);
}
const migration = (label, cwd, url, args = ['db:migrate', '--skip-scripts', '--skip-links']) =>
  command(label, process.execPath, [path.join(root, 'apps/medusa/node_modules/@medusajs/cli/cli.js'), ...args],
    path.join(cwd, 'apps/medusa'), { ...process.env, DATABASE_URL: url });
async function client(url, fn) {
  const db = new Client({ connectionString: url });
  await db.connect();
  try { return await fn(db); } finally { await db.end(); }
}
async function main() {
  command('parent-ancestry', 'git', ['merge-base', '--is-ancestor', parent, 'HEAD']);
  // Reuse the installed dependencies only after verifying identical manifests/lock.
  for (const file of ['package.json', 'apps/medusa/package.json', 'apps/storefront/package.json', 'yarn.lock', '.yarnrc.yml']) {
    const old = spawnSync('git', ['show', `${parent}:${file}`], { cwd: root, maxBuffer: 10 * 1024 * 1024 });
    if (old.status !== 0 || !old.stdout.equals(fs.readFileSync(path.join(root, file))))
      throw new Error(`Parent dependency mismatch: ${file}; install and verify the parent separately`);
  }
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'meal-prep-parent-'));
  const archive = path.join(scratch, 'parent.tar');
  command('parent-archive', 'git', ['archive', '--format=tar', '-o', archive, parent]);
  command('parent-extract', 'tar', ['-xf', archive, '-C', scratch]);
  for (const dir of ['node_modules', 'apps/medusa/node_modules', 'apps/storefront/node_modules'])
    fs.symlinkSync(path.join(root, dir), path.join(scratch, dir), 'dir');
  const suffix = randomBytes(6).toString('hex');
  const fresh = `mp_fresh_${suffix}`, upgrade = `mp_upgrade_${suffix}`;
  const url = (name) => {
    const u = new URL(`postgresql://${process.env.PGHOST}:${process.env.PGPORT}/${name}`);
    u.username = process.env.PGUSER; u.password = process.env.PGPASSWORD;
    return u.toString();
  };
  await client(url('postgres'), async db => {
    await db.query(`CREATE DATABASE ${fresh}`);
    await db.query(`CREATE DATABASE ${upgrade}`);
  });
  fs.writeFileSync(path.join(report, 'migration-databases.txt'), `${fresh}\n${upgrade}\n`);
  migration('fresh-migrate', root, url(fresh));
  migration('installed-medusa-adapter', root, url(fresh), ['exec', './src/scripts/verify-meal-prep-billing-adapter.ts']);
  migration('parent-migrate', scratch, url(upgrade));
  await client(url(upgrade), db => db.query(fs.readFileSync(path.join(__dirname, 'parent-fixture.sql'), 'utf8')));
  const hashes = async () => client(url(upgrade), async db => {
    const results = await db.query(fs.readFileSync(path.join(__dirname, 'parent-hashes.sql'), 'utf8'));
    return JSON.stringify(results.map(r => r.rows));
  });
  const before = await hashes();
  fs.writeFileSync(path.join(report, 'upgrade-before.json'), before);
  migration('upgrade', root, url(upgrade));
  if (await hashes() !== before) throw new Error('Upgrade altered existing parent rows');
  // Only PR7 ran in this module's last batch; PR6 financial history must survive.
  migration('empty-state-rollback', root, url(upgrade), ['db:rollback', '--modules', 'mealPrep']);
  await client(url(upgrade), async db => {
    const r = await db.query("select to_regclass('public.meal_prep_autopay_consent') as name");
    if (r.rows[0].name !== null) throw new Error('Autopay-consent table remains after rollback');
  });
  if (await hashes() !== before) throw new Error('Rollback altered existing parent rows');
  migration('reapply', root, url(upgrade));
  await client(url(upgrade), async db => {
    const r = await db.query("select to_regclass('public.meal_prep_autopay_consent') as name");
    if (!r.rows[0].name) throw new Error('Autopay-consent table missing after reapply');
  });
  const after = await hashes();
  fs.writeFileSync(path.join(report, 'upgrade-after.json'), after);
  if (after !== before) throw new Error('Reapply altered existing parent rows');
  fs.writeFileSync(path.join(report, 'migration-summary.txt'),
    `Parent ${parent}\nFresh migration, populated-parent upgrade, empty-state rollback/reapply passed. Existing row hashes unchanged.\nPopulated-state rollback refusal is tested by the PostgreSQL integration suite.\n`);
  console.log('Migration rehearsal passed; fixture row hashes unchanged.');
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
