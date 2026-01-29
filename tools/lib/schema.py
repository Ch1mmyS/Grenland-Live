# tools/lib/schema.py
from __future__ import annotations

REQUIRED_DOC_KEYS = ("meta", "items")
REQUIRED_ITEM_KEYS = ("id", "sport", "league", "season", "start", "source")

def validate_doc(doc: dict) -> None:
    if not isinstance(doc, dict):
        raise ValueError("Doc must be an object")
    for k in REQUIRED_DOC_KEYS:
        if k not in doc:
            raise ValueError(f"Doc missing '{k}'")
    if not isinstance(doc["items"], list):
        raise ValueError("Doc.items must be a list")
    for it in doc["items"]:
        if not isinstance(it, dict):
            raise ValueError("Each item must be object")
        for k in REQUIRED_ITEM_KEYS:
            if k not in it:
                raise ValueError(f"Item missing '{k}'")
        if not isinstance(it.get("source"), dict):
            raise ValueError("Item.source must be object")
