# Owner live-test follow-up: repeated schedule window

Starting head: `12bd03f6fdc820ac93ceafa4a016d2cd9ab0cb0d` (clean local and remote feature branch).
The supplied owner/Cursor report for November 12, 2026, America/Chicago is the live evidence:
three successful HTTP responses in approximately 1.08–1.38 seconds, but week → weekend →
November 16 all displayed the first week's window and four pending weekday requests.
[Owner evidence reference](https://arborthreads.com/threads/thr_a4864934-79cc-460d-8730-e31e050125fa#c-con_f9c9777a8ce459b8d2cc342be42f2e1d5f96112bba332d851338e34ac5eefec7).
The report was supplied in this session; the private Arbor comment was not independently fetched.

## Confirmed defect and limits of diagnosis

`ChefChat.send()` posted the latest `message` plus the previous four questions.
`selectSchedule()` converted those earlier questions into additional consecutive **user**
messages, without assistant responses or completed tool turns. The system instruction also
encouraged treating them as follow-up context. This supplies several unanswered window
requests for a tool that must choose exactly one. The new SDK-boundary test fails against
the old implementation on the second request: both the week and weekend questions appear
in the outgoing user-message array. Negative tests likewise expose unnecessary private
history in the provider request.

This is a confirmed context-isolation defect and a plausible cause of the observed anchoring.
**The exact live tool calls/arguments were not captured in the supplied report**, so we cannot
prove that the model selected `this_week` (rather than an explicit equivalent date range),
or claim that the live regression is resolved before an owner repeat test. A repeated older
card in the visible transcript also cannot be ruled out from the narrative alone. The new
response diagnostics let the owner distinguish selection from display on the next run.

Code trace and tests narrow the failure boundary:

- The client issues a new POST for each current draft; it does not cache a response or range.
  Each resolved answer is attached to its own question. The actual React dialog test submits
  all three questions, asserts exact request payloads and retains distinct answers in memory.
- `answerSchedule()` has request-local variables and executes one new calendar read for a
  validated call. No previous window is stored in the server/provider.
- `resolveScheduleRange()` already produces three different correct windows for `this_week`,
  `this_weekend` and the November 16 date pair. It and `readCalendar` are unchanged.
- `tool_choice: auto`, `parallel_tool_calls: false`, strict schema and finish-reason handling
  are retained. Strict schema validates the call's shape; it cannot establish that the model
  picked the date requested in natural language. Forcing a tool call would weaken refusal.
- The original browser transport mock always selected using `messages.at(-1)`, so it concealed
  the extra historical user turns. The new regression asserts the entire real SDK request.

Official API contract consulted: [Chat Completions create](https://developers.openai.com/api/reference/resources/chat/subresources/completions/methods/create)
(`messages` is the conversation so far, not a bag of prior independent queries).

## Small fix

The new UI sends only `{ message }`. The provider sends one system message and exactly one
user message, and explicitly treats that question's date/year as authoritative. Older Admin
builds remain compatible: `previousQuestions` is still accepted within the existing size caps
but is **never forwarded**. The visible conversation and its refresh/logout lifecycle remain.
Self-contained questions such as “and next week?” retain their date context; references like
“that same day” require the chef to name the date again. The dialog explains this requirement.

Successful and incomplete calendar responses add a validated `period` enum. Existing `range`
and `timeZone` show the effective dates. No raw arguments, model prose, prompts, customer
records, keys, exception bodies, new debug logs or durable diagnostics are introduced. Invalid
calls still return the existing clarification/error behavior. There is no quota-error expansion.
Auth, read-only allowlist, original reader, timezone math, 12 KB/1,000-character caps, history
compatibility caps, rate/concurrency/output limits and no-write boundary are unchanged.

## Regression evidence

The new sequential test runs the real provider adapter, tool validation, date resolver and
answer renderer with a mocked OpenAI SDK response and synthetic calendar records matching
the report's shape. It checks all outgoing message arrays and these results at fixed local
November 12:

| Question | Validated period | Exclusive UTC range (CST = UTC−6) | Synthetic result |
| --- | --- | --- | --- |
| This week | `this_week` | Nov 9 06:00Z → Nov 16 06:00Z | 4 pending requests |
| This weekend | `this_weekend` | Nov 14 06:00Z → Nov 16 06:00Z | Complete empty read, no availability inference |
| November 16, 2026 | `dates` | Nov 16 06:00Z → Nov 17 06:00Z | Confirmed 16:00–18:30 CST appointment and protected interval |

These are **mock selections**, not measured model understanding. Negative cases verify that
write requests and unresolved references do not inherit old read questions, returned model
prose is never displayed, private-history sentinels never reach the SDK, and no calendar read
runs when there is no tool call. Existing denial, bounds, DST, failure, auth and privacy tests
also run. The component test verifies latest-only payloads and all three retained answers.

No model key was available in this process environment; standard local `.env`/`.env.test`
files were absent. No secret values were read/displayed, no secrets were requested or changed,
and no live model call/spend was attempted. No database, customer data, production service,
merge or deployment was changed. The original real-DB reader tests were not rerun because
the reader is unchanged; this follow-up uses synthetic test records only.

Validation commands (Node 26.13.1, repository Yarn 4.5.0):

```sh
corepack yarn workspace medusa test:unit --runTestsByPath src/lib/chef-ai/__tests__/provider.unit.spec.ts
# BEFORE fix: three new isolation/privacy cases fail (expected); three old cases pass.
corepack yarn workspace medusa test:unit
corepack yarn workspace medusa typecheck
corepack yarn workspace storefront typecheck
corepack yarn workspace medusa build
git diff --check
```

Results: **30 suites / 266 tests pass**, both typechecks pass, production backend/Admin
build passes (0 lint errors / 170 warnings), and `git diff --check` passes. See
[follow-up evidence](followup-evidence/results.json) for exact command outcomes, unchanged
protection checks and SHA-256 hashes of the tested source files.
No fresh browser/live acceptance is claimed by the author for this follow-up; the actual
React dialog is exercised in jsdom and the Admin production build is compiled.

## Owner-side local repeat test

1. Pull the updated feature branch. Rebuild/restart the **local** Medusa app with the owner's
   existing authorized settings/key; refresh Admin to load the new bundle. Keep the same
   business timezone and records. No new settings, data or secret changes are needed.
2. Open DevTools Network, filter `/admin/chef-ai/chat`, and run the three questions above in
   one open chat in order. Each new request should contain only its own `message`. An older
   bundle's bounded `previousQuestions` must still be harmless because the provider ignores it.
3. Inspect each **new response**, not a previous card remaining in the transcript. On the
   original November 12 test date, expect `period` / `range` / count to match the table.
   The live record counts should be 4 / 0 / 1 if the records have not changed. Confirm the
   November 16 appointment and protection against the existing event, without modifying it.
4. If local today has advanced, relative week/weekend windows must move accordingly. For
   the original fixed windows, use explicit “November 9 through November 15, 2026” and
   “November 14 through November 15, 2026”; their exclusive end is November 16. November 16
   alone still ends November 17. The model may correctly select `dates` for these requests.
5. Ask a write request (e.g. “Accept every booking”) and an unresolved reference (“that same
   day”). Expect no write or inherited calendar answer; a scope/clarification response is
   expected. Respect the existing five-request/minute limit; a further check may return 429.
6. If any window is wrong, report only head SHA, static question-case label, HTTP status,
   `period`, `timeZone`, `range`, completeness and entry count. Do not share a full HAR, key,
   prompts/history, customer cards or raw model output. Correct response windows with wrong
   visible cards point to presentation; wrong response windows point to semantic selection.

Residual nondeterminism: the single model still interprets natural-language dates. Removing
prior questions eliminates this cross-question context source; it does not prove every
possible question selects the intended window. Live owner retesting remains the acceptance gate.
