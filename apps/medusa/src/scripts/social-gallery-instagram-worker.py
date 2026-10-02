#!/usr/bin/env python3
"""Instagram import worker boundary for the social gallery MVP.

Reads JSON from stdin and writes normalized JSON to stdout. This is intentionally
small and dependency-free so local Medusa can prove the queue boundary before a
real aiograpi provider is configured.
"""

from __future__ import annotations

import json
import os
import re
import sys
import urllib.request
import inspect
import asyncio
from html import unescape
from pathlib import Path
from typing import Any


def meta_content(html: str, name: str) -> str:
    escaped = re.escape(name)
    patterns = [
        rf'<meta[^>]+property=["\']{escaped}["\'][^>]+content=["\']([^"\']+)["\'][^>]*>',
        rf'<meta[^>]+name=["\']{escaped}["\'][^>]+content=["\']([^"\']+)["\'][^>]*>',
        rf'<meta[^>]+content=["\']([^"\']+)["\'][^>]+property=["\']{escaped}["\'][^>]*>',
        rf'<meta[^>]+content=["\']([^"\']+)["\'][^>]+name=["\']{escaped}["\'][^>]*>',
    ]
    for pattern in patterns:
        match = re.search(pattern, html, re.IGNORECASE)
        if match:
            return unescape(match.group(1)).strip()
    return ""


def shortcode_from_url(url: str) -> str | None:
    match = re.search(r"instagram\.com/(?:p|reel|tv)/([^/?#]+)", url)
    return match.group(1) if match else None


def fetch_metadata(url: str) -> dict[str, str]:
    request = urllib.request.Request(
        url,
        headers={
            "User-Agent": (
                "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36"
            ),
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        },
    )
    with urllib.request.urlopen(request, timeout=20) as response:
        html = response.read().decode("utf-8", errors="replace")

    return {
        "title": meta_content(html, "og:title") or meta_content(html, "twitter:title"),
        "caption": meta_content(html, "og:description") or meta_content(html, "description"),
        "image": meta_content(html, "og:image") or meta_content(html, "twitter:image"),
        "video": meta_content(html, "og:video") or meta_content(html, "og:video:url"),
    }


def mock_media(payload: dict[str, Any]) -> dict[str, Any]:
    handle = payload.get("handle") or "chef"
    media_url = os.getenv(
        "SOCIAL_GALLERY_IMPORTER_MOCK_MEDIA_URL",
        "https://images.unsplash.com/photo-1555244162-803834f70033?auto=format&fit=crop&w=1200&q=85",
    )
    return {
        "status": "completed",
        "message": "Mock Instagram importer returned one draft.",
        "account": {
            "status": "active",
            "metadata": {"mode": "mock"},
        },
        "media": [
            {
                "provider_media_id": f"mock-{handle}",
                "shortcode": f"mock-{handle}",
                "permalink": payload["source_url"],
                "title": f"Instagram import @{handle}",
                "caption": "Mock imported media for local testing.",
                "media_type": "image",
                "media_url": media_url,
                "thumbnail_url": media_url,
                "raw_provider_data": {"mode": "mock"},
            }
        ],
        "raw_result": {"mode": "mock"},
    }


def default_env_files() -> list[Path]:
    configured = os.getenv("SOCIAL_GALLERY_INSTAGRAM_ENV_FILE")
    files: list[Path] = []
    if configured:
        files.append(Path(configured))
    files.append(Path.home() / ".openclaw" / "secrets" / "instagram.env")
    return files


def load_env_file(path: Path) -> None:
    if not path.exists():
        return
    for raw_line in path.read_text().splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        key = key.strip()
        value = value.strip()
        if len(value) >= 2 and value[0] == value[-1] and value[0] in {"'", '"'}:
            value = value[1:-1]
        if key and key not in os.environ:
            os.environ[key] = value


def first_env(*keys: str) -> str | None:
    for key in keys:
        value = os.getenv(key)
        if value:
            return value
    return None


def run_maybe_await(value: Any) -> Any:
    if not inspect.isawaitable(value):
        return value
    try:
        loop = asyncio.get_event_loop()
    except RuntimeError:
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
    if loop.is_running():
        raise RuntimeError("Cannot run aiograpi coroutine inside an already-running event loop")
    return loop.run_until_complete(value)


