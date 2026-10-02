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
from html import unescape
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


def main() -> int:
    payload = json.load(sys.stdin)

    if os.getenv("SOCIAL_GALLERY_IMPORTER_MOCK") == "1":
        print(json.dumps(mock_media(payload)))
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
