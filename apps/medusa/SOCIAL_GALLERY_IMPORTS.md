# Social Gallery: Apify Instagram imports

The app stays Node-based. A Medusa subscriber calls Apify over HTTPS, reads the
saved run's dataset, and copies image/video assets through the existing Medusa
file provider before creating drafts. No Python, Instagram password, browser
session, or new queue service is required.

## Account setup (the remaining live-verification step)

1. In your Apify account, open **Settings → Integrations** and create/copy an API
   token. Keep it on the Medusa server only; never put it in storefront or Vite
   variables, source control, screenshots, or client code.
2. Open the [Apify Instagram Scraper](https://apify.com/apify/instagram-scraper)
   while logged in and confirm the actor is available to your account and that
   you have usage credit. A free account is not a guarantee of unlimited/free
   actor runs. No schedule or saved task is needed.
3. Add the following to `apps/medusa/.env` locally, or the Medusa service's secret
   environment in deployment. Configure it in the worker service too when using
   split server/worker mode:

   ```dotenv
   APIFY_API_TOKEN=<your token>
   SOCIAL_GALLERY_APIFY_ACTOR=apify~instagram-scraper
   SOCIAL_GALLERY_IMPORT_LIMIT=12
   SOCIAL_GALLERY_APIFY_MAX_CHARGE_USD=0.10
   ```

   For the first smoke test, use `SOCIAL_GALLERY_IMPORT_LIMIT=3` and leave the
   $0.10 per-run ceiling in place. This is a cap, not an expected charge. Check
   the account's current pricing/credits first. The cap applies per new import,
   not to all imports in the account combined.
4. Verify the existing file provider is configured. Production should use the
   existing B2/S3 provider with a public HTTPS `S3_FILE_URL` and persistent
   storage. Local development can use `FILE_PROVIDER=local`; loopback HTTP
   media URLs are accepted outside production only.
5. Apply migrations and restart Medusa:

   ```bash
   corepack yarn workspace medusa migrate
   corepack yarn workspace medusa dev
   ```

6. In **Social Gallery**, paste an owned public Instagram profile or post/reel
   URL. The connection notice disappears when server config is present; this
   does not itself verify the token. A real import verifies it.
7. Verify import completion, owned media URLs, carousel order and video playback.
   Edit a caption/category, publish it, open `/gallery`, then import the same
   profile again. The edited/published post must stay unchanged.

The implementation has not been live-proven against the account until these
steps have succeeded. No Apify run is started by builds, migrations, tests, or
simply configuring a token. Old pending Python jobs are marked failed during the
upgrade so they cannot unexpectedly launch paid Apify runs.

## Boundaries and limits

- One active importer per database. Other jobs stay queued.
- Up to 24 posts per run, 12 by default. One post for a single post/reel URL.
- Run timeout: 180 seconds at Apify. Worker attempt deadline: eight minutes.
- Per-run spend limit: $0.10 by default, configurable from $0.01 to $1.00.
- At most 20 ordered assets per carousel, 40 MB per file, 150 MB per attempt.
- HTTPS Instagram CDN downloads only, with redirect revalidation, DNS/IP checks,
  pinned address resolution, deadlines, byte limits, and media signature checks.
- Node HTTP API calls time out after 20 seconds and JSON is limited to 8 MB.
- Automatic retries are capped at three attempts and reuse the saved Apify run;
  they do not start another scraper run.

## Recovery and curation

Run IDs are persisted before polling. If run creation is ambiguous, the job
stops and asks the operator to check Apify Console. **Do not blindly paste the
same URL again in that case:** a run may already have consumed credit.

Once a run ID is saved, **Resume import** retries that dataset/media ingestion
without launching another Apify run. Expired media URLs or an empty/failed
provider run may require a deliberately new import after inspecting the run.
Partial failures keep all drafts that were successfully stored.

A scheduled Medusa job runs every minute to recover stale leases and pick up
queued work if event delivery failed. It only processes explicitly requested
jobs; it does not periodically rescrape profiles. Use the existing Redis event
bus and shared/worker process mode. Server-only deployments need a worker.

Existing imported posts retain all chef edits/publication. Legacy posts with
remote-only media have their media repaired without resetting curation. New
items start as drafts. **Archive** hides a post but keeps its provider-ID record
so re-importing does not resurrect it. Its assets are intentionally retained;
this is not a permanent asset deletion operation.

Manual creation never fetches source links. Add an actual media URL to a manual
post; link-only drafts cannot be published. Imported asset fields are managed by
ingestion rather than the curation form. Alt text, layout, order, category,
caption, and CTAs remain editable.

Public APIs project only storefront fields. Empty galleries and API failures
have distinct states and never substitute stock/sample posts. Lists are paginated.

## Verification commands

From the repository root:

```bash
corepack yarn workspace medusa test:unit --runTestsByPath src/lib/social-gallery/__tests__/gallery.unit.spec.ts
corepack yarn workspace medusa typecheck
corepack yarn workspace storefront typecheck
FILE_PROVIDER=local corepack yarn workspace medusa build
corepack yarn workspace storefront build
```

The database suite requires an **isolated disposable** PostgreSQL database named
`social_gallery_test` on `127.0.0.1`. It applies the actual gallery migrations and
truncates its import-job table. Never point it at a deployed database:

```bash
SOCIAL_GALLERY_TEST_DATABASE_URL=postgresql://postgres:<test-password>@127.0.0.1:<test-port>/social_gallery_test \
  corepack yarn workspace medusa exec jest --runInBand --forceExit --runTestsByPath integration-tests/social-gallery/jobs.spec.ts
```

The tests use fixtures, mock provider/file boundaries, and PostgreSQL concurrency;
they do not use an Apify token or consume account credit.

## Gallery presentation and curation

The storefront is a photo-first mosaic with a compact heading, category filters,
click-to-open media, and one quiet page-level event-request link. Captions and
original source links live in the detail viewer. Videos do not autoplay in the
feed. There are no per-post booking/menu prompts.

In Admin, publish a draft to show it and use **Chef’s pick** for a subtle badge
and a possible taller tile. Layout is automatic and bounded on mobile/desktop;
there is no oversized featured hero. Original captions and existing legacy
CTA/layout data are preserved, but per-post CTAs and manual layout controls are
not exposed in this gallery workflow. Caption/title editing is always visible;
source/media details are collapsed for existing posts. New manual posts start
with those details open. Successful import history is collapsed; active/failed
imports remain visible.

Manual UI checks: review 1, 3, and many posts at phone and desktop widths; open a
photo, video, and carousel; check Escape and focus restoration; filter categories;
publish/unpublish and toggle Chef’s pick. Confirm no full Instagram caption is
used as a giant headline, and no import/publish/edit action loses existing data.
