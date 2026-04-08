# Research: Templatized Values Inventory and Locations

**Task:** Document templatized values (branding, copy, products, config) and where they live for the "plug in the chef" runbook.  
**Classification:** Implementation design — codebase inventory to support documentation task.  
**Date:** 2026-03-09

## Inferred Problem Statement

Where do templatized values (branding, copy, products, config, env) live in this Medusa + Remix monorepo, and what are the key file paths and touchpoints so a combined playbook and inventory doc can be written for the 2-week dev demo / ~1-month first mock order flow?

## Assumptions

- [INFERRED] Research is scoped to the current repo structure; no external "chef config as a service" assumed.
- [INFERRED] Seed data (products, menus) in Medusa counts as "templatized" for the runbook (swap or replace for each chef).

---

## Research Plan (What Was Validated)

1. **Branding / store identity** — Single source(s) for store name, favicon, logo, and where they are consumed.
2. **Chef-specific copy and SEO** — One central config vs scattered strings; route-level meta titles.
3. **Products and menus** — Where seed/demo data lives (Medusa) and how storefront displays it.
4. **Config and env** — Env vars and templates (storefront + medusa); URLs and keys.
5. **Navigation and social** — Header/footer nav and social links; where to change per chef.

---

## Sources

- **Internal:** Repo codebase (apps/storefront, apps/medusa), README, IMAGE_REPLACEMENT_GUIDE.md, .env.template files. No external docs cited; all from local read/grep.

---

## Findings: Templatized Values and Locations

### 1. Chef / brand identity (storefront — single source)

| What | Where | Notes |
|------|--------|--------|
| **Chef config (name, bio, hero, SEO)** | `apps/storefront/libs/config/chef/chef-config.ts` | Single export `chefConfig`; used by site-settings, root meta, _index, about, about-us, ChefHero, etc. **Primary swap point for chef name, tagline, bio, hero image URL/alt, SEO title/description/keywords.** |
| **Store name (og:site_name, UI)** | `apps/storefront/libs/util/server/root.server.ts` | Hardcoded `store: { name: 'Private Chef' }` in `siteDetails`. Should be aligned with chef or derived from chefConfig for consistency. |
| **Root default meta title/description** | `apps/storefront/app/root.tsx` → `getRootMeta` | Hardcoded `'Private Chef - Premium Culinary Experiences'` and description. Overridden by _index which uses `chefConfig.seo`. Consider driving root default from chefConfig for consistency. |
| **Favicon** | `apps/storefront/libs/config/site/site-settings.ts` | `favicon: '/favicon.jpg'`. Site settings also pull `description` from `chefConfig.seo.description` and `storefront_url` from env. |
| **Social links** | `apps/storefront/libs/config/site/site-settings.ts` | `social_facebook`, `social_instagram`, `social_twitter` (empty in template). Footer uses these via `SocialIcons`. |

**Key path:** For a new chef, **start with `apps/storefront/libs/config/chef/chef-config.ts`** and optionally sync `root.server.ts` store name and `root.tsx` default meta to match.

---

### 2. Copy and meta (storefront)

| What | Where | Notes |
|------|--------|--------|
| **Homepage meta** | `apps/storefront/app/routes/_index.tsx` | Uses `chefConfig.seo.title`, `chefConfig.seo.description`, `chefConfig.seo.keywords`; bio copy from `chefConfig.bio`. |
| **Route-level "Private Chef" titles** | Multiple route files | Hardcoded suffix " \| Private Chef" or " - Private Chef" in: `how-it-works.tsx`, `request.success.tsx`, `request._index.tsx`, `menus._index.tsx`, `menus.$menuId.tsx`. Should be parameterized (e.g. from chefConfig or site name). |
| **How It Works / About copy** | `apps/storefront/app/routes/how-it-works.tsx`, `about.tsx`, `about-us.tsx` | Step titles/descriptions in how-it-works; about pages use `chefConfig.displayName`, `chefConfig.bio.short/long`, `chefConfig.credentials`. |
| **Event request form steps** | `apps/storefront/app/components/event-request/EventRequestForm.tsx` | Step titles/subtitles (e.g. "Experience & Menu") — currently fixed; could stay template or become config. |
| **HowItWorks component (homepage)** | `apps/storefront/app/components/chef/HowItWorks.tsx` | Duplicate step copy; consider single source (e.g. config or route). |

**Key path:** After chef-config, search for `Private Chef` and `meta:` / `title:` in `apps/storefront/app` to replace or drive from config.

---

### 3. Images and assets (storefront)

| What | Where | Notes |
|------|--------|--------|
| **Hero image** | `apps/storefront/public/assets/images/chef_scallops_home.jpg` | Referenced by `chefConfig.hero.imageUrl` (default `/assets/images/chef_scallops_home.jpg`). Replace file or change `imageUrl` + `imageAlt` in chef-config. |
| **Meet Your Chef / CTA images** | `apps/storefront/public/assets/images/chef_experience.jpg`, `chef_book_experience.jpg` | Hardcoded paths in `app/routes/_index.tsx` (see IMAGE_REPLACEMENT_GUIDE.md). Replace files or add to config and use in component. |
| **Favicon** | `apps/storefront/public/` | Default in site-settings is `/favicon.jpg`; actual file may be favicon.svg or favicon.ico — confirm and replace. |

**Key path:** Follow `IMAGE_REPLACEMENT_GUIDE.md`; centralize paths in chef-config where possible.

---

### 4. Navigation

| What | Where | Notes |
|------|--------|--------|
| **Header / footer nav** | `apps/storefront/libs/config/site/navigation-items.ts` | `headerNavigationItems`, `footerNavigationItems` (labels and URLs). Optional per-chef tweaks (e.g. "About Chef" vs "About Chef [Name]"). |

