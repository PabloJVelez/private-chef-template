// Local evaluation only. Closed metadata projection; never export caught errors or raw arguments.
const { isDeepStrictEqual } = require("node:util");
const { createSousChefIntentTrace } = require("./intent-trace.cjs");
const tools = new Set([
  "get_schedule",
  "propose_pending_event_date_time_edit",
  "assistant_read",
]);
const paths = new Set([
  "target",
  "targetDate",
  "date",
  "time",
  "clarification",
  "continuation",
  "kind",
  "value",
  "day",
  "month",
  "year",
  "offset",
]);
const codes = new Set([
  "invalid_type",
  "invalid_literal",
  "unrecognized_keys",
  "invalid_union",
  "invalid_union_discriminator",
  "invalid_enum_value",
  "invalid_arguments",
  "invalid_return_type",
  "invalid_date",
  "invalid_string",
  "too_small",
  "too_big",
  "invalid_intersection_types",
  "not_multiple_of",
  "not_finite",
  "custom",
  "invalid_format",
  "invalid_value",
]);
function schemaIssues(error) {
  const issues = error.issues;
  if (!Array.isArray(issues)) throw new Error("Malformed schema diagnostic");
  return issues.slice(0, 5).map((issue) => {
    const rawCode = issue.code,
      rawPath = issue.path;
    const code = codes.has(rawCode) ? rawCode : "other";
    const path = Array.isArray(rawPath)
      ? rawPath.slice(0, 6).map((p) => (paths.has(p) ? p : "other"))
      : ["other"];
    const category =
      path.length === 1 &&
      path[0] === "time" &&
      ["invalid_string", "invalid_format"].includes(code)
        ? "time_format"
        : path.length === 0 && code === "custom"
          ? "root_edit_empty"
          : code === "invalid_type"
            ? "missing_or_wrong_type"
            : "other_schema";
    return { code, path, category };
  });
}
function classifySelection(selected, expected, deps) {
  let metadata = {
    toolCallCount: null,
    toolCallCountCapped: false,
    toolNames: [],
    argumentsChars: null,
    argumentsLengthCapped: false,
  };
  const result = (classification, extra = {}) => ({
    ...metadata,
    classification,
    exact: classification === "exact",
    contradictory: classification === "contradictory",
    intent: null,
    ...extra,
  });
  try {
    if (!Array.isArray(selected?.calls))
      return result("diagnostic_internal_error");
    const calls = selected.calls;
    metadata = {
      ...metadata,
      toolCallCount: Math.min(calls.length, 20),
      toolCallCountCapped: calls.length > 20,
      toolNames: calls.slice(0, 5).map((c) => {
        const name = c?.name;
        return tools.has(name) ? name : "other";
      }),
    };
    if (!calls.length) return result("no_tool");
    if (calls.length > 1) return result("multiple_tools");
    const args = calls[0]?.arguments;
    if (typeof args === "string")
      metadata = {
        ...metadata,
        argumentsChars: Math.min(args.length, 1000000),
        argumentsLengthCapped: args.length > 1000000,
      };
    if (calls[0]?.name !== "propose_pending_event_date_time_edit")
      return result("wrong_tool");
    if (typeof args !== "string") return result("invalid_json");
    // JS UTF-16 character length, matching the existing app's >1000 limit. NOT bytes.
    if (args.length > 1000) return result("args_too_long");
    let decoded;
    try {
      decoded = JSON.parse(args);
    } catch (error) {
      return result(
        error instanceof SyntaxError
          ? "invalid_json"
          : "diagnostic_internal_error",
      );
    }
    let intent;
    try {
      intent = deps.schema.parse(decoded);
    } catch (error) {
      return deps.isSchemaError(error)
        ? result("invalid_schema", { schemaIssues: schemaIssues(error) })
        : result("diagnostic_internal_error");
    }
    const classification = deps.clarify(intent)
      ? "contradictory"
      : isDeepStrictEqual(intent, expected)
        ? "exact"
        : "safe_but_not_exact";
    const trace = createSousChefIntentTrace({ enabled: true });
    trace.record("classifier", intent);
    return result(classification, {
      intent: trace.snapshot().boundaries[0].intent,
    });
  } catch {
    return result("diagnostic_internal_error");
  }
}
function expectedRejection(error, classification, deps) {
  if (classification === "invalid_json") return error instanceof SyntaxError;
  if (classification === "invalid_schema" || classification === "wrong_tool") {
    if (deps.isSchemaError(error)) return true;
  }
  // Match only the application's fixed contract rejection, never arbitrary exception prose.
  return (
    ["multiple_tools", "wrong_tool", "args_too_long"].includes(
      classification,
    ) &&
    error instanceof Error &&
    error.message === "Invalid model tool call"
  );
}
async function checkApplication(run, classification, deps) {
  let resolverInvoked = 0,
    unsafeResolverCalls = 0;
  try {
    await run(async (effective) => {
      resolverInvoked = Math.min(resolverInvoked + 1, 20);
      if (deps.clarify(effective))
        unsafeResolverCalls = Math.min(unsafeResolverCalls + 1, 20);
      return { entries: [], message: "Synthetic resolver only" };
    });
    return { app_check: "completed", resolverInvoked, unsafeResolverCalls };
  } catch (error) {
    let expected = false;
    try {
      expected =
        resolverInvoked === 0 && expectedRejection(error, classification, deps);
    } catch {}
    return {
      app_check: expected ? "expected_contract_rejection" : "diagnostic_error",
      resolverInvoked,
      unsafeResolverCalls,
    };
  }
}
function summarize(rows, arm) {
  const r = rows.filter((row) => row.arm === arm);
  return {
    calls: r.length,
    exact: r.filter((r) => r.exact).length,
    criticalExact: r.filter(
      (r) => ["move-to", "change-to"].includes(r.id) && r.exact,
    ).length,
    contradictions: r.filter((r) => r.contradictory).length,
    unsafeResolverCalls: r.reduce(
      (n, r) => n + (r.unsafeResolverCalls || 0),
      0,
    ),
    appCheckErrors: r.filter((r) => r.app_check === "diagnostic_error").length,
    appChecksSkipped: r.filter((r) => !r.app_check).length,
    diagnosticErrors: r.filter(
      (r) => r.classification === "diagnostic_internal_error",
    ).length,
  };
}
function acceptanceGate(rows, stopped) {
  const c = summarize(rows, "candidate");
  return (
    !stopped &&
    rows.length === 100 &&
    c.calls === 50 &&
    c.exact >= 48 &&
    c.criticalExact === 20 &&
    rows.every(
      (r) =>
        r.app_check &&
        r.app_check !== "diagnostic_error" &&
        r.classification !== "diagnostic_internal_error" &&
        !r.unsafeResolverCalls,
    )
  );
}
module.exports = {
  classifySelection,
  checkApplication,
  summarize,
  acceptanceGate,
};
