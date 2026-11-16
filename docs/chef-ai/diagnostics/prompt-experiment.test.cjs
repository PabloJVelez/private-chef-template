const { test } = require("node:test");
const assert = require("node:assert/strict");
const {
  loadProvider,
  promptSources,
  requestHashes,
  req,
  app,
} = require("./provider-arms.cjs");
const path = require("node:path");
const source = promptSources();
const marker = "A standalone time clarification fragment";
test("old and new provider snapshots have different prompts but identical strict tools/settings; no cache leakage", async () => {
  const records = [];
  const before = require.cache[path.join(app, "src/lib/chef-ai/provider.ts")];
  const make = (arm) =>
    class {
      constructor(options) {
        this.chat = {
          completions: {
            create: async (payload) => {
              records.push({ arm, payload, options });
              return {
                choices: [
                  { finish_reason: "stop", message: { tool_calls: [] } },
                ],
              };
            },
          },
        };
      }
    };
  const baseline = loadProvider(source.baseline, source.tool, make("baseline"));
  const candidate = loadProvider(
    source.candidate,
    source.tool,
    make("candidate"),
  );
  const input = {
    message: "At 5 PM.",
    previousQuestions: ["PRIVATE_TRANSCRIPT"],
    page: { resource: { id: "PRIVATE_ID" } },
    task: { customer: "PRIVATE_CUSTOMER" },
  };
  for (const run of [baseline, candidate, candidate, baseline])
    await run(input, "America/Chicago", new Date("2026-11-15T12:00:00Z"));
  assert.equal(records.length, 4);
  const [b, c] = records;
  assert(!b.payload.messages[0].content.includes(marker));
  assert(c.payload.messages[0].content.includes(marker));
  assert.deepEqual(b.payload.tools, c.payload.tools);
  assert(
    b.payload.tools.every(
      (t) =>
        t.function.strict &&
        t.function.parameters.additionalProperties === false,
    ),
  );
  assert.equal(b.payload.tool_choice, "auto");
  assert.equal(c.payload.tool_choice, "auto");
  assert.deepEqual(b.payload.messages.slice(1), [
    { role: "user", content: input.message },
  ]);
  assert(!JSON.stringify(records).includes("PRIVATE_"));
  assert.equal(b.options.maxRetries, 0);
  assert.equal(c.options.timeout, 15000);
  assert.equal(c.payload.max_completion_tokens, 400);
  assert.equal(
    requestHashes(source.baseline, b.payload, b.options).configHash,
    requestHashes(source.candidate, c.payload, c.options).configHash,
  );
  assert.deepEqual(records[0].payload, records[3].payload);
  assert.deepEqual(records[1].payload, records[2].payload);
  assert.equal(
    require.cache[path.join(app, "src/lib/chef-ai/provider.ts")],
    before,
  );
});

const fs = require("node:fs"),
  os = require("node:os"),
  cp = require("node:child_process");
