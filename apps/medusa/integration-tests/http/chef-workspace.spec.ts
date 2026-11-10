import { spawnSync } from 'node:child_process';
import path from 'node:path';

it('runs workspace reads and auth against real Medusa modules in an isolated process', () => {
  const result = spawnSync(
    process.execPath,
    [
      require.resolve('jest/bin/jest'),
      '--runInBand',
      '--forceExit',
      '--testMatch=**/workspace/read-cases.spec.ts',
      '--runTestsByPath',
      path.resolve(__dirname, '../workspace/read-cases.spec.ts'),
    ],
    { env: process.env, encoding: 'utf8', timeout: 90000 },
  );
  if (result.status !== 0) throw new Error(result.error?.message || result.stdout + result.stderr);
  console.info(result.stderr);
}, 95000);
