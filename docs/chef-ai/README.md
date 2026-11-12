# BTS-11 — read-only schedule chat

A floating, non-modal Admin dialog answers bounded schedule questions using the existing
`readCalendar` service. The only model-selected tool is `get_schedule`. The server renders
facts from the returned contract; it never displays model-authored factual prose. No second
model call, write tool, request search, event-details tool, Booking module or memory store.

Scope: [BTS-11](https://arborthreads.com/threads/thr_a4864934-79cc-460d-8730-e31e050125fa/chef-admin-ai-assistant-v1-scope-and-design-handoff),
[Nov 12 proposal](https://arborthreads.com/threads/thr_a4864934-79cc-460d-8730-e31e050125fa#c-con_e34dd9825aa9b1387c91a5cdde2508ab22971b72a724a43634ea76eeb46ec20d).
The supplied newer read-only scope governs this implementation. No Arbor connector was
available in the implementation session; no claim of reading or posting private Arbor comments.

## Identity boundary and configuration

The merged calendar service has **site-wide data**. `chef_event` has no chef-owner column,
and Availability uses the `chef-default` singleton. There is no safe per-chef predicate to
invent. Consequently this feature is disabled unless an operator explicitly attests a
dedicated single-chef/site database and allowlists its authorized Admin users:

```dotenv
CHEF_AI_SCOPE=single_site
CHEF_AI_ADMIN_USER_IDS=user_actual_medusa_admin_id
CHEF_AI_PROVIDER=openai
CHEF_AI_MODEL=gpt-4.1-mini
CHEF_AI_OPENAI_API_KEY=<server-only provider key>
```

Do not enable this on a shared database with separate chef tenants. A user ID list is an
explicit grant to read the **whole site's** existing workspace calendar, not tenant
filtering or an inferred chef role. At most 20 IDs. Missing attestation/identity denies
access before model or calendar calls. `/admin/chef-ai/chat` uses Medusa's real Admin
route loader plus explicit `authenticate('user', ['session', 'bearer'])`, preserving MFA
handling. Anonymous, customer and API-key actors are denied. The route additionally
checks the allowlist and retrieves the current user, so a deleted user's token is denied.
Existing sidebar and RBAC behavior is unchanged; this extra grant is stricter than the
workspace endpoints and must only be given to users authorized to see the site's data.

Save a valid IANA timezone in **Settings → Availability**. The endpoint reads only `id`
and `timezone` from the existing singleton. No fallback to server UTC, event-model default,
Google configuration, browser timezone or a model-invented zone. Missing/invalid settings
produce a setup message without a model call. The AI never saves this setting.

Keys and provider/model settings are server-only. The browser uses the dashboard's existing
Medusa SDK instance, backend URL and authentication settings. The OpenAI endpoint is fixed;
there is no model-controlled URL. Only the supported `openai` provider is accepted.
Missing key/unsupported provider returns a safe 503 configuration state.

## Bounded factual behavior

- A single OpenAI Chat Completions call selects a named relative period or explicit local
  dates. `strict: true`, closed schema, no parallel calls. Server validation remains
  authoritative even if the model violates its schema or prompt.
- Relative periods: today, tomorrow, this/next week, this/next weekend. Weeks start Monday;
  weekends are Saturday and Sunday of that week (including the current Saturday on Sunday).
  Explicit dates use local `YYYY-MM-DD`, **start inclusive / end exclusive**. A single day
  ends at the next local midnight. Luxon calendar arithmetic handles 23/25-hour DST days.
- Maximum 31 local days, bounded to one year either side of local today. No arbitrary
  filters or pagination arguments. All four event statuses are included. The model cannot
  select another timezone, identity, SQL query, endpoint or HTTP method.
- The existing calendar owns joins, overlap semantics and completeness. Crossing intervals
  are included; an event ending exactly at range start or starting exactly at range end
  is excluded. Requested/display estimates are separate from appointments and Scheduling's
  held/confirmed intervals. Confirmed/completed labels do not themselves imply protection.
- Incomplete reads or more than 100 events / 20 protected intervals per event show a
  narrow-the-range message with **no partial list**. Backend/provider failure is a missing
  read, never an empty result. Complete emptiness says no matching recorded events and
  explicitly does not establish free time. Google busy is not part of this tool.
- Titles/categories/statuses/times and local `detailPath` links come only from the calendar
  contract. Links are checked against the encoded private-event source ID. React renders
  plain text; no HTML, model Markdown, generic executor or dynamically selected function.
- Unknown/write/generic tools, duplicate calls and oversized tool arguments are rejected
  before any calendar read. No continuation loop or execution replay. Repeating an HTTP
  request is another read within the same rate limits, never a mutation.

The response is intentionally a deterministic summary plus event cards. This prevents
hallucinated summaries and keeps returned customer names/event text out of model context.
The model sees only the **current question**, the timezone, local date and fixed
instructions/schema. Visible history stays in React memory for the chef’s reference; it
is not model context. Older clients may still send up to four bounded `previousQuestions`,
but the provider ignores them. Each question must name its own date or period; references
like “that same day” need clarification. Previous assistant responses and tool results are
never sent to the model. The response exposes only the validated `period` enum alongside
its existing resolved `range` and `timeZone` for safe selection diagnostics. Prompt injection can at most select another bounded schedule read within
the caller's granted site scope; it cannot gain another tool or write capability.

## UI lifecycle and global mount evidence

`src/admin/root.tsx` is **not used as proof of a global mount**. Installed
`@medusajs/dashboard` 2.22.6 source provides the evidence:

1. `src/dashboard-app/dashboard-app.tsx` renders its own `Providers` around `RouterProvider`.
2. `src/providers/providers.tsx` contains the shared QueryClient and Theme providers. A
   guarded Vite transform wraps its existing I18n children with `ChefChatSession`.
3. `src/dashboard-app/routes/get-route.map.tsx` uses `ProtectedRoute` for both core and
   Settings routes. A second transform adds `ChefChat` alongside that component's `Outlet`,
   **inside** unchanged Permissions/Sidebar/Search providers and **after** existing auth
   checks. It passes the real dashboard SDK and authenticated user ID.
4. `src/components/layout/user-menu/user-menu.tsx` clears the query cache on logout.
   `ChefChatSession` observes removal/error/change of the real `['users', 'me']` identity.
   Its generation counter also prevents a late response restoring a previous session.

The existing Unlock preset redirects the built dashboard entry to these sources; its
installed README documents source overrides/patches for both dev and build. This is an
existing-supported Vite/Unlock mechanism, **not an official Medusa global widget zone**.
`src/lib/admin-chef-chat.ts` checks unique exact anchors and fails production bundling if
both source files were not transformed. Unit tests exercise the installed source. Built
browser acceptance proves global presence and retained history through core → Settings →
event-detail navigation. No dashboard fork, navigation interceptor or new dashboard page.

Risks: these two upstream source anchors and the user-cache key must be rechecked on a
Medusa upgrade. Auth failures/error-boundary pages may unmount the chat; it is not available
on login. Logout/query-cache reset and a new user clear history. Refresh destroys React
memory. The shared provider retains at most 12 displayed turns across route remounts, with
no localStorage/sessionStorage/DB/chat logs. The dialog closes on navigation; it doesn't
block menus. Radix handles Escape/focus restoration and a non-modal keyboard flow. Existing
Medusa theme tokens and a viewport-bounded layout support light/dark/mobile.

## Provider, cost and privacy

Initial choice: OpenAI `gpt-4.1-mini`, configurable through `CHEF_AI_MODEL`. It supports
function calling and is sufficient to evaluate for this narrow window-selection task.
The current official model page lists $0.40/M input and $1.60/M output tokens; verify pricing
and account availability when enabling. Author-side verification uses **mocked model transport**. See the
[owner live-test follow-up](followup-window-selection.md) for the reported regression,
its limits of diagnosis and the required live repeat test. The small model and one inference avoid the cost/latency of a second summarizer.
The official SDK is locked to 7.55.0; Luxon 3.7.2 was already transitive and is now direct.
Both have been exercised on Node 26.13.1 with Medusa 2.22.6.

Caps: 12 KB HTTP body, 1,000-character question, at most four ignored legacy previous
questions (each still limited to 1,000 characters), 400 output tokens,
15-second provider timeout, zero SDK retries, one in-flight request/user, 5 requests/minute,
50/day/user and 200/day/process. Counters contain IDs/timestamps/counts only, with at most
20 entries. Counters reset on restart and are **process-local**; multi-process deployments
need shared ingress limits and a provider-project spend limit before enabling. This is not
a durable billing quota. Database work remains subject to the existing calendar query bounds.

`store: false` disables API conversation storage; it does not promise zero provider abuse-
monitoring retention. Provider data-handling policy still applies to questions the user
chooses to submit. SDK logging is explicitly off. The app neither logs chat contents nor
stores them. Returned event summaries never go to the provider. Chat-specific parser errors
retain a generic Sentry error with request data removed and bypass raw error logging;
existing error monitoring/auth outside this endpoint is unchanged. Hosting proxies or
external instrumentation must also avoid request/response-body logging on this path.

Official references consulted:
- [Function calling](https://developers.openai.com/api/docs/guides/function-calling)
- [GPT-4.1 mini](https://developers.openai.com/api/docs/models/gpt-4.1-mini)

For a later quality comparison, replay the same fixed-date prompts and seeded calendar
against this model and one stronger OpenAI model **in separate offline runs**, keeping the
same tool schema/server renderer. Compare exact window selection, refusal/clarification,
DST/relative-date accuracy, token cost and p50/p95 latency. Include ambiguous dates,
non-English questions, filtered questions, instruction attacks and follow-ups. No second
router or runtime model is introduced here. Live semantic interpretation remains a manual
enablement gate; deterministic mocks establish the execution boundary, not model quality.

## Manual acceptance after a separately authorized deployment

1. Configure the server variables in Coolify's secret environment, verify the single-site
   boundary and actual Admin user IDs, and save the business timezone. Never use `VITE_`
   for a model key. Do not load `fixture-provider.cjs` in deployment.
2. Sign in as an authorized chef. From Events, open chat and ask “What's on my schedule this
   week?”, “What do I have this weekend?” and a known single date. Compare exact window and
   every displayed event/time/status/protected interval with the calendar and event records.
   Click a detail link. Try a clear date range with an exclusive end. Use synthetic staging
   events around DST for the 23/25-hour cases.
3. Close chat, navigate Menus → Settings → Availability, reopen and confirm temporary
   history. Check Escape focus, keyboard navigation, light/dark and a narrow mobile viewport.
   Refresh, then logout/login; history must be gone.
4. Check a known empty day, an intentionally too-large read, unknown/invalid timezone,
   provider/key failure and an unauthorized Admin. These must not say “available”, return
   other site data or silently turn errors into emptiness. Test “accept my booking” and a
   general-purpose tool injection: no writes or extra tool execution are possible.
5. Confirm no key in downloaded JS/network payloads and no sensitive body logging in hosting
   or Sentry. Review provider usage and rate limits. This PR authorizes **review only**;
   merge, deployment, enabling secrets and production acceptance are separate actions.

Follow-ups remain separate: live-model evaluation, deployment-wide cost limits if needed,
request search and detailed reads only after this slice is proven. Multi-chef tenancy needs
a real ownership model before enabling, not a prompt change.

See [verification.md](verification.md) for actual checks, limitations and fixture reproduction.
