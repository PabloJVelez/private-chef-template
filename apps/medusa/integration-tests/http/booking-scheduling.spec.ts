import { spawnSync } from 'node:child_process';
import path from 'node:path';

// Medusa 2.7/MikroORM keep process-global entity metadata. Isolate this multi-module
// fixture from the existing single-module runner's proxy models without changing that harness.
it('runs Scheduling event integration and fresh migrations in an isolated Medusa process', () => {
  const fixture = path.resolve(__dirname, '../booking/scheduling-cases.spec.ts');
  const result = spawnSync(
    process.execPath,
    [
      require.resolve('jest/bin/jest'),
      '--runInBand',
      '--forceExit',
      '--testMatch=**/booking/scheduling-cases.spec.ts',
      '--runTestsByPath',
      fixture,
    ],
    {
      env: process.env,
      encoding: 'utf8',
      timeout: 30000,
    },
  );
  if (result.status !== 0) throw new Error(result.error?.message || result.stdout + result.stderr);
  console.info(result.stderr);
}, 35000);
