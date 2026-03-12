# Plug-in Chef Playbook

Step-by-step runbook and **client onboarding checklist** to go from **new chef interest** → **local dev demo** (target: ~2 weeks) → **first mock order** (target: ~1 month). Use with the [Templatized Values Inventory](./templatized-values-inventory.md) for exact file paths and “what to change.”

**Goals (soft):** Dev demo in ~2 weeks; first mock order ~1 month from interest. Use as guidance, not hard deadlines.

**“Good enough” 2-week demo:** Branded shell (logo/colors), basic copy, at least one sample menu/product, and checkout wired (Stripe sandbox OK). Chef can see their name, hero, one product, and complete a test order.

---

## Client Onboarding Checklist (overview)

Use this as the master checklist; each phase is expanded in the runbook below.

- [ ] **Phase 1:** Clone/copy template repo
- [ ] **Phase 2:** Env setup (storefront + Medusa)
- [ ] **Phase 3:** Chef identity (chef-config, store name, root meta)
- [ ] **Phase 4:** Images (hero, CTA, favicon)
- [ ] **Phase 5:** Route meta (“Private Chef” → chef/site name)
- [ ] **Phase 6:** Medusa DB + seed
- [ ] **Phase 7:** Run apps and verify dev demo
- [ ] **Phase 8:** First mock order (Stripe test)

---

## Phase 1: Clone or copy the template repo

- Clone this repo (or copy the project) into a new directory or use a new branch per chef.
- **Chef sees:** Nothing yet.

**Checklist:** [ ] Repo ready for edits.

---

## Phase 2: Env setup (both apps)

1. **Generate env files (if your project has it):**
   ```bash
   yarn run generate-env
   ```
   This copies `apps/medusa/.env.template` → `apps/medusa/.env` and `apps/storefront/.env.template` → `apps/storefront/.env`.

2. **Storefront `.env`** (`apps/storefront/.env`):
   - `STRIPE_PUBLIC_KEY` — Stripe publishable key (test mode for mock orders).
   - `MEDUSA_PUBLISHABLE_KEY` — From Medusa admin (Settings → Publishable API Keys).
   - `PUBLIC_MEDUSA_API_URL` — e.g. `http://localhost:9000` for local.
   - `STOREFRONT_URL` — e.g. `http://localhost:3000` for local.

3. **Medusa `.env`** (`apps/medusa/.env`):
   - `DATABASE_URL` / `POSTGRES_URL` — Point to your Postgres (e.g. local or Docker).
   - `DB_NAME` — e.g. `chef-template` or per-chef name.
   - `STRIPE_API_KEY` — Stripe secret key (test) for checkout.
   - `STORE_CORS`, `ADMIN_CORS`, `AUTH_CORS` — Include storefront URL (e.g. `http://localhost:3000`).
   - `REDIS_URL` — If required by your Medusa setup.
   - `ADMIN_BACKEND_URL` — e.g. `http://localhost:9000`.
   - **Stripe Connect (optional):** If using Stripe Connect for platform fees and chef payouts, set `USE_STRIPE_CONNECT=true`, `MEDUSA_ADMIN_URL` (e.g. `http://localhost:7000`), and complete onboarding in Medusa Admin (Stripe Connect widget). See [Stripe Connect & Platform Fees](./stripe-connect-and-fees.md).

