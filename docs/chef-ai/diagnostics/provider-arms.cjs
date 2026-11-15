// Test/evaluation-only in-memory snapshots. No production switch or require-cache mutation.
const fs = require("node:fs"),
  path = require("node:path"),
  cp = require("node:child_process");
const { Module, createRequire } = require("node:module");
const { createHash } = require("node:crypto");
const PROMPT_BASELINE = "2537ce032ea4b19bb95dde0122f4b23a9b4adc71";
const ROOT = cp
  .execFileSync("git", ["rev-parse", "--show-toplevel"], { encoding: "utf8" })
  .trim();
const app = path.join(ROOT, "apps/medusa");
const req = createRequire(path.join(app, "package.json"));
req("ts-node").register({
  project: path.join(app, "tsconfig.json"),
  transpileOnly: true,
});
const ts = req("typescript");
const hash = (value) =>
  createHash("sha256")
    .update(typeof value === "string" ? value : JSON.stringify(value))
    .digest("hex");
function sourceAt(sha, file) {
  if (!/^[0-9a-f]{40}$/.test(sha)) throw new Error("Exact SHA required");
  return cp.execFileSync(
    "git",
    ["show", sha + ":apps/medusa/src/lib/chef-ai/" + file],
    { encoding: "utf8" },
  );
}
function compile(source, file, overrides = {}) {
  const filename = path.join(app, "src/lib/chef-ai", file);
  const local = createRequire(filename);
  const m = new Module(filename + ".snapshot.cjs", module);
  m.filename = filename + ".snapshot.cjs";
  m.paths = Module._nodeModulePaths(path.dirname(filename));
  m.require = (name) =>
    Object.prototype.hasOwnProperty.call(overrides, name)
      ? overrides[name]
      : local(name);
  m._compile(
    ts.transpileModule(source, {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        esModuleInterop: true,
      },
    }).outputText,
    m.filename,
  );
  return m.exports;
}
function loadProvider(source, editSource, Client) {
  const edit = compile(editSource, "edit-intent.ts");
  return compile(source, "provider.ts", {
    "./edit-intent": edit,
    openai: Client,
  }).selectSchedule;
}
function promptSources(candidateSha) {
  return {
    baseline: sourceAt(PROMPT_BASELINE, "provider.ts"),
    candidate: candidateSha
      ? sourceAt(candidateSha, "provider.ts")
      : fs.readFileSync(path.join(app, "src/lib/chef-ai/provider.ts"), "utf8"),
    tool: sourceAt(PROMPT_BASELINE, "edit-intent.ts"),
  };
}
function requestHashes(source, payload, options) {
  return {
    providerHash: hash(source),
    promptHash: hash(payload.messages[0].content),
    toolHash: hash(payload.tools),
    configHash: hash({
      model: payload.model,
      store: payload.store,
      max_completion_tokens: payload.max_completion_tokens,
      parallel_tool_calls: payload.parallel_tool_calls,
      tool_choice: payload.tool_choice,
      timeout: options.timeout,
      maxRetries: options.maxRetries,
      logLevel: options.logLevel,
    }),
  };
}
module.exports = {
  PROMPT_BASELINE,
  ROOT,
  app,
  req,
  hash,
  sourceAt,
  loadProvider,
  promptSources,
  requestHashes,
};

function validatePaidSnapshot(
  { head, branch, dirty, candidateSha, model, cap, maxCalls, plan },
  frozen,
) {
  const assert = require("node:assert/strict");
  assert.match(head, /^[0-9a-f]{40}$/);
  assert.equal(dirty, false);
  assert.equal(branch, "feat/sous-chef-pending-time-edit-ui-v1");
  assert.equal(candidateSha, head);
  assert.equal(model, "gpt-5.4-mini");
  assert.equal(maxCalls, String(cap));
  assert.deepEqual(frozen, plan);
}
module.exports.validatePaidSnapshot = validatePaidSnapshot;
