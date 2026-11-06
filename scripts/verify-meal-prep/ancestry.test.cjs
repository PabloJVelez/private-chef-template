const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const { mkdtempSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const { verifyAncestry } = require('./ancestry.cjs');
let cwd, root, middle, head, unrelated, merge;
function git(args, input = '') {
  return execFileSync('git', ['-c', 'user.name=Ancestry fixture', '-c', 'user.email=fixture@example.invalid', ...args], {
    cwd, input, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'],
  }).trim();
}
before(() => {
  cwd = mkdtempSync(join(tmpdir(), 'meal-prep-ancestry-'));
  git(['init', '--quiet']);
  const tree = git(['mktree']);
  const commit = (message, parents = []) => git(['commit-tree', tree, '-m', message, ...parents.flatMap((p) => ['-p', p])]);
  root = commit('root');
  middle = commit('middle', [root]);
  head = commit('head', [middle]);
  unrelated = commit('unrelated root');
  merge = commit('merge fixture', [head, unrelated]);
});
after(() => rmSync(cwd, { recursive: true, force: true }));
test('records every parent edge from descendant to the exact pinned ancestor', () => {
  assert.deepEqual(verifyAncestry(cwd, root, head), [head, middle, root]);
  assert.deepEqual(verifyAncestry(cwd, head, head), [head]);
});
test('traverses both parents of a merge commit', () => {
  assert.deepEqual(verifyAncestry(cwd, unrelated, merge), [merge, unrelated]);
  assert.deepEqual(verifyAncestry(cwd, root, merge), [merge, head, middle, root]);
});
test('rejects an existing but unrelated commit', () => {
  assert.throws(() => verifyAncestry(cwd, unrelated, head), /not an ancestor/);
});
test('rejects missing commits and abbreviated pins', () => {
  assert.throws(() => verifyAncestry(cwd, '0'.repeat(40), head));
  assert.throws(() => verifyAncestry(cwd, root.slice(0, 8), head), /full pinned SHA/);
});
test('replacement refs cannot manufacture ancestry or hide the real parent chain', () => {
  git(['replace', head, unrelated]);
  assert.deepEqual(verifyAncestry(cwd, root, head), [head, middle, root]);
  assert.throws(() => verifyAncestry(cwd, unrelated, head), /not an ancestor/);
});