const {
  hash,
  sourceAt,
  PROMPT_BASELINE,
  validatePaidSnapshot,
} = require("./provider-arms.cjs");
test("the frozen 12-case corpus and expectations are byte-semantically unchanged", () => {
  const old = cp.execFileSync(
    "git",
    ["show", PROMPT_BASELINE + ":docs/chef-ai/diagnostics/evaluate-on-to.cjs"],
    { encoding: "utf8" },
  );
  const slice = old.slice(
    old.indexOf("  const day ="),
    old.indexOf("  const phaseFlag ="),
  );
  assert.deepEqual(
    require("./on-to-corpus.cjs").cases,
    new Function(slice + "\nreturn cases;")(),
  );
});
test("paid snapshot validation rejects changed SHA/branch/model/config/budget or dirty state without making calls", () => {
  const head = "a".repeat(40),
    plan = { candidateSha: head, maxCalls: 20, configHash: "fixed" };
  const valid = {
    head,
    branch: "feat/sous-chef-pending-time-edit-ui-v1",
    dirty: false,
    candidateSha: head,
    model: "gpt-5.4-mini",
    cap: 20,
    maxCalls: "20",
    plan,
  };
  validatePaidSnapshot(valid, plan);
  for (const delta of [
    { candidateSha: "b".repeat(40) },
    { branch: "main" },
    { dirty: true },
    { model: "gpt-4.1-mini" },
    { maxCalls: "132" },
  ])
    assert.throws(() => validatePaidSnapshot({ ...valid, ...delta }, plan));
  assert.throws(() => validatePaidSnapshot(valid, { ...plan, maxCalls: 12 }));
});
function cli(args) {
  return cp.spawnSync(
    process.execPath,
    ["docs/chef-ai/diagnostics/evaluate-fragments.cjs", ...args],
    {
      encoding: "utf8",
      env: {
        ...process.env,
        NODE_ENV: "test",
        CHEF_AI_OPENAI_API_KEY: "",
        CHEF_AI_MODEL: "gpt-5.4-mini",
      },
      timeout: 30000,
    },
  );
}
test("three separately frozen/capped blocks, arm identity, negative routing and privacy projections", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "fragment-offline-"));
  try {
    for (const [mode, cap] of [
      ["prompt-ab", 100],
      ["time-regression", 20],
      ["negative-controls", 12],
    ]) {
      const frozen = path.join(dir, mode + "-plan.json"),
        out = path.join(dir, mode + ".json");
      let r = cli(["--mode=" + mode, "--freeze=" + frozen]);
      assert.equal(r.status, 0, r.stderr);
      const plan = JSON.parse(r.stdout);
      assert.equal(plan.maxCalls, cap);
      assert.equal(plan.arms.baseline.providerSha, PROMPT_BASELINE);
      assert.equal(plan.arms.baseline.toolHash, plan.arms.candidate.toolHash);
      assert.equal(
        plan.arms.baseline.configHash,
        plan.arms.candidate.configHash,
      );
      assert.notEqual(
        plan.arms.baseline.promptHash,
        plan.arms.candidate.promptHash,
      );
      assert.deepEqual(plan, JSON.parse(fs.readFileSync(frozen)));
      assert(!r.stdout.includes("At 5 PM"));
      assert(!r.stdout.includes("system"));
      r = cli(["--mode=" + mode, "--self-test", "--out=" + out]);
      assert.equal(r.status, 0, r.stderr);
      const data = JSON.parse(fs.readFileSync(out));
      assert.equal(data.calls, cap);
      assert.equal(data.gatePassed, true);
      assert.equal(data.live, false);
      assert.equal(data.requests.candidate, mode === "prompt-ab" ? 50 : cap);
      assert.equal(data.requests.baseline, mode === "prompt-ab" ? 50 : 0);
      if (mode === "prompt-ab") {
        assert.equal(data.totals.baseline.exact, 47);
        assert.equal(data.totals.candidate.exact, 50);
        assert.deepEqual(
          data.rows.slice(0, 4).map((r) => r.arm),
          ["baseline", "candidate", "candidate", "baseline"],
        );
      }
      if (mode === "time-regression")
        assert.deepEqual(
          data.rows.map((r) => r.id),
          Array.from({ length: 20 }, (_, i) =>
            i % 2 ? "time-fragment" : "time",
          ),
        );
      if (mode === "negative-controls") {
        assert.equal(
          data.rows.filter((r) => r.classification === "no_tool" && r.exact)
            .length,
          4,
        );
        assert.equal(
          data.rows.filter(
            (r) => r.id === "ambiguous" && r.intent?.clarification === "time",
          ).length,
          2,
        );
        assert(data.rows.every((r) => r.resolverInvoked === 0));
      }
      assert(
        data.rows.every(
          (r) => !r.unsafeResolverCalls && r.app_check === "completed",
        ),
      );
      assert(!JSON.stringify(data).includes("At 5 PM"));
      assert(!JSON.stringify(data).includes("PRIVATE_"));
    }
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
test("no-tool misses and hidden app errors fail acceptance; provider/invariant errors stop without retry", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "fragment-fault-"));
  try {
    for (const fault of ["no_tool", "app", "provider", "invariant"]) {
      const file = path.join(dir, fault + ".json");
      const r = cli([
        "--mode=time-regression",
        "--self-test",
        "--self-test-fault=" + fault,
        "--out=" + file,
      ]);
      const d = JSON.parse(fs.readFileSync(file));
      assert.equal(d.gatePassed, false);
      assert.equal(d.calls, ["provider", "invariant"].includes(fault) ? 1 : 20);
      assert.equal(r.status, ["provider", "invariant"].includes(fault) ? 1 : 0);
      if (fault === "provider") {
        assert.equal(d.rows[0].error, "provider_failure");
        assert.equal(d.totals.candidate.appChecksSkipped, 1);
      }
      if (fault === "invariant") {
        assert.equal(d.rows[0].classification, "diagnostic_internal_error");
        assert.equal(d.totals.candidate.appCheckErrors, 1);
      }
      if (fault === "no_tool") assert.equal(d.totals.candidate.exact, 0);
      if (fault === "app") assert.equal(d.totals.candidate.appCheckErrors, 20);
      assert(!JSON.stringify(d).includes("Synthetic private"));
      assert(!r.stderr.includes("Synthetic private"));
    }
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
