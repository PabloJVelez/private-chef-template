// Prompt-only Phase B. Every mode is separately capped/approved; dry-run is default.
async function main() {
  const fs = require("node:fs"),
    path = require("node:path"),
    cp = require("node:child_process"),
    assert = require("node:assert/strict");
  if (process.env.NODE_ENV === "production")
    throw new Error("Non-production only");
  const {
    PROMPT_BASELINE,
    ROOT,
    app,
    req,
    hash,
    promptSources,
    loadProvider,
    requestHashes,
    validatePaidSnapshot,
  } = require("./provider-arms.cjs");
  const { cases, base } = require("./on-to-corpus.cjs");
  const {
    classifySelection,
    checkApplication,
    summarize,
    acceptanceGate,
  } = require("./evaluation-diagnostics.cjs");
  const value = (name) =>
    process.argv
      .find((a) => a.startsWith("--" + name + "="))
      ?.slice(name.length + 3);
  const mode = value("mode") || "prompt-ab";
  if (!["prompt-ab", "time-regression", "negative-controls"].includes(mode))
    throw new Error("Unknown mode");
  const paid = process.argv.includes("--run-paid"),
    selfTest = process.argv.includes("--self-test");
  if (paid && selfTest) throw new Error("Distinct modes");
  const fault = value("self-test-fault");
  if (fault && !selfTest) throw new Error("Offline faults only");
  if (fault && !["provider", "no_tool", "app", "invariant"].includes(fault))
    throw new Error("Unknown offline fault");
  if (selfTest) {
    const deny = () => {
      throw new Error("Offline network forbidden");
    };
    globalThis.fetch = deny;
    require("node:http").request = deny;
    require("node:https").request = deny;
  }
  const head = cp
    .execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" })
    .trim();
  const branch = cp
    .execFileSync("git", ["branch", "--show-current"], { encoding: "utf8" })
    .trim();
  const dirty = Boolean(
    cp
      .execFileSync("git", ["status", "--porcelain"], { encoding: "utf8" })
      .trim(),
  );
  const model = process.env.CHEF_AI_MODEL || "gpt-4.1-mini",
    zone = "America/Chicago",
    now = "2026-11-15T12:00:00.000Z";
  const controls = [
    [
      "greeting",
      ["Hello.", "Hi Chef!"],
      { name: "assistant_read", args: { kind: "greeting" } },
    ],
    [
      "help",
      ["What can you help me with?", "What can you do?"],
      { name: "assistant_read", args: { kind: "help" } },
    ],
    [
      "schedule",
      ["What is on tomorrow?", "Show tomorrow's schedule."],
      {
        name: "get_schedule",
        args: {
          period: "tomorrow",
          startDate: null,
          endDate: null,
          timeZone: zone,
        },
      },
    ],
    ["confirm", ["yes", "confirm"], null],
    [
      "unsupported",
      ["Send an email at 5 PM.", "Cancel the booking at 5 PM."],
      null,
    ],
    [
      "ambiguous",
      ["at 7", "At 7."],
      {
        name: "propose_pending_event_date_time_edit",
        args: {
          ...base,
          date: null,
          time: null,
          continuation: true,
          clarification: "time",
        },
      },
    ],
  ];
  const corpus =
    mode === "negative-controls"
      ? controls
      : mode === "time-regression"
        ? cases
            .filter((c) => ["time", "time-fragment"].includes(c[0]))
            .map((c) => [...c.slice(0, 3), 10])
        : cases;
  let trials =
    mode === "negative-controls"
      ? controls.flatMap(([id, phrases, expected]) =>
          phrases.map((phrase, repeat) => ({ id, phrase, expected, repeat })),
        )
      : corpus.flatMap(([id, phrase, expected, count]) =>
          Array.from({ length: count }, (_, repeat) => ({
            id,
            phrase,
            expected: {
              name: "propose_pending_event_date_time_edit",
              args: expected,
            },
            repeat,
          })),
        );
  if (mode === "time-regression")
    trials.sort(
      (a, b) =>
        a.repeat - b.repeat ||
        ["time", "time-fragment"].indexOf(a.id) -
          ["time", "time-fragment"].indexOf(b.id),
    );
  const cap = mode === "prompt-ab" ? 100 : mode === "time-regression" ? 20 : 12;
  assert.equal(trials.length, mode === "prompt-ab" ? 50 : cap);
  const sources = promptSources(dirty ? undefined : head),
    captures = {};
  for (const arm of ["baseline", "candidate"]) {
    const select = loadProvider(
      sources[arm],
      sources.tool,
      class {
        constructor(options) {
          this.chat = {
            completions: {
              create: async (payload) => {
                captures[arm] = { payload, options };
                return {
                  choices: [
                    { finish_reason: "stop", message: { tool_calls: [] } },
                  ],
                };
              },
            },
          };
        }
      },
    );
    await select(
      {
        message: "At 5 PM.",
        previousQuestions: ["PRIVATE_HISTORY"],
        page: { resource: { id: "PRIVATE_EVENT" } },
      },
      zone,
      new Date(now),
    );
  }
  const marker = "A standalone time clarification fragment";
  assert(!captures.baseline.payload.messages[0].content.includes(marker));
  assert(captures.candidate.payload.messages[0].content.includes(marker));
  assert.deepEqual(
    captures.baseline.payload.tools,
    captures.candidate.payload.tools,
  );
  assert(
    captures.candidate.payload.tools.every(
      (t) =>
        t.function.strict &&
        t.function.parameters.additionalProperties === false,
    ),
  );
  // Fail closed if another runtime dependency changed: this experiment is prompt-only.
  const runtimeChanged = cp
    .execFileSync(
      "git",
      [
        "diff",
        "--name-only",
        PROMPT_BASELINE,
        ...(dirty ? [] : ["HEAD"]),
        "--",
        "apps/medusa/src/lib/chef-ai",
      ],
      { encoding: "utf8" },
    )
    .trim()
    .split("\n")
    .filter((f) => f && !f.includes("/__tests__/"));
  assert(
    runtimeChanged.every(
      (f) => f === "apps/medusa/src/lib/chef-ai/provider.ts",
    ),
  );
  const arms = Object.fromEntries(
    ["baseline", "candidate"].map((arm) => [
      arm,
      {
        providerSha: arm === "baseline" ? PROMPT_BASELINE : head,
        ...requestHashes(
          sources[arm],
          captures[arm].payload,
          captures[arm].options,
        ),
      },
    ]),
  );
  assert.equal(arms.baseline.configHash, arms.candidate.configHash);
  assert.equal(arms.baseline.toolHash, arms.candidate.toolHash);
  assert.notEqual(arms.baseline.promptHash, arms.candidate.promptHash);
  const plan = {
    version: 1,
    mode,
    harnessHead: head,
    candidateSha: head,
    workingTree: dirty,
    branch,
    model: ["gpt-4.1-mini", "gpt-5.4-mini"].includes(model) ? model : "other",
    modelOverridePresent: Boolean(process.env.CHEF_AI_MODEL),
    zone,
    now,
    arms,
    commonToolSha: PROMPT_BASELINE,
    commonToolSourceHash: hash(sources.tool),
    corpusHash: hash(corpus),
    maxCalls: cap,
    timeoutMs: 15000,
    maxCompletionTokens: 400,
    retries: 0,
    toolChoice: "auto",
    order:
      mode === "prompt-ab"
        ? "paired alternating first arm"
        : mode === "time-regression"
          ? "interleaved independent time/time-fragment"
          : "frozen controls",
    gate:
      mode === "prompt-ab"
        ? {
            criticalExact: 20,
            overallExact: 48,
            unsafeResolverCalls: 0,
            appCheckErrors: 0,
          }
        : { exact: cap, unsafeResolverCalls: 0, appCheckErrors: 0 },
    corpus:
      mode === "negative-controls"
        ? controls.map(([id, phrases]) => ({ id, repetitions: phrases.length }))
        : corpus.map(([id, , , repetitions]) => ({ id, repetitions })),
  };
  plan.configHash = hash(plan);
  function outside(file) {
    if (!file || !path.isAbsolute(file))
      throw new Error("Absolute outside output required");
    const parent = fs.realpathSync(path.dirname(file)),
      root = fs.realpathSync(ROOT);
    if (
      parent === root ||
      parent.startsWith(root + path.sep) ||
      path.resolve(file).startsWith(ROOT + path.sep)
    )
      throw new Error("Outside output required");
    return file;
  }
  if (!paid && !selfTest) {
    if (value("freeze"))
      fs.writeFileSync(
        outside(value("freeze")),
        JSON.stringify(plan, null, 2) + "\n",
      );
    console.log(JSON.stringify(plan, null, 2));
    return;
  }
  if (paid) {
    validatePaidSnapshot(
      {
        head,
        branch,
        dirty,
        candidateSha: value("candidate-sha"),
        model,
        cap,
        maxCalls: value("max-calls"),
        plan,
      },
      JSON.parse(fs.readFileSync(outside(value("plan")), "utf8")),
    );
    assert(process.env.CHEF_AI_OPENAI_API_KEY);
  }
  const output = outside(value("out"));
  const { editIntentSchema } = req(
    path.join(app, "src/lib/chef-ai/edit-intent.ts"),
  );
  const { assistantReadSchema } = req(
    path.join(app, "src/lib/chef-ai/assistant-read.ts"),
  );
  const { scheduleArgs } = req(path.join(app, "src/lib/chef-ai/schedule.ts"));
  const { answerSchedule } = req(path.join(app, "src/lib/chef-ai/chat.ts"));
  const { clarifyEditMeaning } = req(
    path.join(app, "src/lib/chef-ai/edit-semantics.ts"),
  );
  const { z } = req("@medusajs/framework/zod");
  const deps = {
    schema: editIntentSchema,
    clarify: clarifyEditMeaning,
    isSchemaError: (e) => e instanceof z.ZodError,
  };
  const rows = [],
    requests = { baseline: 0, candidate: 0 };
  let stopped = false,
    calls = 0,
    currentTrial;
  class DiagnosticInvariant extends Error {}
  const providers = {};
  for (const arm of ["baseline", "candidate"]) {
    providers[arm] = loadProvider(
      sources[arm],
      sources.tool,
      class {
        constructor(options) {
          this.chat = {
            completions: {
              create: async (payload) => {
                // The closed-over loader identity identifies the arm, never tool-description presence.
                try {
                  if (fault === "invariant") throw new Error();
                  assert.equal(
                    payload.messages[0].content,
                    captures[arm].payload.messages[0].content,
                  );
                  assert.deepEqual(payload.tools, captures[arm].payload.tools);
                  assert.deepEqual(payload.messages.slice(1), [
                    { role: "user", content: currentTrial.phrase },
                  ]);
                  assert.deepEqual(
                    requestHashes(sources[arm], payload, options),
                    requestHashes(
                      sources[arm],
                      captures[arm].payload,
                      captures[arm].options,
                    ),
                  );
                  assert.equal(options.maxRetries, 0);
                  assert.equal(options.timeout, 15000);
                  assert.equal(payload.tool_choice, "auto");
                  assert.equal(payload.max_completion_tokens, 400);
                } catch {
                  throw new DiagnosticInvariant();
                }
                requests[arm]++;
                if (!selfTest) {
                  const OpenAI = req("openai");
                  return new OpenAI(options).chat.completions.create(payload);
                }
                if (fault === "provider")
                  throw new Error("Synthetic private failure");
                let expected = currentTrial.expected;
                if (
                  fault === "no_tool" ||
                  (mode === "prompt-ab" &&
                    arm === "baseline" &&
                    currentTrial.id === "time-fragment")
                )
                  expected = null;
                return {
                  choices: [
                    {
                      finish_reason: expected ? "tool_calls" : "stop",
                      message: {
                        tool_calls: expected
                          ? [
                              {
                                type: "function",
                                function: {
                                  name: expected.name,
                                  arguments: JSON.stringify(expected.args),
                                },
                              },
                            ]
                          : [],
                      },
                    },
                  ],
                };
              },
            },
          };
        }
      },
    );
  }
  function classify(selected, trial) {
    const original = classifySelection(selected, trial.expected?.args, deps);
    if (mode !== "negative-controls") return original;
    if (!trial.expected)
      return { ...original, exact: original.classification === "no_tool" };
    if (trial.expected.name === "propose_pending_event_date_time_edit")
      return original;
    if (
      selected.calls?.length !== 1 ||
      selected.calls[0].name !== trial.expected.name
    )
      return { ...original, exact: false };
    const parsed = classifySelection(
      {
        calls: [
          {
            ...selected.calls[0],
            name: "propose_pending_event_date_time_edit",
          },
        ],
      },
      trial.expected.args,
      {
        ...deps,
        schema:
          trial.expected.name === "assistant_read"
            ? assistantReadSchema
            : scheduleArgs,
        clarify: () => false,
      },
    );
    return { ...parsed, toolNames: original.toolNames, intent: null };
  }
  function save() {
    const totals = Object.fromEntries(
      (mode === "prompt-ab" ? ["baseline", "candidate"] : ["candidate"]).map(
        (arm) => [arm, summarize(rows, arm)],
      ),
    );
    const safe = rows.every(
      (r) =>
        r.app_check &&
        r.app_check !== "diagnostic_error" &&
        r.classification !== "diagnostic_internal_error" &&
        !r.unsafeResolverCalls,
    );
    fs.writeFileSync(
      output,
      JSON.stringify(
        {
          plan,
          live: paid,
          syntheticSelfTest: selfTest,
          calls,
          stopped,
          requests,
          totals,
          gatePassed:
            mode === "prompt-ab"
              ? acceptanceGate(rows, stopped)
              : !stopped &&
                calls === cap &&
                rows.length === cap &&
                rows.every((r) => r.exact) &&
                safe,
          rows,
        },
        null,
        2,
      ) + "\n",
    );
  }
  try {
    for (let i = 0; i < trials.length; i++)
      for (const arm of mode === "prompt-ab"
        ? i % 2
          ? ["candidate", "baseline"]
          : ["baseline", "candidate"]
        : ["candidate"]) {
        assert(calls < cap);
        calls++;
        currentTrial = trials[i];
        let selected;
        try {
          selected = await providers[arm](
            { message: currentTrial.phrase },
            zone,
            new Date(now),
          );
        } catch (error) {
          rows.push({
            arm,
            id: currentTrial.id,
            repeat: currentTrial.repeat,
            exact: false,
            ...(error instanceof DiagnosticInvariant
              ? {
                  classification: "diagnostic_internal_error",
                  app_check: "diagnostic_error",
                  resolverInvoked: 0,
                  unsafeResolverCalls: 0,
                }
              : { error: "provider_failure" }),
          });
          stopped = true;
          save();
          process.exitCode = 1;
          return;
        }
        const diagnostic = classify(selected, currentTrial);
        const safety = await checkApplication(
          (resolver) => {
            if (fault === "app") throw new Error("Synthetic private app error");
            return answerSchedule(
              { message: currentTrial.phrase },
              zone,
              async () => selected,
              async (range) => ({ range, entries: [], complete: true }),
              new Date(now),
              resolver,
            );
          },
          diagnostic.classification,
          {
            ...deps,
            clarify: mode === "negative-controls" ? () => true : deps.clarify,
          },
        );
        rows.push({
          arm,
          id: currentTrial.id,
          repeat: currentTrial.repeat,
          ...diagnostic,
          ...safety,
        });
        save();
      }
    assert.equal(requests.candidate, mode === "prompt-ab" ? 50 : cap);
    assert.equal(requests.baseline, mode === "prompt-ab" ? 50 : 0);
    console.log(
      "Completed fixed block; synthetic self-tests are not live accuracy evidence.",
    );
  } catch {
    stopped = true;
    save();
    throw new Error("Bounded evaluation stopped");
  }
}
main().catch(() => {
  console.error(
    "Evaluation setup/diagnostic failed. No raw errors exported; do not retry automatically.",
  );
  process.exitCode = 1;
});
