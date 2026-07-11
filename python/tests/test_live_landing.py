"""TASKS.md T2.9 — verify the LIVE signed snapshot on the landing site,
including did:web resolution. Network-gated: skipped unless AHTML_LIVE_TESTS=1
(set in CI, where this is a required job; offline dev runs skip it).
"""
import os

import pytest

pytestmark = pytest.mark.skipif(
    os.environ.get("AHTML_LIVE_TESTS") != "1",
    reason="live-network test — set AHTML_LIVE_TESTS=1 to run (required in CI)",
)

LIVE_URL = os.environ.get("AHTML_LIVE_URL", "https://ahtmljs.com")


def test_live_snapshot_fetches_and_verifies() -> None:
    import httpx

    from ahtml import AHTMLClient
    from ahtml.did_web import verify_snapshot_with_did_web

    client = AHTMLClient()
    snap = client.fetch(LIVE_URL, format="json")
    assert snap["ahtml"] == "0.1"

    provenance = snap.get("provenance") or {}
    issuer = provenance.get("issuer", "")
    if not issuer.startswith("did:web:"):
        pytest.skip(f"live snapshot at {LIVE_URL} publishes no did:web issuer yet")

    # The JWS travels in the X-AHTML-Signature header or provenance.signature.
    jws = provenance.get("signature")
    if not jws:
        res = httpx.get(LIVE_URL, headers={"accept": "application/ahtml+json"})
        jws = res.headers.get("x-ahtml-signature")
    assert jws, "signed live snapshot must expose its JWS"

    result = verify_snapshot_with_did_web(snap, jws, issuer)
    assert result.ok, f"live snapshot signature failed verification: {result}"
