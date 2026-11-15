/* One-off synthetic classifier A/B evaluation. Dry-run by default. No Admin/DB/write routes.
 * Paid mode requires an existing approved local key and explicit --run-paid --max-calls=100.
 * Baseline vs candidate differ ONLY in editIntentTool field descriptions.
 */
const fs = require("node:fs"),
  path = require("node:path"),
  cp = require("node:child_process");
const { createRequire, Module } = require("node:module");
const root = cp
  .execFileSync("git", ["rev-parse", "--show-toplevel"], { encoding: "utf8" })
  .trim();
const app = path.join(root, "apps/medusa"),
  req = createRequire(path.join(app, "package.json"));
const baseline = "13410980bc70eccfed494fc49acb3d94794987c3";
const head = cp
  .execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" })
  .trim();
const zone = "America/Chicago",
  now = "2026-11-15T12:00:00.000Z";
const day = (day) => ({ kind: "day_of_month", day }),
  iso = (value) => ({ kind: "iso", value });
const base = {
  target: "context",
  targetDate: null,
  date: day(29),
  time: null,
  clarification: "none",
  continuation: false,
};
const cases = [
  ["move-to", "Can you move it to the 29th?", base, 10],
  ["change-to", "Can you change the date to the 29th?", base, 10],
  [
    "on-to",
    "Move the event on the 30th to the 29th.",
    { ...base, target: "date", targetDate: day(30) },
    3,
  ],
  [
    "on-time",
    "Change the time of the event on the 29th to 2 PM.",
    { ...base, target: "date", targetDate: day(29), date: null, time: "14:00" },
    3,
  ],
  [
    "tomorrow",
    "Move it to tomorrow.",
    { ...base, date: { kind: "relative_day", offset: 1 } },
    3,
  ],
  [
    "explicit",
    "Move the event on November 30 2026 to December 1 2026.",
    {
      ...base,
      target: "date",
      targetDate: iso("2026-11-30"),
      date: iso("2026-12-01"),
    },
    3,
  ],
  [
    "time",
    "Change its arrival time to 5 PM.",
    { ...base, date: null, time: "17:00" },
    3,
  ],
  [
    "target-fragment",
    "This is for the event on the 30th.",
    {
      ...base,
      target: "date",
      targetDate: day(30),
      date: null,
      continuation: true,
    },
    3,
  ],
  [
    "time-fragment",
    "At 5 PM.",
    { ...base, date: null, time: "17:00", continuation: true },
    3,
  ],
  [
    "month",
    "Move it to December 1.",
    { ...base, date: { kind: "month_day", month: 12, day: 1, year: null } },
    3,
  ],
  [
    "month-time",
    "Change the event on November 30 to 2 PM.",
    {
      ...base,
      target: "date",
      targetDate: { kind: "month_day", month: 11, day: 30, year: null },
      date: null,
      time: "14:00",
    },
    3,
  ],
  ["date-time", "Move it to the 29th at 2 PM.", { ...base, time: "14:00" }, 3],
];
const trials = cases.flatMap(([id, phrase, expected, count]) =>
  Array.from({ length: count }, (_, repeat) => ({
    id,
    repeat,
    phrase,
    expected,
  })),
);
if (trials.length !== 50)
  throw new Error("Preregistered 50-trial plan changed");
const plan = {
  baseline,
  head,
  model: process.env.CHEF_AI_MODEL || "gpt-4.1-mini",
  zone,
  now,
  callsPerArm: 50,
  maxCalls: 100,
  maxCompletionTokensPerCall: 400,
  retries: 0,
  order: "paired; alternate first arm by trial index",
  gate: { criticalExact: 20, overallExact: 48, unsafeResolverCalls: 0 },
  cases,
};
const paid = process.argv.includes("--run-paid");
const selfTest = process.argv.includes("--self-test");
if (paid && selfTest)
  throw new Error("Choose paid mode or synthetic self-test, never both");
if (!paid && !selfTest) {
  console.log(
    JSON.stringify(
      {
        ...plan,
        paid: false,
        note: "Dry run: no provider calls. Freeze this plan before running either arm.",
      },
      null,
      2,
    ),
  );
  process.exit(0);
}
if (
  paid &&
  (!process.argv.includes("--max-calls=100") ||
    !process.env.CHEF_AI_OPENAI_API_KEY)
)
  throw new Error(
    "Explicit 100-call budget and already approved local application key required",
  );
if (
  paid &&
  cp.execFileSync("git", ["status", "--porcelain"], { encoding: "utf8" }).trim()
)
  throw new Error("Use a clean exact candidate commit for paired evaluation");
// Refuse credentials in output: only the fixed synthetic corpus and allowlisted typed fields are saved.
req("ts-node").register({
  project: path.join(app, "tsconfig.json"),
  transpileOnly: true,
});
const editFile = path.join(app, "src/lib/chef-ai/edit-intent.ts");
const edit = req(editFile),
  candidate = edit.editIntentTool;