def object_value(obj: Any, *names: str) -> Any:
    for name in names:
        if isinstance(obj, dict) and name in obj:
            return obj[name]
        if hasattr(obj, name):
            return getattr(obj, name)
    return None


def list_items(value: Any) -> list[Any]:
    if value is None:
        return []
    if isinstance(value, list):
        return value
    if isinstance(value, tuple):
        return list(value)
    if isinstance(value, dict):
        return list(value.values())
    return list(value) if hasattr(value, "__iter__") and not isinstance(value, (str, bytes)) else [value]


def media_url(value: Any) -> str:
    if not value:
        return ""
    if isinstance(value, str):
        return value
    if hasattr(value, "url"):
        return str(value.url)
    return str(value)


def media_type(media: Any) -> str:
    product_type = str(object_value(media, "product_type", "media_type") or "").lower()
    if "carousel" in product_type or object_value(media, "resources", "carousel_media"):
        return "carousel"
    if "video" in product_type or object_value(media, "video_url"):
        return "video"
    return "image"


def normalize_aiograpi_media(media: Any, handle: str | None) -> dict[str, Any] | None:
    shortcode = object_value(media, "code", "shortcode")
    pk = object_value(media, "pk", "id")
    permalink = f"https://www.instagram.com/p/{shortcode}/" if shortcode else None
    caption_obj = object_value(media, "caption_text", "caption")
    caption = str(caption_obj) if caption_obj else None
    image = media_url(object_value(media, "thumbnail_url", "display_url", "image_url"))
    video = media_url(object_value(media, "video_url"))
    kind = media_type(media)
    url = video if kind == "video" and video else image

    if not url and kind == "carousel":
        resources = list_items(object_value(media, "resources", "carousel_media"))
        first_resource = resources[0] if resources else None
        url = media_url(object_value(first_resource, "thumbnail_url", "display_url", "image_url", "video_url"))
        image = url

    if not url:
        return None

    taken_at = object_value(media, "taken_at", "taken_at_ts")
    posted_at = taken_at.isoformat() if hasattr(taken_at, "isoformat") else None
    title = caption.splitlines()[0][:90] if caption else f"Instagram post @{handle}" if handle else "Instagram post"

    return {
        "provider_media_id": str(pk or shortcode or permalink),
        "shortcode": str(shortcode) if shortcode else None,
        "permalink": permalink or f"https://www.instagram.com/{handle}/" if handle else "",
        "title": title,
        "caption": caption,
        "media_type": kind,
        "media_url": url,
        "thumbnail_url": image or None,
        "poster_url": image if kind == "video" else None,
        "posted_at": posted_at,
        "raw_provider_data": {
            "pk": str(pk) if pk else None,
            "shortcode": str(shortcode) if shortcode else None,
            "source": "aiograpi",
        },
    }


def aiograpi_import(payload: dict[str, Any]) -> dict[str, Any]:
    for env_file in default_env_files():
        load_env_file(env_file)

    username = first_env("BTS_IG_USERNAME", "INSTAGRAM_USERNAME", "IG_USERNAME")
    password = first_env("BTS_IG_PASSWORD", "INSTAGRAM_PASSWORD", "IG_PASSWORD")
    session_path = Path(
        first_env(
            "SOCIAL_GALLERY_INSTAGRAM_SESSION_PATH",
            "BTS_IG_SESSION_PATH",
        )
        or "/home/openclaw/.openclaw/workspace/instagram-outreach/.instagram-session.json"
    )

    if not username or not password:
        return {
            "status": "needs_connection",
            "message": "Instagram credentials were not found. Set BTS_IG_USERNAME/BTS_IG_PASSWORD or INSTAGRAM_USERNAME/INSTAGRAM_PASSWORD.",
            "account": {"status": "needs_connection"},
            "media": [],
            "raw_result": {"mode": "aiograpi", "reason": "missing_credentials"},
        }

    try:
        from aiograpi import Client
    except ImportError:
        return {
            "status": "needs_connection",
            "message": "aiograpi is not installed for the Python used by Medusa. Run: python3 -m pip install -r apps/medusa/requirements-social-gallery.txt",
            "account": {"status": "needs_connection"},
            "media": [],
            "raw_result": {"mode": "aiograpi", "reason": "missing_package"},
        }

    handle = payload.get("handle")
    if not handle:
        return {
            "status": "needs_connection",
            "message": "Post-link import through aiograpi needs a handle-aware resolver; paste a profile handle for now.",
            "account": {"status": "needs_connection"},
            "media": [],
            "raw_result": {"mode": "aiograpi", "reason": "missing_handle"},
        }

    client = Client()
    if session_path.exists():
        run_maybe_await(client.load_settings(str(session_path)))

    run_maybe_await(client.login(username, password))
    session_path.parent.mkdir(parents=True, exist_ok=True)
    run_maybe_await(client.dump_settings(str(session_path)))

    user = run_maybe_await(client.user_info_by_username(handle))
    user_id = object_value(user, "pk", "id")
    amount = int(os.getenv("SOCIAL_GALLERY_INSTAGRAM_IMPORT_LIMIT", "12"))
    medias = run_maybe_await(client.user_medias(user_id, amount))
    normalized = [
        item
        for item in (normalize_aiograpi_media(media, handle) for media in list_items(medias))
        if item
    ]

    return {
        "status": "completed" if normalized else "needs_connection",
        "message": f"Imported {len(normalized)} Instagram draft(s)." if normalized else "aiograpi returned no media for this profile.",
        "account": {
            "status": "active" if normalized else "import_limited",
            "metadata": {
                "mode": "aiograpi",
                "session_path": str(session_path),
                "import_limit": amount,
            },
        },
        "media": normalized,
        "raw_result": {"mode": "aiograpi", "media_count": len(normalized)},
    }


