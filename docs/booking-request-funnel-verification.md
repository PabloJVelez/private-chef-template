# Booking Request Funnel Verification

Status: PML-89 baseline verification

This checklist verifies that the private chef template can receive a real booking request and move it into the Medusa admin workflow before channel attribution and conversion tracking are added.

## Scope

This is intentionally channel-neutral. The request funnel should work for traffic from organic search, Meta, Google Ads, email, SMS, direct links, referrals, QR codes, social profiles, and future channels. Source measurement belongs in the next attribution tasks, but this baseline must preserve the business fields every channel needs to optimize against.

## Public Entry Points

- Header navigation includes `Request Event` pointing to `/request`.
- Homepage primary CTA points to `/request`.
- Chef hero CTA points to `/request`.
- Menu index CTA points to `/request`.
- How It Works and About pages link to `/request`.
- Direct `/request` access loads the same form.

## Required Request Fields

The public request form must capture:

- Menu/template selection.
- Experience type.
- Requested date.
- Requested time.
- Party size.
- Event address.
- First name.
- Last name.
- Email.
- Phone.
- Dietary or special requirements.
- Additional notes.

Phone is required because fast lead follow-up is part of the marketing support model. Email remains required for confirmations and proposal delivery.

## Submission Path

1. Storefront `/request` validates the form with `eventRequestSchema`.
2. The route action calls `createChefEventRequest`.
3. `createChefEventRequest` posts JSON to Medusa `POST /store/chef-events` with `x-publishable-api-key`.
4. The Medusa store route validates the payload, resolves experience/menu pricing, forces `status: "pending"`, and runs `createChefEventWorkflow`.
5. `createChefEventWorkflow` creates the `chef_event` record and emits:
   - `chef-event.requested`
   - `google-calendar.sync-requested`
6. The storefront redirects to `/request/success?eventId=<chef_event_id>`.

## Success Page Privacy

The success page:

- Requires `eventId`; missing ids redirect home.
- Shows a shortened visible request reference, `eventId.slice(0, 8).toUpperCase()`.
- Does not display customer name, email, phone, address, notes, dietary needs, or pricing details.
- Pulls support email, phone, and response time from `chefConfig.contact` instead of hardcoded placeholders.

## Admin Verification

After submitting a request, verify in Medusa Admin:

- The request appears under Chef Events.
- Status is `pending`.
- Event details include menu/template, experience type, requested date/time, party size, address, name, email, phone, notes, and special requirements.
- The chef can open the event detail page.
- Pending events expose `Accept Event` and `Reject Event`.
- Accepting moves the request to the confirmed booking path and creates the related product/ticket flow.
- Rejecting records the rejection reason and notifies the customer.

## Production Setup Notes

Before a production smoke test:

- Storefront `.env` must have a valid `MEDUSA_PUBLISHABLE_KEY`.
- Storefront must point at the production Medusa API base URL.
- Medusa `.env` must have `DATABASE_URL`, `POSTGRES_URL`, `JWT_SECRET`, `COOKIE_SECRET`, `STORE_CORS`, `ADMIN_CORS`, `AUTH_CORS`, and `REDIS_URL`.
- Medusa must be migrated and synced.
- Seed data must include at least one active menu and one active experience type, or the form should be verified against its fallback experience options.
- `chefConfig.contact` must be replaced with the chef-specific email, phone, and response-time promise before launch.

## Multi-Channel Measurement Hand-Off

The next attribution tasks should not assume a single marketing channel. They should capture enough first-touch and last-touch context to compare:

- Organic search.
- Paid search.
- Meta and Instagram.
- Email.
- SMS.
- Direct/referral.
- Social profile links.
- QR/offline campaign links.
- Partner or influencer links.

Attribution should attach to the created `chef_event` or a related record without sending sensitive lead details to ad platforms. PII such as name, email, phone, address, dietary notes, and free-form notes should stay inside the booking/admin system unless a later privacy-reviewed integration explicitly requires hashed or restricted fields.