---

### 5. Products and menus (Medusa backend)

| What | Where | Notes |
|------|--------|--------|
| **Product seed data** | `apps/medusa/src/scripts/seed/products.ts` | Builds products with titles, handles, prices, options (e.g. coffee/grind). Template currently has coffee-style products; for chefs, replace with menu/experience products. |
| **Menu seed data** | `apps/medusa/src/scripts/seed/menus.ts` | `menuDefinitions` (names, courses, dishes, ingredients). `seed/menus.ts` and related seed build menus and link to products. |
| **Seed entrypoint** | `apps/medusa/src/scripts/seed.ts` | Calls `seedProducts`, `seedMenuEntities`, `seedMenuProducts`, etc. Run via Medusa CLI/script (e.g. `yarn medusa exec ./src/scripts/seed.ts` or project’s seed command). |
| **Reviews seed** | `apps/medusa/src/scripts/seed/reviews.ts` | Demo review content; optional to customize or leave template. |

**Key path:** For "one sample menu/product" and checkout: ensure seed creates at least one product/collection and one menu; run seed after DB init. Document command in runbook.

---

### 6. Config and environment

| What | Where | Notes |
|------|--------|--------|
| **Storefront env** | `apps/storefront/.env` (from `.env.template`) | `STRIPE_PUBLIC_KEY`, `MEDUSA_PUBLISHABLE_KEY`; see README for generation. Required for checkout. |
| **Storefront config consumed** | `apps/storefront/libs/util/server/config.server.ts` | Reads `NODE_ENV`, `ENVIRONMENT`, `STRIPE_PUBLIC_KEY`, `PUBLIC_MEDUSA_API_URL`, `STOREFRONT_URL`, `SENTRY_*`, `EVENT_LOGGING`, `MEDUSA_PUBLISHABLE_KEY`. `loadEnv()` in env.ts loads .env. |
| **Medusa env** | `apps/medusa/.env` (from `.env.template`) | `DB_NAME=chef-template`, `DATABASE_URL`, `POSTGRES_URL`, `STORE_CORS`, `ADMIN_CORS`, `AUTH_CORS`, `REDIS_URL`, `JWT_SECRET`, `COOKIE_SECRET`, `ADMIN_BACKEND_URL`, `STRIPE_API_KEY`, `SENTRY_DSN`. |
| **Medusa store** | Backend DB | Store record (name, currencies, etc.) updated in `seed.ts` via `updateStoresWorkflow`; display name for storefront may still come from root.server store name. |
| **Email / event subscribers** | `apps/medusa/src/subscribers/chef-event-accepted.ts`, `chef-event-rejected.ts` | Hardcoded chef name "Chef John Doe" and use of `process.env.STOREFRONT_URL` for links. **Templatize chef name** (env or config) and ensure STOREFRONT_URL set per env. |

**Key path:** Runbook should list: copy `.env.template` → `.env` for both apps; set `STRIPE_*`, `MEDUSA_PUBLISHABLE_KEY`, `PUBLIC_MEDUSA_API_URL`, `STOREFRONT_URL`; run `yarn run generate-env` if project provides it; document Medusa seed and Stripe webhook/base URL if needed for mock orders.

---

### 7. Stripe and checkout

- **Storefront:** Stripe public key and Medusa publishable key from env; checkout flow in app.
- **Medusa:** `STRIPE_API_KEY` in .env; payment module configured in medusa-config. For mock order: use Stripe test mode and document test card; ensure storefront and backend point to same Medusa API and region.

---

## Recommendation

1. **Inventory doc:** Publish a short **Templatized Values Inventory** (e.g. in `docs/` or `.devagent/workspace/`) that lists the tables above with file paths and one-line “what to change” notes. Add a “Quick reference” section: chef-config first, then env, then images, then Medusa seed.
2. **Combined playbook:** Structure the runbook around: (1) Clone/copy template repo, (2) Env setup (both apps, keys and URLs), (3) Chef identity (chef-config + store name + root meta), (4) Images (replace or point hero/CTA/favicon), (5) Route meta (“Private Chef” → config or site name), (6) Medusa DB + seed (one product/menu, run seed), (7) Stripe test mode + first mock order. Include exact paths and key commands (e.g. `yarn run generate-env`, `yarn run medusa:init`, seed command).
3. **Hardcoded chef name in email:** Add to inventory and playbook: replace "Chef John Doe" in `chef-event-accepted.ts` and `chef-event-rejected.ts` with a value from env or a small shared config so emails show the correct chef name.

---

## Repo Next Steps (Checklist)

- [ ] Add store name (root.server) to a single source (chefConfig or env) and consume in root.server and anywhere else that shows "Private Chef".
- [ ] Parameterize route meta titles (suffix "Private Chef") via chefConfig or site name.
- [ ] Document env vars and seed command in the playbook; confirm `yarn run generate-env` and Medusa seed script names in package.json.
- [ ] In playbook, reference IMAGE_REPLACEMENT_GUIDE.md and chef-config for hero/CTA/favicon.
- [ ] Templatize chef name in Resend email subscribers (env or config) and document in inventory.

---

## Risks & Open Questions

- **Medusa store name:** If the store record in the DB has a name, it may be used in admin or emails; confirm whether seed or migrations set it and whether it should match the storefront “store name.”
- **Multiple chefs / envs:** Current design is one config file; for many chefs, future option is env-driven config (e.g. `CHEF_CONFIG_PATH` or env-specific JSON) — out of scope for v1 runbook but can be noted as future improvement.
