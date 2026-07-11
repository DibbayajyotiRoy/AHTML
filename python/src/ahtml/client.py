"""AHTMLClient — the agent-side fetcher (httpx port of
``packages/agent/src/client.ts``, consumer surface only).

Behaviour:
- Defaults to ``Accept: application/ahtml+text`` (compact, token-optimal);
  ``format="json"`` negotiates ``application/ahtml+json``.
- Caches snapshots by URL keyed on ETag.
- A fetch within the snapshot's ``ttl`` skips the network entirely.
- A refetch of a cached URL sends ``If-None-Match``; a 304 returns the
  cached parse object (same object, no re-parse).
"""

from __future__ import annotations

import time
from dataclasses import dataclass
from typing import Any, Optional

import httpx

from .errors import AHTMLError
from .format_compact import from_compact
from .format_json import from_json
from .snapshot import Snapshot

__all__ = ["AHTMLClient", "CachedSnapshot"]

_DEFAULT_TIMEOUT_S = 30.0


@dataclass
class CachedSnapshot:
    snapshot: Snapshot
    fetched_at: float  # time.monotonic() seconds
    etag: Optional[str] = None


def _http_error(url: str, response: httpx.Response) -> AHTMLError:
    status = response.status_code
    retryable = False
    if status == 401:
        code = "AUTH_REQUIRED"
    elif status == 403:
        code = "POLICY_DENIED"
    elif status == 429:
        code, retryable = "RATE_LIMITED", True
    elif status >= 500:
        code, retryable = "HTTP_STATUS", True
    else:
        code = "HTTP_STATUS"
    body = ""
    try:
        body = response.text
    except Exception:
        pass
    return AHTMLError(
        code,
        f"AHTML {status}: {body[:200] or response.reason_phrase or 'request failed'}",
        status=status,
        retryable=retryable,
        context=url,
    )


class AHTMLClient:
    """The agent-side AHTML fetcher. Use one client per process; the
    snapshot cache lives on the instance.

    Parameters mirror the TS ``ClientOptions`` where they apply to Python:
    ``format`` ("compact" | "json"), ``agent`` (User-Agent identity),
    ``bearer`` (Authorization), ``timeout`` (seconds), and ``transport``
    (an ``httpx.BaseTransport`` — pass ``httpx.MockTransport`` in tests).
    """

    def __init__(
        self,
        *,
        format: str = "compact",
        agent: Optional[str] = None,
        bearer: Optional[str] = None,
        timeout: float = _DEFAULT_TIMEOUT_S,
        transport: Optional[httpx.BaseTransport] = None,
        http: Optional[httpx.Client] = None,
    ) -> None:
        self._defaults = {"format": format, "agent": agent, "bearer": bearer}
        self._http = http or httpx.Client(transport=transport, timeout=timeout)
        self._owns_http = http is None
        self._cache: dict[str, CachedSnapshot] = {}

    # -- context manager ----------------------------------------------------

    def close(self) -> None:
        if self._owns_http:
            self._http.close()

    def __enter__(self) -> "AHTMLClient":
        return self

    def __exit__(self, *exc: Any) -> None:
        self.close()

    # -- fetch ---------------------------------------------------------------

    def fetch(
        self,
        url: str,
        *,
        format: Optional[str] = None,
        no_cache: bool = False,
        agent: Optional[str] = None,
        bearer: Optional[str] = None,
    ) -> Snapshot:
        """Fetch the snapshot for a URL with TTL + ETag-aware caching."""
        fmt = format or self._defaults["format"] or "compact"
        cached = self._cache.get(url)

        # 1) Fresh cache (within TTL) — skip the network entirely.
        if cached and not no_cache and self._is_fresh(cached):
            return cached.snapshot

        accept = (
            "application/ahtml+json" if fmt == "json" else "application/ahtml+text"
        )
        headers = {"accept": accept}
        effective_agent = agent or self._defaults["agent"]
        if effective_agent:
            headers["user-agent"] = effective_agent
        effective_bearer = bearer or self._defaults["bearer"]
        if effective_bearer:
            headers["authorization"] = f"Bearer {effective_bearer}"

        # 2) Conditional GET when we hold an ETag.
        if cached and cached.etag and not no_cache:
            headers["if-none-match"] = cached.etag

        try:
            response = self._http.get(url, headers=headers)
        except httpx.TimeoutException as err:
            raise AHTMLError(
                "TIMEOUT", f"request timed out: {err}", retryable=True, context=url
            ) from err
        except httpx.HTTPError as err:
            raise AHTMLError(
                "NETWORK", f"fetch failed: {err}", retryable=True, context=url
            ) from err

        if response.status_code == 304 and cached:
            # Unchanged — return the cached parse and refresh the TTL clock.
            cached.fetched_at = time.monotonic()
            return cached.snapshot
        if response.status_code >= 400:
            raise _http_error(url, response)

        return self._store_from_response(url, response)

    def invalidate(self, url: Optional[str] = None) -> None:
        """Drop the cached entry for one URL, or the whole cache."""
        if url is not None:
            self._cache.pop(url, None)
        else:
            self._cache.clear()

    # -- internals -----------------------------------------------------------

    @staticmethod
    def _is_fresh(cached: CachedSnapshot) -> bool:
        ttl = cached.snapshot.get("ttl")
        if ttl is None:
            return False
        return (time.monotonic() - cached.fetched_at) < float(ttl)

    def _store_from_response(self, url: str, response: httpx.Response) -> Snapshot:
        content_type = response.headers.get("content-type", "")
        body = response.text
        if "application/ahtml+json" in content_type or (
            "application/json" in content_type
        ):
            snapshot = from_json(body)
        else:
            snapshot = from_compact(body)
        if snapshot.get("ahtml") != "0.1":
            raise AHTMLError(
                "CACHE_POISONED",
                "server returned an invalid AHTML snapshot: "
                f"ahtml version is {snapshot.get('ahtml')!r}",
                status=502,
                context=url,
            )
        etag = response.headers.get("etag")
        self._cache[url] = CachedSnapshot(
            snapshot=snapshot, fetched_at=time.monotonic(), etag=etag
        )
        return snapshot
