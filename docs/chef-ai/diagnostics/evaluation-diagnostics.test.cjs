const { test } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { createRequire } = require("node:module");
const req = createRequire(path.resolve("apps/medusa/package.json"));
req("ts-node").register({
  project: path.resolve("apps/medusa/tsconfig.json"),
  transpileOnly: true,
});
const { editIntentSchema } = req(
  path.resolve("apps/medusa/src/lib/chef-ai/edit-intent.ts"),
);
const { clarifyEditMeaning } = req(
  path.resolve("apps/medusa/src/lib/chef-ai/edit-semantics.ts"),
);
const { answerSchedule } = req(
  path.resolve("apps/medusa/src/lib/chef-ai/chat.ts"),
);
const { z } = req("@medusajs/framework/zod");
const {
  classifySelection,
  checkApplication,
} = require("./evaluation-diagnostics.cjs");
const expected = {
  target: "context",
  targetDate: null,
  date: null,
  time: "17:00",
  clarification: "none",
  continuation: false,
};
const deps = {
  schema: editIntentSchema,
  clarify: clarifyEditMeaning,
  isSchemaError: (e) => e instanceof z.ZodError,
};
const call = (value = expected) => ({
  name: "propose_pending_event_date_time_edit",
  arguments: JSON.stringify(value),
});
const classify = (s) => classifySelection(s, expected, deps);
const secret = "SECRET_CUSTOMER_TOKEN_REFERENCE_URL";
for (const [name, selected, category] of [
  ["empty", { calls: [] }, "no_tool"],
  ["multiple", { calls: [call(), call()] }, "multiple_tools"],
  [
    "wrong known",
    { calls: [{ ...call(), name: "get_schedule" }] },
    "wrong_tool",
  ],
  ["wrong secret", { calls: [{ ...call(), name: secret }] }, "wrong_tool"],
  ["bad json", { calls: [{ ...call(), arguments: secret }] }, "invalid_json"],
  [
    "object args",
    { calls: [{ ...call(), arguments: { [secret]: secret } }] },
    "invalid_json",
  ],
  ["null args", { calls: [{ ...call(), arguments: null }] }, "invalid_json"],
  [
    "bad time",
    { calls: [call({ ...expected, time: "5 PM" })] },
    "invalid_schema",
  ],
  [
    "all null",
    { calls: [call({ ...expected, time: null })] },
    "invalid_schema",
  ],
  ["malformed calls", { calls: null }, "diagnostic_internal_error"],
])
  test(name, () => {
    const r = classify(selected);
    assert.equal(r.classification, category);
    assert.equal(r.exact, false);
    assert(!JSON.stringify(r).includes(secret));
  });
