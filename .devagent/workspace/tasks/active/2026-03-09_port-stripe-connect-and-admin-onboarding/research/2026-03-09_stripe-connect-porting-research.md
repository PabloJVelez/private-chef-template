# Stripe Connect, Admin Onboarding, and Configurable Platform Fees — Porting Research

## Classification & Assumptions

- **Problem statement:** Figure out how to port the sibling project’s Stripe Connect provider, Stripe admin onboarding, and configurable platform fee logic into this template repo cleanly, knowing that I (the user) can provide the actual source files when the agent is ready, and that the template should generalize tickets/bento into events vs products.
- **Task scope:** Template-level Stripe architecture and fee behavior; no implementation or code changes in this workflow, only research and reference organization under `.devagent/workspace/**`.
- **Assumptions:**
  - [INFERRED] Sibling project code (provider, admin module, platform-fee util, admin UI, API routes, webhook) is the primary reference and will be provided as-is for adaptation.
  - [INFERRED] This template will move fully to the custom `stripe-connect` provider, using `USE_STRIPE_CONNECT` to switch between standard Stripe-like behavior and Connect.
  - [INFERRED] Product-type differentiation should be expressed as events vs products, not tickets vs bento, and the default classification can be `EVENT-*` SKU prefix for events.

## Research Plan

For this port, we need to confirm and/or organize the following:

1. **Source material inventory:** Capture and store the sibling project’s relevant files (Stripe Connect provider, types, utils, admin module, admin UI routes, API routes, webhooks, platform-fee util/tests) under this task hub as reference, without modifying any app code here.
2. **Architecture alignment:** Verify how those source files map onto this template’s structure (apps/medusa, apps/storefront, admin routes) and where adaptation may be required (paths, module registration, region/seed assumptions).
3. **Env & config surface:** Document the full set of Stripe-related env vars in the sibling project (Connect, admin onboarding, configurable fees) and how they should look in this template (renaming tickets/bento to events/products where appropriate).
4. **Behavioral contracts:** Summarize the behavioral expectations for:
   - Standard Stripe mode (`USE_STRIPE_CONNECT=false`) vs Connect mode (`USE_STRIPE_CONNECT=true`)
   - Admin onboarding UX and API/webhook contracts
   - Platform fee modes (per-event vs per-product, per-unit vs percentage) and how they map to `application_fee_amount`.
5. **Template-specific adaptations:** Identify places where the sibling project is tied to its “chef + bento” domain and outline how those will be generalized in this template (naming, SKU conventions, UI copy, docs).

## Source Material Inventory (So Far)

Stored under `reference/provider/`:

- `types.ts` — Stripe Connect provider types and config, including fee configuration options and `PlatformFeeLineItem`.
- `service.ts` — Stripe Connect payment provider service (AbstractPaymentProvider) with Connect vs non-Connect branching, cart line resolution, and webhook handling. (Truncated copy: `initiatePayment` and core behavior are preserved; rest of methods noted as unchanged from sibling project.)
- `index.ts` — Module provider wiring for the payment module (`ModuleProvider(Modules.PAYMENT, { services: [StripeConnectProviderService] })`).
- `utils/get-fee-config.ts` — Reads `PLATFORM_FEE_*` env vars (`PLATFORM_FEE_PERCENT`, `PLATFORM_FEE_PER_UNIT_BASED`, `PLATFORM_FEE_MODE_TICKETS/BENTO`, `PLATFORM_FEE_PER_TICKET_CENTS`, `PLATFORM_FEE_PER_BOX_CENTS`, `PLATFORM_FEE_PERCENT_TICKETS/BENTO`) into a normalized config.
- `utils/get-smallest-unit.ts` — Currency-aware conversion from decimal amount to Stripe’s smallest currency unit (0-, 2-, 3-decimal currencies).
- `utils/platform-fee.ts` — Platform fee calculation from line items using `isTicket(sku)` (SKU prefix `EVENT-`) to distinguish ticket vs bento, supporting per-unit and percent modes for each type.

Stored under `reference/connect-account/`:

- `service.ts` — Stripe Connect account module service (`StripeConnectAccountModuleService`) that manages a single Custom connected account, creates/reuses the DB row, generates Stripe Account Links pointing back to `/app/settings/store`, syncs status from Stripe, and exposes `getConnectedAccountId()` for the payment provider.
- `index.ts` — Module registration (`Module(STRIPE_CONNECT_ACCOUNT_MODULE, { service: StripeConnectAccountModuleService })`) with token `stripeConnectAccountModuleService`.
- `models/stripe-account.ts` — `stripe_connect_account` model with `id`, `stripe_account_id`, `details_submitted`, `charges_enabled`.
- `migrations/Migration20260303000000_stripe_connect_account.ts` — MikroORM migration creating the `stripe_connect_account` table and a unique index on `stripe_account_id`.

Stored under `reference/admin-stripe-connect-snippets.md`:

- Admin API GET/DELETE `/admin/stripe-connect` — Uses `StripeConnectAccountModuleService` to return high-level status (`not_connected` / `onboarding_incomplete` / `pending_verification` / `active`), a DB snapshot, and a Stripe account snapshot for UI display; DELETE clears the local DB record.
- Admin API POST `/admin/stripe-connect/account-link` — Validates optional `business_name`, `email`, `country` and returns a Stripe Account Link URL for hosted onboarding via the account module.
- Webhook POST `/webhooks/stripe-connect` — Handles `account.updated` events, with optional signature verification using `STRIPE_CONNECT_WEBHOOK_SECRET` and `STRIPE_API_KEY`, and calls `syncAccountStatus` on the module service.
- Admin UI widget `stripe-connect-store-widget.tsx` — Medusa admin widget (zone `store.details.after`) that shows Stripe Connect status badges, onboarding CTAs, and active account details; uses hooks `useStripeConnectStatus` and `useStripeConnectAccountLinkMutation`.

## Next Step — Requesting Source Files

When you’re ready, please provide the sibling project files in small, coherent batches so we can store them under this task hub for reference. For example:

- Stripe Connect provider module: `types.ts`, `service.ts`, `utils/get-smallest-unit.ts`
- Stripe Connect account module and admin API/webhook routes
- Admin UI route for Stripe Connect (`/app/stripe-connect`)
- Platform fee util and tests
- Any supporting env/docs snippets (e.g. `.env.template` changes)

I will save each batch under:

- `.devagent/workspace/tasks/active/2026-03-09_port-stripe-connect-and-admin-onboarding/reference/<category>/…`

and keep this research packet updated with an inventory of what’s been imported, plus any key findings about how it should be adapted for this template.

Once you send the first batch of files, I’ll:

1. Store them under the `reference/` directory for this task.
2. Extract and document the important behaviors, env/config, and structural patterns.
3. Call out any adaptation points that we need to remember when we later run `devagent create-plan` and `devagent implement-plan`.

