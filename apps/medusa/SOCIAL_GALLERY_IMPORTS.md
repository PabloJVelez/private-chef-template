# Social Gallery Instagram Importer

The Social Gallery importer runs through a Medusa event subscriber and a Python
worker. The admin route only queues the job; the worker imports media and writes
draft gallery posts back into Medusa.

## Local Setup

Install the Python dependency into the same Python environment Medusa will use:

```bash
python3 -m pip install -r apps/medusa/requirements-social-gallery.txt
```

Add the Instagram env values to `apps/medusa/.env`:

```bash
SOCIAL_GALLERY_IMPORTER_PROVIDER=aiograpi
SOCIAL_GALLERY_INSTAGRAM_IMPORT_LIMIT=12
INSTAGRAM_USERNAME=...
INSTAGRAM_PASSWORD=...
```

Optional session persistence:

```bash
SOCIAL_GALLERY_INSTAGRAM_SESSION_PATH=/absolute/path/to/.instagram-session.json
```

Then start Medusa normally:

```bash
corepack yarn workspace medusa dev
```

## Mock Mode

Use mock mode to test the queue/subscriber/Python boundary without Instagram:

```bash
SOCIAL_GALLERY_IMPORTER_MOCK=1 corepack yarn workspace medusa dev
```