test("time/root/type taxonomy, no issue messages or received values", () => {
  for (const [value, taxonomy] of [
    [{ ...expected, time: "5 PM" }, "time_format"],
    [{ ...expected, time: null }, "root_edit_empty"],
    [{ ...expected, time: 42 }, "missing_or_wrong_type"],
  ]) {
    const r = classify({ calls: [call(value)] });
    assert(r.schemaIssues.some((i) => i.category === taxonomy));
    assert(!JSON.stringify(r).includes("5 PM"));
    assert(!JSON.stringify(r).includes("message"));
  }
});
test("1000/1001 JS character boundary; UTF-8 bytes do not define the cap", () => {
  const valid = JSON.stringify(expected);
  assert.equal(
    classify({ calls: [{ ...call(), arguments: valid.padEnd(1000) }] })
      .classification,
    "exact",
  );
  assert.equal(
    classify({ calls: [{ ...call(), arguments: valid.padEnd(1001) }] })
      .classification,
    "args_too_long",
  );
  const unicode = '"' + "é".repeat(998) + '"';
  const r = classify({ calls: [{ ...call(), arguments: unicode }] });
  assert.equal(r.argumentsChars, 1000);
  assert.equal(r.classification, "invalid_schema");
});
test("bounded count, tool names and lengths never contain arbitrary names", () => {
  const r = classify({
    calls: Array.from({ length: 30 }, () => ({
      name: secret,
      arguments: secret,
    })),
  });
  assert.equal(r.toolCallCount, 20);
  assert.equal(r.toolCallCountCapped, true);
  assert.deepEqual(r.toolNames, Array(5).fill("other"));
  const long = classify({
    calls: [{ ...call(), arguments: "x".repeat(1000001) }],
  });
  assert.equal(long.argumentsChars, 1000000);
  assert.equal(long.argumentsLengthCapped, true);
});
test("only five allowlisted schema issues and six path segments, malicious keys stripped", () => {
  const issues = Array.from({ length: 8 }, (_, i) => ({
    code: i ? "invalid_type" : secret,
    path: [secret, "time", "kind", secret, 0, "date", secret],
    message: secret,
    input: secret,
    received: secret,
  }));
  const error = new z.ZodError(issues);
  const r = classifySelection({ calls: [call()] }, expected, {
    ...deps,
    schema: {
      parse() {
        throw error;
      },
    },
  });
  assert.equal(r.schemaIssues.length, 5);
  assert.deepEqual(r.schemaIssues[0].path, [
    "other",
    "time",
    "kind",
    "other",
    "other",
    "date",
  ]);
  assert.equal(r.schemaIssues[0].code, "other");
  assert(!JSON.stringify(r).includes(secret));
  const strict = classify({ calls: [call({ ...expected, [secret]: secret })] });
  assert.equal(strict.classification, "invalid_schema");
  assert(!JSON.stringify(strict).includes(secret));
});
test("internal diagnostic and malformed error objects cannot leak or masquerade as schema failure", () => {
  for (const error of [
    new Error(secret),
    { issues: [{ code: "invalid_type", path: [secret] }], stack: secret },
    null,
  ]) {
    const r = classifySelection({ calls: [call()] }, expected, {
      ...deps,
      schema: {
        parse() {
          throw error;
        },
      },
    });
    assert.equal(r.classification, "diagnostic_internal_error");
    assert(!JSON.stringify(r).includes(secret));
  }
  const selected = {
    get calls() {
      throw new Error(secret);
    },
  };
  assert.equal(classify(selected).classification, "diagnostic_internal_error");
});
test("success exports only bounded typed intent, contradictory is not exact", () => {
  assert.equal(classify({ calls: [call()] }).classification, "exact");
  const r = classify({
    calls: [
      call({ ...expected, targetDate: { kind: "day_of_month", day: 29 } }),
    ],
  });
  assert.equal(r.classification, "contradictory");
  assert.equal(r.exact, false);
  assert.deepEqual(Object.keys(r.intent).sort(), Object.keys(expected).sort());
});
test("separate app catches distinguish known rejection from unexpected internal failure", async () => {
  const expectedReject = await checkApplication(
    async () => {
      throw new SyntaxError(secret);
    },
    "invalid_json",
    deps,
  );
  assert.equal(expectedReject.app_check, "expected_contract_rejection");
  for (const error of [new Error(secret), { message: secret }, null]) {
    const r = await checkApplication(
      async () => {
        throw error;
      },
      "invalid_json",
      deps,
    );
    assert.equal(r.app_check, "diagnostic_error");
    assert.equal(r.resolverInvoked, 0);
    assert(!JSON.stringify(r).includes(secret));
  }
  const r = await checkApplication(
    async (resolver) => {
      await resolver({
        ...expected,
        targetDate: { kind: "day_of_month", day: 29 },
      });
      throw new Error(secret);
    },
    "exact",
    deps,
  );
  assert.equal(r.app_check, "diagnostic_error");
  assert.equal(r.resolverInvoked, 1);
  assert.equal(r.unsafeResolverCalls, 1);
});
test("actual application completion / expected contract rejection / malformed non-string failure", async () => {
  for (const selected of [
    { calls: [] },
    { calls: [call(), call()] },
    { calls: [{ ...call(), arguments: "{" }] },
    { calls: [call({ ...expected, time: "5 PM" })] },
    { calls: [{ ...call(), arguments: null }] },
  ]) {
    const c = classify(selected);
    const r = await checkApplication(
      (resolver) =>
        answerSchedule(
          { message: "fixed offline phrase" },
          "America/Chicago",
          async () => selected,
          async (range) => ({ range, entries: [], complete: true }),
          new Date("2026-11-15T12:00:00Z"),
          resolver,
        ),
      c.classification,
      deps,
    );
    assert.equal(
      r.app_check,
      c.classification === "no_tool"
        ? "completed"
        : selected.calls[0]?.arguments === null
          ? "diagnostic_error"
          : "expected_contract_rejection",
    );
  }
});
test("fresh/absent/expired deterministic continuation fixtures do not alter classifier scoring", async () => {
  const intent = { ...expected, continuation: true };
  const selected = { calls: [call(intent)] };
  const now = new Date("2026-11-15T12:00:00Z");
  for (const mode of ["fresh", "absent", "expired"]) {
    const task = {
      version: 1,
      intent: { ...expected, date: { kind: "day_of_month", day: 29 } },
      expiresAt: now.getTime() + (mode === "expired" ? -1 : 60000),
    };
    const r = await checkApplication(
      (resolver) =>
        answerSchedule(
          { message: "At 5 PM.", ...(mode === "absent" ? {} : { task }) },
          "America/Chicago",
          async () => selected,
          async (range) => ({ range, entries: [], complete: true }),
          now,
          resolver,
        ),
      "exact",
      deps,
    );
    assert.equal(r.app_check, "completed");
    assert.equal(r.resolverInvoked, mode === "fresh" ? 1 : 0);
    assert.equal(r.unsafeResolverCalls, 0);
  }
});