See [Templatized Values Inventory → Config and environment](./templatized-values-inventory.md#6-config-and-environment) for the full list.

**Chef sees:** Nothing yet.

**Checklist:** [ ] Storefront .env set. [ ] Medusa .env set. [ ] Stripe test keys in place.

---

## Phase 3: Chef identity

1. **Primary:** Edit `apps/storefront/libs/config/chef/chef-config.ts`:
   - `name`, `displayName`, `tagline`
   - `bio` (short, long, subtitle)
   - `credentials` (yearsExperience, specialization, highlights)
   - `hero` (tagline, description, imageUrl, imageAlt)
   - `seo` (title, description, keywords)

2. **Store name:** In `apps/storefront/libs/util/server/root.server.ts`, set `store: { name: '…' }` to the chef/site name (e.g. same as displayName or site brand).

3. **Root meta (optional):** In `apps/storefront/app/root.tsx`, `getRootMeta`: if you want a single fallback, set title/description to match chefConfig.seo so un-overridden routes show the right meta.

**Chef sees:** (After you run the app) Homepage and about copy reflect the new chef; SEO title/description in browser tab.

**Checklist:** [ ] chef-config.ts updated. [ ] Store name in root.server updated. [ ] Root meta aligned if desired.

---

## Phase 4: Images (hero, CTA, favicon)

1. **Hero:** Replace `apps/storefront/public/assets/images/chef_scallops_home.jpg` or set `chefConfig.hero.imageUrl` and `imageAlt` in chef-config to a new path.
2. **Meet Your Chef / CTA:** Replace `chef_experience.jpg` and `chef_book_experience.jpg` in `apps/storefront/public/assets/images/`, or update hardcoded paths in `apps/storefront/app/routes/_index.tsx` (see [IMAGE_REPLACEMENT_GUIDE.md](../apps/storefront/IMAGE_REPLACEMENT_GUIDE.md)).
3. **Favicon:** Replace favicon in `apps/storefront/public/` and ensure `apps/storefront/libs/config/site/site-settings.ts` has the correct `favicon` path (e.g. `/favicon.jpg` or `/favicon.svg`).

**Chef sees:** Their photos and branding on homepage and in browser tab.

**Checklist:** [ ] Hero image replaced or config updated. [ ] CTA/meet-chef images replaced. [ ] Favicon replaced and site-settings path correct.

---

## Phase 5: Route meta (“Private Chef” in titles)

Search for `Private Chef` in `apps/storefront/app/routes/` and update meta/title strings so they use the chef or site name. Key files:

- `how-it-works.tsx`
- `request.success.tsx`
- `request._index.tsx`
- `menus._index.tsx`
- `menus.$menuId.tsx`

Either replace with the chef name or (future) drive from chefConfig.

**Chef sees:** Browser tab and social previews show correct name/site.

**Checklist:** [ ] Route meta titles updated.

---

## Phase 6: Medusa DB + seed

1. **Start Postgres (and Redis if needed).** From repo root, Medusa often uses Docker:
   ```bash
   cd apps/medusa && docker compose up -d
   ```

2. **Initialize DB and seed (from repo root):**
   ```bash
   yarn run medusa:init
   ```
   This typically runs: nukedb, create DB, migrate, sync, seed menus, add admin user. See `apps/medusa/package.json` for the exact script.

3. **Optional — full product seed:** If you need products from `seed.ts` (e.g. for checkout):
   ```bash
   cd apps/medusa && yarn run seed
   ```
   (Or your project’s equivalent: `medusa exec ./src/scripts/seed.ts`.)

4. **Admin user:** Default from medusa:init is often `admin@medusa-test.com` / `supersecret`; change in production. Create a Publishable API Key in Medusa Admin and put it in storefront `MEDUSA_PUBLISHABLE_KEY`.

**Chef sees:** Nothing yet (backend only).

**Checklist:** [ ] DB running. [ ] medusa:init completed. [ ] Seed run if needed. [ ] Publishable API key created and set in storefront .env.

---

## Phase 7: Run apps and verify dev demo

1. **Start Medusa:**
   ```bash
   cd apps/medusa && yarn run dev
   ```
   (Or from root: `yarn dev` if turbo runs both.)

2. **Start storefront:**
   ```bash
   cd apps/storefront && yarn run dev
   ```
   (Or from root if your monorepo script starts both.)

3. **Verify:** Open storefront URL (e.g. http://localhost:3000). Confirm:
   - Chef name, hero, and copy on homepage.
   - At least one product/menu visible.
   - Navigation and about/how-it-works reflect the chef.

**Chef sees:** Full branded dev demo: their name, images, one product, and a working storefront. **This is the “good enough” 2-week demo.**

**Checklist:** [ ] Medusa running. [ ] Storefront running. [ ] Homepage and one product visible. [ ] No console/network errors blocking use.

---

## Phase 8: First mock order (target: ~1 month from interest)

1. **Stripe:** Use Stripe test mode; add test card (e.g. 4242 4242 4242 4242). Ensure `STRIPE_PUBLIC_KEY` (storefront) and `STRIPE_API_KEY` (Medusa) are test keys.
2. **Stripe Connect (if enabled):** If `USE_STRIPE_CONNECT=true`, complete Connect onboarding in Medusa Admin (Settings → Stripe Connect widget) before accepting payments. See [Stripe Connect & Platform Fees](./stripe-connect-and-fees.md).
3. **Checkout:** Add product to cart, go through checkout, complete payment with test card.
4. **Confirm:** Order appears in Medusa Admin and (if applicable) webhooks/emails work.

**Chef sees:** They (or you) can place a test order and see it in admin. **First mock order = milestone for ~1-month target.**

**Checklist:** [ ] Stripe test keys set. [ ] Checkout completes. [ ] Order visible in admin. [ ] (Optional) Event/confirmation emails show correct chef name (see [Inventory → Email subscribers](./templatized-values-inventory.md#7-email--event-subscribers-chef-name)).

---

## Optional: Staging and beyond

- **Staging:** For a shared or per-chef staging URL, set `STOREFRONT_URL` and Medusa CORS to the staging domain and deploy (e.g. Vercel + your backend host). Same playbook; only env and deploy steps change.
- **Email chef name:** If event request/accept/reject emails are used, replace "Chef Luis Velez" in `apps/medusa/src/subscribers/chef-event-accepted.ts` and `chef-event-rejected.ts` with the chef name (or future env/config). See [Templatized Values Inventory](./templatized-values-inventory.md).

---

## Quick command reference

| Action | Command (from repo root unless noted) |
|--------|--------------------------------------|
| Generate .env files | `yarn run generate-env` |
| Medusa DB + init + seed menus + admin user | `yarn run medusa:init` |
| Medusa full seed (products etc.) | `cd apps/medusa && yarn run seed` |
| Start Medusa dev | `cd apps/medusa && yarn run dev` |
| Start storefront dev | `cd apps/storefront && yarn run dev` |

---

## References

- [Templatized Values Inventory](./templatized-values-inventory.md) — all file paths and “what to change.”
- [Stripe Connect & Platform Fees](./stripe-connect-and-fees.md) — env vars, admin onboarding, and platform fee configuration.
- [Templatized Values Inventory](./templatized-values-inventory.md) — all file paths and what to change.
- [IMAGE_REPLACEMENT_GUIDE.md](../apps/storefront/IMAGE_REPLACEMENT_GUIDE.md) — hero, CTA, and favicon specs and paths.
- Root and apps README — prerequisites, Docker, and env setup details.