const ts = req("typescript");
const source = cp.execFileSync(
  "git",
  ["show", baseline + ":apps/medusa/src/lib/chef-ai/edit-intent.ts"],
  { encoding: "utf8" },
);
const prior = new Module(editFile + ".baseline.cjs", module);
prior.filename = editFile + ".baseline.cjs";
prior.paths = Module._nodeModulePaths(path.dirname(editFile));
prior._compile(
  ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
    },
  }).outputText,
  prior.filename,
);
// Self-test never constructs the actual network client; it exercises baseline loading,
// paired request budgets, strict parsing/guard and report scoring with controlled outputs.
const originalLoad = Module._load;
if (selfTest)
  Module._load = function (name, ...rest) {
    if (name === "openai")
      return class {
        chat = {
          completions: {
            create: async (payload) => {
              const item = cases.find(
                (c) => c[1] === payload.messages.at(-1).content,
              );
              if (!item) throw new Error("Unexpected synthetic phrase");
              const isCandidate = Boolean(
                payload.tools[1].function.parameters.properties.targetDate
                  .description,
              );
              const intent =
                !isCandidate && ["move-to", "change-to"].includes(item[0])
                  ? { ...item[2], date: null, targetDate: day(29) }
                  : item[2];
              return {
                choices: [
                  {
                    finish_reason: "tool_calls",
                    message: {
                      tool_calls: [
                        {
                          type: "function",
                          function: {
                            name: "propose_pending_event_date_time_edit",
                            arguments: JSON.stringify(intent),
                          },
                        },
                      ],
                    },
                  },
                ],
              };
            },
          },
        };
      };
    return originalLoad.call(this, name, ...rest);
  };
const providerFile = path.join(app, "src/lib/chef-ai/provider.ts");
const providers = {};
try {
  for (const [arm, tool] of [
    ["baseline", prior.exports.editIntentTool],
    ["candidate", candidate],
  ]) {
    // SWC exports are read-only getters: isolate each provider import's tool module.
    // Restore the cache before importing application validation below.
    require.cache[editFile].exports = { ...edit, editIntentTool: tool };
    delete require.cache[providerFile];
    providers[arm] = req(providerFile).selectSchedule;
  }
} finally {
  require.cache[editFile].exports = edit;
  Module._load = originalLoad;
}
const { answerSchedule } = req(path.join(app, "src/lib/chef-ai/chat.ts"));
const { clarifyEditMeaning } = req(
  path.join(app, "src/lib/chef-ai/edit-semantics.ts"),
);
const { createSousChefIntentTrace } = require("./intent-trace.cjs");
const output = process.argv.find((a) => a.startsWith("--out="))?.slice(6);
if (!output || !path.isAbsolute(output))
  throw new Error(
    "Supply --out=/absolute/local/report.json (outside the repository)",
  );
if (path.resolve(output).startsWith(root + path.sep))
  throw new Error("Keep diagnostic output outside the repository");
const rows = [];
let calls = 0,
  stopped = false;
function exact(a, b) {
  return require("node:util").isDeepStrictEqual(a, b);
}
function save() {
  const totals = Object.fromEntries(
    ["baseline", "candidate"].map((arm) => {
      const r = rows.filter((r) => r.arm === arm);
      return [
        arm,
        {
          calls: r.length,
          exact: r.filter((r) => r.exact).length,
          criticalExact: r.filter(
            (r) => ["move-to", "change-to"].includes(r.id) && r.exact,
          ).length,
          contradictions: r.filter((r) => r.contradictory).length,
          unsafeResolverCalls: r.reduce((n, r) => n + r.unsafeResolverCalls, 0),
        },
      ];
    }),
  );
  const c = totals.candidate;
  fs.writeFileSync(
    output,
    JSON.stringify(
      {
        plan,
        live: !selfTest,
        syntheticSelfTest: selfTest,
        calls,
        stopped,
        totals,
        gatePassed:
          !stopped &&
          c.calls === 50 &&
          c.exact >= 48 &&
          c.criticalExact === 20 &&
          c.unsafeResolverCalls === 0,
        rows,
      },
      null,
      2,
    ) + "\n",
  );
}
(async () => {
  try {
    for (let i = 0; i < trials.length; i++)
      for (const arm of i % 2
        ? ["candidate", "baseline"]
        : ["baseline", "candidate"]) {
        const trial = trials[i];

        if (calls >= 100) throw new Error("Budget reached");
        calls++;
        let selected;
        try {
          selected = await providers[arm](
            { message: trial.phrase },
            zone,
            new Date(now),
          );
        } catch {
          rows.push({
            arm,
            id: trial.id,
            repeat: trial.repeat,
            exact: false,
            error: "provider_failure",
            unsafeResolverCalls: 0,
          });
          stopped = true;
          save();
          return;
        }
        let intent,
          classification = "invalid_contract";
        try {
          if (
            selected.calls.length !== 1 ||
            selected.calls[0].name !== "propose_pending_event_date_time_edit" ||
            selected.calls[0].arguments.length > 1000
          )
            throw new Error();
          intent = edit.editIntentSchema.parse(
            JSON.parse(selected.calls[0].arguments),
          );
          classification = clarifyEditMeaning(intent)
            ? "contradictory"
            : exact(intent, trial.expected)
              ? "exact"
              : "safe_but_not_exact";
        } catch {}
        let unsafeResolverCalls = 0;
        try {
          await answerSchedule(
            { message: trial.phrase },
            zone,
            async () => selected,
            async (range) => ({ range, entries: [], complete: true }),
            new Date(now),
            async (effective) => {
              if (clarifyEditMeaning(effective)) unsafeResolverCalls++;
              return { entries: [], message: "Synthetic resolver only" };
            },
          );
        } catch {}
        const trace = createSousChefIntentTrace({ enabled: true });
        if (intent) trace.record("classifier", intent);
        rows.push({
          arm,
          id: trial.id,
          repeat: trial.repeat,
          classification,
          exact: classification === "exact",
          contradictory: classification === "contradictory",
          unsafeResolverCalls,
          intent: trace.snapshot().boundaries[0]?.intent || null,
        });
        save();
      }
  } finally {
    require.cache[editFile].exports = edit;
  }
  console.log(
    "Evaluation finished. Read the local report; clarification is safe but is not correct extraction.",
  );
})().catch(() => {
  stopped = true;
  save();
  console.error(
    "Evaluation stopped; inspect the bounded local report. No retries performed.",
  );
  process.exitCode = 1;
});