test("schema error with malformed issues/getters is internal, never serialized", () => {
  const error = new Proxy(new z.ZodError([]), {
    get(target, key, receiver) {
      if (key === "issues") throw new Error(secret);
      return Reflect.get(target, key, receiver);
    },
  });
  const r = classifySelection({ calls: [call()] }, expected, {
    ...deps,
    schema: {
      parse() {
        throw error;
      },
    },
  });
  assert.equal(r.classification, "diagnostic_internal_error");
  assert(!JSON.stringify(r).includes(secret));
});
test("exceptions after resolver invocation cannot count as expected input rejection", async () => {
  const r = await checkApplication(
    async (resolver) => {
      await resolver(expected);
      throw new SyntaxError(secret);
    },
    "invalid_json",
    deps,
  );
  assert.equal(r.app_check, "diagnostic_error");
  assert.equal(r.resolverInvoked, 1);
  const many = await checkApplication(
    async (resolver) => {
      for (let i = 0; i < 30; i++)
        await resolver({
          ...expected,
          targetDate: { kind: "day_of_month", day: 29 },
        });
    },
    "contradictory",
    deps,
  );
  assert.equal(many.resolverInvoked, 20);
  assert.equal(many.unsafeResolverCalls, 20);
});
test("all failures stay in denominator; 47/50 and hidden app errors cannot pass", () => {
  const { summarize, acceptanceGate } = require("./evaluation-diagnostics.cjs");
  const rows = ["baseline", "candidate"].flatMap((arm) =>
    Array.from({ length: 50 }, (_, i) => ({
      arm,
      id: i < 20 ? "move-to" : "time",
      exact: arm === "candidate" || i < 30,
      app_check: "completed",
      classification: "exact",
      unsafeResolverCalls: 0,
    })),
  );
  assert(acceptanceGate(rows, false));
  const misses = rows.map((r, i) =>
    i >= 97
      ? {
          ...r,
          exact: false,
          classification: "invalid_schema",
          app_check: "expected_contract_rejection",
        }
      : r,
  );
  assert.equal(summarize(misses, "candidate").calls, 50);
  assert.equal(summarize(misses, "candidate").exact, 47);
  assert.equal(acceptanceGate(misses, false), false);
  rows[99].app_check = "diagnostic_error";
  assert.equal(acceptanceGate(rows, false), false);
  rows[99].app_check = "completed";
  rows[99].classification = "diagnostic_internal_error";
  assert.equal(acceptanceGate(rows, false), false);
  const partial = [
    { arm: "baseline", exact: false, error: "provider_failure" },
  ];
  assert.equal(summarize(partial, "baseline").appChecksSkipped, 1);
  assert.equal(summarize(partial, "baseline").calls, 1);
  assert.equal(acceptanceGate(partial, true), false);
});
const cp = require("node:child_process"),
  fs = require("node:fs"),
  os = require("node:os");
