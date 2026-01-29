# tools/lib/http.py
from __future__ import annotations

import time
import requests

DEFAULT_TIMEOUT = 30

def get_bytes(url: str, headers: dict | None = None, timeout: int = DEFAULT_TIMEOUT,
              retries: int = 3, backoff: float = 1.7) -> bytes:
    last_err = None
    for i in range(retries):
        try:
            r = requests.get(url, headers=headers, timeout=timeout)
            r.raise_for_status()
            return r.content
        except Exception as e:
            last_err = e
            time.sleep(backoff ** i)
    raise RuntimeError(f"HTTP GET failed after {retries} retries: {url} -> {last_err}")

def get_text(url: str, headers: dict | None = None, timeout: int = DEFAULT_TIMEOUT,
             retries: int = 3, backoff: float = 1.7, encoding: str | None = None) -> str:
    b = get_bytes(url, headers=headers, timeout=timeout, retries=retries, backoff=backoff)
    if encoding:
        return b.decode(encoding, errors="replace")
    return b.decode("utf-8", errors="replace")
