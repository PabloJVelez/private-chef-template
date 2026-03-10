# Templatized Values Inventory

Single reference for **what to change** when plugging in a new chef. Each item has a file path (or env name) and a brief note. Use this with the [Plug-in Chef Playbook](./plug-in-chef-playbook.md) for the full runbook.

---

## Quick reference (order of operations)

1. **Chef identity** — `apps/storefront/libs/config/chef/chef-config.ts` (primary); then align store name and root meta.
2. **Environment** — Copy `.env.template` → `.env` for both apps; set Stripe, Medusa, and URL vars (see Config & environment below).
3. **Images** — Replace hero, CTA, and favicon files or paths; see [IMAGE_REPLACEMENT_GUIDE.md](../apps/storefront/IMAGE_REPLACEMENT_GUIDE.md).
4. **Route meta** — Replace or parameterize "Private Chef" in route titles (see Copy and meta).
5. **Medusa seed** — Run DB init and seed so at least one product/menu exists for checkout.
6. **Email chef name** — Change hardcoded chef name in event email subscribers if you use event emails.

---

## 1. Chef / brand identity (storefront)

| What | Where | What to change |
|------|--------|----------------|
| Chef name, bio, hero, SEO | `apps/storefront/libs/config/chef/chef-config.ts` | Update `chefConfig`: `name`, `displayName`, `tagline`, `bio`, `credentials`, `hero` (tagline, description, imageUrl, imageAlt), `seo` (title, description, keywords). **Primary swap point for a new chef.** |
| Store name (og:site_name, UI) | `apps/storefront/libs/util/server/root.server.ts` | Change `store: { name: 'Private Chef' }` to the chef/site name so it matches branding. |
| Root default meta title/description | `apps/storefront/app/root.tsx` → `getRootMeta` | Hardcoded fallback; override by using chefConfig in routes. Optionally set `title` and `description` here to match chefConfig.seo for consistency. |
| Favicon path | `apps/storefront/libs/config/site/site-settings.ts` | `favicon: '/favicon.jpg'` — point to your favicon file (e.g. `/favicon.svg`). Replace file in `apps/storefront/public/`. |
| Social links | `apps/storefront/libs/config/site/site-settings.ts` | Set `social_facebook`, `social_instagram`, `social_twitter` (and others if used) to chef’s URLs. |

---

## 2. Copy and meta (storefront)

| What | Where | What to change |
|------|--------|----------------|
| Homepage meta & bio | `apps/storefront/app/routes/_index.tsx` | Driven by chefConfig; no extra change if chef-config is updated. |
| Route-level "Private Chef" titles | `how-it-works.tsx`, `request.success.tsx`, `request._index.tsx`, `menus._index.tsx`, `menus.$menuId.tsx` (under `apps/storefront/app/routes/`) | Search for `Private Chef` in meta/title strings; replace with chef name or site name, or drive from chefConfig. |
| How It Works / About copy | `apps/storefront/app/routes/how-it-works.tsx`, `about.tsx`, `about-us.tsx` | Step titles/descriptions in how-it-works; about pages use chefConfig.displayName and chefConfig.bio — update via chef-config. |
| Event request form steps | `apps/storefront/app/components/event-request/EventRequestForm.tsx` | Step titles/subtitles; optional per-chef tweak or leave as template. |
| HowItWorks (homepage) | `apps/storefront/app/components/chef/HowItWorks.tsx` | Duplicate of how-it-works copy; keep in sync or single-source. |

---

## 3. Images and assets (storefront)

| What | Where | What to change |
|------|--------|----------------|
| Hero image | `apps/storefront/public/assets/images/chef_scallops_home.jpg` and `chefConfig.hero.imageUrl` in `chef-config.ts` | Replace file or set `hero.imageUrl` and `hero.imageAlt` in chef-config. See [IMAGE_REPLACEMENT_GUIDE.md](../apps/storefront/IMAGE_REPLACEMENT_GUIDE.md). |
| Meet Your Chef image | `apps/storefront/public/assets/images/chef_experience.jpg` and hardcoded path in `app/routes/_index.tsx` | Replace file; or add path to config and use in component. |
| Booking CTA image | `apps/storefront/public/assets/images/chef_book_experience.jpg` and hardcoded path in `app/routes/_index.tsx` | Same as above. |
| Favicon file | `apps/storefront/public/` | Replace favicon file; ensure `site-settings.ts` favicon path matches (e.g. `/favicon.jpg` or `/favicon.svg`). |

---

## 4. Navigation

| What | Where | What to change |
|------|--------|----------------|
| Header / footer nav labels and URLs | `apps/storefront/libs/config/site/navigation-items.ts` | Edit `headerNavigationItems` and `footerNavigationItems` (e.g. "About Chef" → "About Chef [Name]") if desired. |

---

## 5. Products and menus (Medusa backend)

| What | Where | What to change |
|------|--------|----------------|
| Product seed data | `apps/medusa/src/scripts/seed/products.ts` | Titles, handles, prices, options. For chefs, replace template products with menu/experience products. |
| Menu seed data | `apps/medusa/src/scripts/seed/menus.ts` | `menuDefinitions`: names, courses, dishes, ingredients. Adjust for chef’s menus. |
| Seed entrypoint | `apps/medusa/src/scripts/seed.ts` | Orchestrates seed; run via `yarn run seed` in apps/medusa (after DB init). |
| Reviews seed | `apps/medusa/src/scripts/seed/reviews.ts` | Optional: customize or leave as demo content. |

---

## 6. Config and environment

| What | Where | What to change |
|------|--------|----------------|
| Storefront env | `apps/storefront/.env` (from `apps/storefront/.env.template`) | Set `STRIPE_PUBLIC_KEY`, `MEDUSA_PUBLISHABLE_KEY`. See root README; optional: `yarn run generate-env` copies templates. |
| Storefront config | `apps/storefront/libs/util/server/config.server.ts` | Reads env; ensure `PUBLIC_MEDUSA_API_URL`, `STOREFRONT_URL` are set in .env. |
| Medusa env | `apps/medusa/.env` (from `apps/medusa/.env.template`) | Set `DB_NAME`, `DATABASE_URL`, `POSTGRES_URL`, CORS URLs, `REDIS_URL`, `JWT_SECRET`, `COOKIE_SECRET`, `ADMIN_BACKEND_URL`, `STRIPE_API_KEY`. |
| Medusa store (DB) | Updated via `apps/medusa/src/scripts/seed.ts` | Store record updated in seed; ensure store name in admin matches intent if you rely on it. |

---

## 7. Email / event subscribers (chef name)

| What | Where | What to change |
|------|--------|----------------|
| Chef name in accepted/rejected emails | `apps/medusa/src/subscribers/chef-event-accepted.ts`, `apps/medusa/src/subscribers/chef-event-rejected.ts` | Hardcoded "Chef Luis Velez" — replace with chef name (or future env/config). Set `STOREFRONT_URL` in Medusa .env for links in emails. |

---

## 8. Stripe and checkout

- **Storefront:** Uses `STRIPE_PUBLIC_KEY` and `MEDUSA_PUBLISHABLE_KEY` from env.
- **Medusa:** Uses `STRIPE_API_KEY` in .env; payment module in medusa-config. For mock orders use Stripe test mode and test card; ensure storefront and backend use same Medusa API and region.