function cli(args = [], env = {}) {
  return cp.spawnSync(
    process.execPath,
    ["docs/chef-ai/diagnostics/evaluate-on-to.cjs", ...args],
    {
      encoding: "utf8",
      env: {
        ...process.env,
        CHEF_AI_OPENAI_API_KEY: "",
        CHEF_AI_MODEL: "",
        NODE_ENV: "test",
        ...env,
      },
      timeout: 20000,
    },
  );
}
test("dry-run frozen corpus/config: unchanged 50/50, Phase A interleaved 10+10, no raw phrases in report", () => {
  const a = cli();
  assert.equal(a.status, 0, a.stderr);
  const plan = JSON.parse(a.stdout);
  assert.equal(plan.maxCalls, 100);
  assert.equal(plan.callsPerArm, 50);
  assert.equal(plan.model, "gpt-4.1-mini");
  assert.equal(plan.corpus.length, 12);
  assert.match(plan.configHash, /^[a-f0-9]{64}$/);
  const b = cli(["--phase=time-diagnostic"], { CHEF_AI_MODEL: "gpt-5.4-mini" });
  assert.equal(b.status, 0, b.stderr);
  const p = JSON.parse(b.stdout);
  assert.equal(p.maxCalls, 20);
  assert.equal(p.gate, null);
  assert.deepEqual(p.corpus, [
    { id: "time", repetitions: 10 },
    { id: "time-fragment", repetitions: 10 },
  ]);
  assert.equal(p.candidateBaseline, "20b33b5ec200b2b6de4886438156631d9b397033");
  assert(!a.stdout.includes("Change its arrival"));
  assert(!b.stdout.includes("At 5 PM"));
  const malicious = cli([], { CHEF_AI_MODEL: secret });
  assert(!malicious.stdout.includes(secret));
  assert.equal(JSON.parse(malicious.stdout).model, "other");
});
test("mock-only CLI self-test preserves paired arm isolation and call budgets", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sous-chef-offline-"));
  try {
    for (const phase of ["ab", "time-diagnostic"]) {
      const output = path.join(dir, phase + ".json");
      const result = cli([
        "--self-test",
        "--phase=" + phase,
        "--out=" + output,
      ]);
      assert.equal(result.status, 0, result.stderr);
      const r = JSON.parse(fs.readFileSync(output));
      assert.equal(r.live, false);
      assert.equal(r.syntheticSelfTest, true);
      assert.equal(r.calls, phase === "ab" ? 100 : 20);
      assert.equal(r.totals.candidate.calls, phase === "ab" ? 50 : 20);
      assert.equal(r.totals.candidate.appCheckErrors, 0);
      assert.equal(r.totals.candidate.appChecksSkipped, 0);
      if (phase === "ab") {
        assert.equal(r.totals.baseline.exact, 30);
        assert.equal(r.totals.candidate.exact, 50);
        assert.deepEqual(r.mockRequests, { baseline: 50, candidate: 50 });
        assert.equal(r.gatePassed, true);
        assert.deepEqual(
          r.rows.slice(0, 4).map((r) => r.arm),
          ["baseline", "candidate", "candidate", "baseline"],
        );
      } else {
        assert.equal(r.gatePassed, null);
        assert.deepEqual(
          r.rows.map((r) => r.id),
          Array.from({ length: 20 }, (_, i) =>
            i % 2 ? "time-fragment" : "time",
          ),
        );
        assert.deepEqual(r.mockRequests, { baseline: 0, candidate: 20 });
      }
      for (const row of r.rows) {
        assert(row.app_check);
        assert.equal(row.unsafeResolverCalls, 0);
        assert(!("phrase" in row));
        assert(!("arguments" in row));
      }
    }
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
test("provider failure stops first call, preserves denominator and skipped app check, never exposes exception", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sous-chef-offline-"));
  try {
    const file = path.join(dir, "partial.json");
    const result = cli([
      "--self-test",
      "--self-test-provider-failure",
      "--out=" + file,
    ]);
    assert.equal(result.status, 1);
    const r = JSON.parse(fs.readFileSync(file));
    assert.equal(r.calls, 1);
    assert.equal(r.stopped, true);
    assert.equal(r.rows[0].error, "provider_failure");
    assert(!("app_check" in r.rows[0]));
    assert.equal(r.totals.baseline.appChecksSkipped, 1);
    assert.equal(r.gatePassed, false);
    assert(!JSON.stringify(r).includes("Synthetic private"));
    assert(!result.stderr.includes("Synthetic private"));
    assert(!result.stderr.includes(" at "));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
test("production self-test and repository output are refused before requests with static errors", () => {
  const prod = cli(
    ["--self-test", "--out=/tmp/must-not-exist-evaluation.json"],
    { NODE_ENV: "production" },
  );
  assert.equal(prod.status, 1);
  assert(!prod.stderr.includes(" at "));
  const inside = cli([
    "--self-test",
    "--out=" + path.resolve("docs/chef-ai/diagnostics/must-not-exist.json"),
  ]);
  assert.equal(inside.status, 1);
  assert(!fs.existsSync("docs/chef-ai/diagnostics/must-not-exist.json"));
});

test("known non-edit tool schema rejection remains separate from arbitrary diagnostic exceptions", async () => {
  const selected = { calls: [{ name: "assistant_read", arguments: "{}" }] };
  const r = await checkApplication(
    (resolver) =>
      answerSchedule(
        { message: "fixed offline phrase" },
        "America/Chicago",
        async () => selected,
        async (range) => ({ range, entries: [], complete: true }),
        new Date("2026-11-15T12:00:00Z"),
        resolver,
      ),
    "wrong_tool",
    deps,
  );
  assert.equal(r.app_check, "expected_contract_rejection");
  assert.equal(r.resolverInvoked, 0);
});

test("changing malicious getters cannot escape allowlists through a second read", () => {
  let reads = 0;
  const changing = {
    get name() {
      return reads++ === 0 ? "get_schedule" : secret;
    },
    arguments: "{}",
  };
  assert(!JSON.stringify(classify({ calls: [changing] })).includes(secret));
  let codeReads = 0,
    pathReads = 0;
  const issue = {
    get code() {
      return codeReads++ === 0 ? "invalid_type" : secret;
    },
    get path() {
      return pathReads++ === 0 ? ["time"] : [secret];
    },
    message: secret,
  };
  const error = new z.ZodError([issue]);
  const r = classifySelection({ calls: [call()] }, expected, {
    ...deps,
    schema: {
      parse() {
        throw error;
      },
    },
  });
  assert(!JSON.stringify(r).includes(secret));
});
