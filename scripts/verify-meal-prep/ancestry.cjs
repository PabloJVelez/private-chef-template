// Verify a pinned ancestor using the immutable parent links in commit objects.
// No merge-base date/generation heuristics, replacement refs, or commit-graph cache.
const { execFileSync } = require('node:child_process');

function verifyAncestry(cwd, ancestor, descendant = 'HEAD') {
  if (!/^[a-f0-9]{40}$/.test(ancestor)) throw new Error('The ancestor must be a full pinned SHA');
  const git = (args) => execFileSync('git', ['--no-replace-objects', ...args], {
    cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 10 * 1024 * 1024,
  });
  const head = git(['rev-parse', '--verify', `${descendant}^{commit}`]).trim();
  // Require the pin to resolve to an actual commit, including when head == pin.
  git(['cat-file', 'commit', ancestor]);
  const pending = [{ sha: head, path: [head] }];
  const visited = new Set();
  while (pending.length) {
    const current = pending.pop();
    if (visited.has(current.sha)) continue;
    visited.add(current.sha);
    if (current.sha === ancestor) return current.path;
    const headers = git(['cat-file', 'commit', current.sha]).split('\n\n', 1)[0];
    for (const line of headers.split('\n')) {
      const match = /^parent ([a-f0-9]{40})$/.exec(line);
      if (match) pending.push({ sha: match[1], path: [...current.path, match[1]] });
    }
  }
  throw new Error(`Pinned parent ${ancestor} is not an ancestor of ${head}`);
}

module.exports = { verifyAncestry };
if (require.main === module) {
  try {
    console.log(JSON.stringify({ verified_parent_path: verifyAncestry(process.cwd(), process.argv[2]) }, null, 2));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
