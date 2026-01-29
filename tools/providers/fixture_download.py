# tools/providers/fixture_download.py
from __future__ import annotations

import json
from tools.lib.http import get_text

def fetch(source: dict) -> list[dict]:
    url = source.get("url")
    if not url:
        raise ValueError(f"Source {source.get('id')} missing url")

    text = get_text(url)
    data = json.loads(text)

    # Support common shapes
    if isinstance(data, list):
        return data
    if isinstance(data, dict):
        for key in ("items", "games", "matches", "events"):
            if key in data and isinstance(data[key], list):
                return data[key]
    return []
