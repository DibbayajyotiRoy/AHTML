"""``did:web`` key resolution — port of ``packages/schema/src/did-web.ts``
(see ``docs/did-web.md``).

Rules per the W3C did:web Method Specification:
- ``did:web:example.com``        → ``https://example.com/.well-known/did.json``
- ``did:web:example.com:agents`` → ``https://example.com/agents/did.json``
- Each colon in the method-specific identifier becomes ``/`` in the URL;
  percent-encoded ports (``%3A``) are decoded back to ``:``.

The HTTP transport is injectable (``fetch_json`` callable) for tests;
the default uses ``httpx``. Resolved keys are memoized per-DID with a
5-minute TTL.
"""

from __future__ import annotations

import time
import urllib.parse
import warnings
from typing import Callable, Optional

from .errors import AHTMLError
from .sign import VerifyKey, VerifyResult, import_jwk, verify_snapshot
from .snapshot import Snapshot

__all__ = [
    "did_web_to_url",
    "resolve_did_web",
    "verify_snapshot_with_did_web",
]

# Default TTL for resolved DID -> [VerifyKey] entries (5 minutes).
_DEFAULT_TTL_S = 5 * 60.0

# Process-wide default cache: did -> (expires_at, keys)
_default_cache: dict[str, tuple[float, list[VerifyKey]]] = {}

FetchJson = Callable[[str], dict]


def did_web_to_url(did: str) -> str:
    """Translate a ``did:web:*`` identifier into the HTTPS URL of its DID
    document. Raises ``AHTMLError(SIGNATURE_INVALID)`` on malformed DIDs."""
    if not isinstance(did, str) or not did.startswith("did:web:"):
        raise AHTMLError("SIGNATURE_INVALID", f"not a did:web identifier: {did}")
    msi = did[len("did:web:") :]
    if not msi:
        raise AHTMLError("SIGNATURE_INVALID", "did:web identifier is empty")
    segments = msi.split(":")
    host = urllib.parse.unquote(segments[0])
    if not host:
        raise AHTMLError("SIGNATURE_INVALID", "did:web host segment is empty")
    if len(segments) == 1:
        return f"https://{host}/.well-known/did.json"
    path = "/".join(urllib.parse.unquote(seg) for seg in segments[1:])
    return f"https://{host}/{path}/did.json"


def _default_fetch_json(url: str) -> dict:
    import httpx

    response = httpx.get(
        url, headers={"accept": "application/did+json, application/json"}
    )
    if response.status_code != 200:
        raise AHTMLError(
            "SIGNATURE_INVALID",
            f"did:web resolution failed: {response.status_code} for {url}",
            status=response.status_code,
        )
    return response.json()


def resolve_did_web(
    did: str,
    *,
    fetch_json: Optional[FetchJson] = None,
    cache: Optional[dict] = None,
    cache_ttl: float = _DEFAULT_TTL_S,
) -> list[VerifyKey]:
    """Resolve a ``did:web`` DID into a list of :class:`VerifyKey` handles.

    ``fetch_json(url) -> dict`` is the injectable transport (mocked
    resolver in tests). Unsupported ``verificationMethod`` entries are
    skipped with a warning, not fatal. Raises
    ``AHTMLError(SIGNATURE_INVALID)`` when the document can't be fetched,
    parsed, or contains zero usable keys.
    """
    store = cache if cache is not None else _default_cache
    now = time.monotonic()
    hit = store.get(did)
    if hit is not None and hit[0] > now:
        return hit[1]

    url = did_web_to_url(did)
    fetcher = fetch_json or _default_fetch_json
    try:
        doc = fetcher(url)
    except AHTMLError:
        raise
    except Exception as err:
        raise AHTMLError(
            "SIGNATURE_INVALID",
            f"did:web resolution failed: fetch threw for {url}",
            context=did,
            cause=err,
        ) from err

    if not isinstance(doc, dict) or not isinstance(doc.get("verificationMethod"), list):
        raise AHTMLError(
            "SIGNATURE_INVALID",
            f"did:web document is missing verificationMethod[] for {url}",
            context=did,
        )

    keys: list[VerifyKey] = []
    for vm in doc["verificationMethod"]:
        if not isinstance(vm, dict):
            warnings.warn("[ahtml:did-web] skipping non-object verificationMethod entry")
            continue
        jwk = vm.get("publicKeyJwk")
        if not isinstance(jwk, dict) or not isinstance(jwk.get("kty"), str):
            warnings.warn(
                f"[ahtml:did-web] skipping verificationMethod without a publicKeyJwk "
                f"(id={vm.get('id')})"
            )
            continue
        kid = jwk.get("kid") or vm.get("id")
        key = import_jwk(jwk, kid=kid if isinstance(kid, str) and kid else None)
        if key is None:
            warnings.warn(
                f"[ahtml:did-web] skipping verificationMethod with unsupported alg "
                f"(id={vm.get('id')}, alg={jwk.get('alg')}, kty={jwk.get('kty')})"
            )
            continue
        keys.append(key)

    if not keys:
        raise AHTMLError(
            "SIGNATURE_INVALID",
            f"did:web document at {url} yielded zero usable verification keys",
            context=did,
        )

    store[did] = (now + cache_ttl, keys)
    return keys


def verify_snapshot_with_did_web(
    snap: Snapshot | dict,
    jws: str,
    did: str,
    *,
    fetch_json: Optional[FetchJson] = None,
    cache: Optional[dict] = None,
) -> VerifyResult:
    """``verify_snapshot`` using a ``did:web`` identifier instead of
    pre-imported keys. Resolution failures return ``ok=False`` (they do
    not raise), matching the TS ``verifySnapshotWithDidWeb``."""
    try:
        trusted_keys = resolve_did_web(did, fetch_json=fetch_json, cache=cache)
    except AHTMLError as err:
        return VerifyResult(ok=False, reason=err.message)
    except Exception as err:  # pragma: no cover — defensive
        return VerifyResult(ok=False, reason=f"did:web resolution failed: {err}")
    return verify_snapshot(snap, jws, trusted_keys=trusted_keys)