def main() -> int:
    payload = json.load(sys.stdin)

    if os.getenv("SOCIAL_GALLERY_IMPORTER_MOCK") == "1":
        print(json.dumps(mock_media(payload)))
        return 0

    if os.getenv("SOCIAL_GALLERY_IMPORTER_PROVIDER") == "aiograpi":
        try:
            print(json.dumps(aiograpi_import(payload)))
            return 0
        except Exception as exc:
            print(
                json.dumps(
                    {
                        "status": "failed",
                        "message": f"aiograpi import failed: {exc}",
                        "account": {"status": "error"},
                        "media": [],
                        "raw_result": {"mode": "aiograpi", "error": str(exc)},
                    }
                )
            )
            return 0

    source_url = payload["source_url"]
    shortcode = shortcode_from_url(source_url)

    if not shortcode:
        print(
            json.dumps(
                {
                    "status": "needs_connection",
                    "message": "Instagram profile queued. Configure the aiograpi provider or set SOCIAL_GALLERY_IMPORTER_MOCK=1 for local testing.",
                    "account": {
                        "status": "needs_connection",
                        "metadata": {"provider": "python-worker", "mode": "metadata-only"},
                    },
                    "media": [],
                    "raw_result": {"mode": "metadata-only", "reason": "profile_import_requires_connector"},
                }
            )
        )
        return 0

    try:
        metadata = fetch_metadata(source_url)
    except Exception as exc:
        print(
            json.dumps(
                {
                    "status": "needs_connection",
                    "message": "Instagram did not expose media publicly. Configure the aiograpi provider to fetch this post.",
                    "account": {"status": "needs_connection"},
                    "media": [],
                    "raw_result": {"mode": "metadata-only", "error": str(exc)},
                }
            )
        )
        return 0

    media_url = metadata.get("video") or metadata.get("image")
    if not media_url:
        print(
            json.dumps(
                {
                    "status": "needs_connection",
                    "message": "Instagram metadata did not include media. Configure the aiograpi provider to fetch this post.",
                    "account": {"status": "needs_connection"},
                    "media": [],
                    "raw_result": {"mode": "metadata-only", "metadata": metadata},
                }
            )
        )
        return 0

    print(
        json.dumps(
            {
                "status": "completed",
                "message": "Imported one Instagram post as a draft.",
                "account": {"status": "active", "metadata": {"mode": "metadata-only"}},
                "media": [
                    {
                        "provider_media_id": shortcode,
                        "shortcode": shortcode,
                        "permalink": source_url,
                        "title": metadata.get("title") or "Instagram post",
                        "caption": metadata.get("caption") or None,
                        "media_type": "video" if metadata.get("video") else "image",
                        "media_url": media_url,
                        "thumbnail_url": metadata.get("image") or None,
                        "poster_url": metadata.get("image") if metadata.get("video") else None,
                        "raw_provider_data": {"metadata": metadata, "mode": "metadata-only"},
                    }
                ],
                "raw_result": {"mode": "metadata-only", "metadata": metadata},
            }
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
