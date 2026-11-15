/* LOCAL DEBUGGER/TEST HELPER ONLY. Never imported by the application or networked.
 * Load manually in a loopback browser or non-production Node debugger; opt in.
 */
(function (root) {
  function createSousChefIntentTrace({
    enabled = false,
    aliases = {},
    correlationId,
  } = {}) {
    const browser = typeof window !== "undefined";
    if (
      !enabled ||
      (browser
        ? !["localhost", "127.0.0.1", "::1", "[::1]"].includes(
            window.location.hostname,
          )
        : process.env.NODE_ENV === "production")
    )
      throw new Error("Local non-production opt-in required");
    const key =
      correlationId ||
      (browser
        ? window.crypto.randomUUID()
        : require("node:crypto").randomUUID());
    if (!/^[0-9a-f-]{36}$/i.test(key))
      throw new Error("Use a generated correlation UUID");
    const rows = [],
      alias = (id) =>
        typeof id === "string" && id
          ? id === aliases.A
            ? "A"
            : id === aliases.B
              ? "B"
              : "other"
          : null;
    const integer = (x, min, max) =>
      Number.isInteger(x) && x >= min && x <= max;
    const date = (d) => {
      if (d === null || d === undefined) return null;
      if (d.kind === "day_of_month" && integer(d.day, 1, 31))
        return { kind: d.kind, day: d.day };
      if (
        d.kind === "iso" &&
        typeof d.value === "string" &&
        /^\d{4}-\d{2}-\d{2}$/.test(d.value)
      )
        return { kind: d.kind, value: d.value };
      if (d.kind === "relative_day" && integer(d.offset, -31, 31))
        return { kind: d.kind, offset: d.offset };
      if (
        d.kind === "month_day" &&
        integer(d.month, 1, 12) &&
        integer(d.day, 1, 31) &&
        (d.year === null || integer(d.year, 1900, 2200))
      )
        return { kind: d.kind, month: d.month, day: d.day, year: d.year };
      return "invalid";
    };
    const intent = (i) =>
      i && typeof i === "object"
        ? {
            target: ["context", "clarify", "date"].includes(i.target)
              ? i.target
              : "invalid",
            targetDate: date(i.targetDate),
            date: date(i.date),
            time:
              i.time === null
                ? null
                : typeof i.time === "string" &&
                    /^([01]\d|2[0-3]):[0-5]\d$/.test(i.time)
                  ? i.time
                  : "invalid",
            clarification: ["none", "target", "date", "time"].includes(
              i.clarification,
            )
              ? i.clarification
              : "invalid",
            continuation:
              typeof i.continuation === "boolean" ? i.continuation : null,
          }
        : null;
    const proposal = (p) =>
      p && typeof p === "object"
        ? {
            target: alias(p.eventId),
            ...(p.date !== undefined
              ? { date: date({ kind: "iso", value: p.date }) }
              : {}),
            ...(p.time !== undefined
              ? { time: intent({ time: p.time }).time }
              : {}),
          }
        : null;
    return {
      record(stage, value) {
        if (rows.length >= 60)
          throw new Error("Trace complete; start a new local run");
        let fields;
        if (["classifier", "merged"].includes(stage))
          fields = { intent: intent(value) };
        else if (stage === "response")
          fields = {
            task: intent(value?.editTask?.intent),
            choice: intent(value?.editClarification?.intent),
            proposal: proposal(value?.editProposal),
          };
        else if (["client-selection", "resolver"].includes(stage))
          fields = {
            intent: intent(value?.intent),
            selected: alias(value?.context?.selectedId),
          };
        else if (stage === "preview-request")
          fields = { proposal: proposal(value) };
        else if (stage === "preview-outcome")
          fields = {
            status: [200, 400, 401, 403, 404, 409, 422, 429, 503].includes(
              value?.status,
            )
              ? value.status
              : null,
            code: [
              "slot_unavailable",
              "event_ineligible",
              "timezone_mismatch",
              "availability_unconfigured",
              "experience_inactive",
              "invalid_local_time",
              "preview_unavailable",
            ].includes(value?.code)
              ? value.code
              : null,
          };
        else throw new Error("Unsupported boundary");
        rows.push({ step: rows.length + 1, stage, ...fields });
      },
      snapshot: () =>
        JSON.parse(
          JSON.stringify({ version: 1, correlationId: key, boundaries: rows }),
        ),
    };
  }
  if (typeof module !== "undefined")
    module.exports = { createSousChefIntentTrace };
  else root.createSousChefIntentTrace = createSousChefIntentTrace;
})(globalThis);
