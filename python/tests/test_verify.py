"""TASKS.md T2.4 — signature verification against TS-produced vectors.

product_full.jws was produced by the TypeScript reference (`signSnapshot`,
ES256 detached JWS over the canonical JSON) in _gen_signed.mjs. Python must
verify it, reject a tampered snapshot, reject the wrong key, and resolve
did:web documents through an injectable resolver.
"""
import copy
import json
from pathlib import Path

import ahtml
from ahtml import from_json
from ahtml.sign import import_jwk, verify_snapshot
from ahtml.did_web import did_web_to_url, resolve_did_web, verify_snapshot_with_did_web

FIXTURES = Path(__file__).parent / "fixtures"

SNAP = from_json((FIXTURES / "product_full.json").read_text())
JWS = (FIXTURES / "product_full.jws").read_text()
GOOD_JWK = json.loads((FIXTURES / "signer.pub.jwk.json").read_text())
WRONG_JWK = json.loads((FIXTURES / "wrong.pub.jwk.json").read_text())


def test_verifies_ts_signed_snapshot() -> None:
    key = import_jwk(GOOD_JWK)
    assert key is not None
    result = verify_snapshot(SNAP, JWS, trusted_keys=[key])
    assert result.ok, f"TS-signed snapshot must verify in Python: {result}"


def test_tampered_snapshot_fails() -> None:
    key = import_jwk(GOOD_JWK)
    tampered = copy.deepcopy(SNAP)
    tampered["entities"][0]["price"]["amount"] = 1  # $19.99 → $0.01
    result = verify_snapshot(tampered, JWS, trusted_keys=[key])
    assert not result.ok, "tampered payload MUST fail verification"


def test_wrong_key_fails() -> None:
    wrong = import_jwk(WRONG_JWK)
    assert wrong is not None
    result = verify_snapshot(SNAP, JWS, trusted_keys=[wrong])
    assert not result.ok, "wrong key MUST fail verification"


def test_malformed_jws_fails() -> None:
    key = import_jwk(GOOD_JWK)
    for bad in ("", "not-a-jws", "a.b.c.d", "onlyonepart"):
        result = verify_snapshot(SNAP, bad, trusted_keys=[key])
        assert not result.ok, f"malformed JWS {bad!r} MUST fail"


# --- did:web -----------------------------------------------------------------


def test_did_web_to_url() -> None:
    assert did_web_to_url("did:web:shop.example.com") == (
        "https://shop.example.com/.well-known/did.json"
    )
    # Path-form DIDs use /<path>/did.json, not .well-known (did:web spec §3.2).
    url = did_web_to_url("did:web:example.com:users:alice")
    assert url == "https://example.com/users/alice/did.json"


def _did_document() -> dict:
    return {
        "id": "did:web:shop.example.com",
        "verificationMethod": [
            {
                "id": "did:web:shop.example.com#key-1",
                "type": "JsonWebKey2020",
                "controller": "did:web:shop.example.com",
                "publicKeyJwk": GOOD_JWK,
            }
        ],
    }


def test_resolve_did_web_with_mocked_resolver() -> None:
    fetched: list = []

    def fake_fetch(url: str) -> dict:
        fetched.append(url)
        return _did_document()

    keys = resolve_did_web("did:web:shop.example.com", fetch_json=fake_fetch)
    assert fetched == ["https://shop.example.com/.well-known/did.json"]
    assert keys, "resolver must yield at least one verification key"


def test_verify_snapshot_with_did_web_end_to_end() -> None:
    # cache={} isolates each test from the module-level resolver cache.
    result = verify_snapshot_with_did_web(
        SNAP, JWS, "did:web:shop.example.com",
        fetch_json=lambda url: _did_document(), cache={},
    )
    assert result.ok, f"did:web-resolved key must verify the TS signature: {result}"


def test_verify_snapshot_with_did_web_wrong_key_fails() -> None:
    doc = _did_document()
    doc["verificationMethod"][0]["publicKeyJwk"] = WRONG_JWK
    result = verify_snapshot_with_did_web(
        SNAP, JWS, "did:web:shop.example.com", fetch_json=lambda url: doc, cache={},
    )
    assert not result.ok
