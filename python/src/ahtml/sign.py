"""Detached JWS signatures over canonical snapshot JSON.

Port of ``packages/schema/src/sign.ts`` (see also ``docs/signing.md``).

Wire format: JWS Compact Serialization with a detached payload
(RFC 7515 §3.1, Appendix F) — ``<protected-header>..<signature>``.
The signing input is ``base64url(header) || '.' || base64url(to_json(snap))``
where ``to_json`` is the canonical JSON form of SPEC.md §1.1.

Supported algorithms: ES256, EdDSA (Ed25519), RS256.

WebCrypto (the TS reference) uses raw ``r||s`` ECDSA signatures; the
``cryptography`` package speaks DER, so this module converts between the
two for ES256.
"""

from __future__ import annotations

import base64
import json
from dataclasses import dataclass, field
from typing import Any, Optional, Union

from cryptography.exceptions import InvalidSignature
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.asymmetric import ec, ed25519, padding, rsa
from cryptography.hazmat.primitives.asymmetric.utils import (
    decode_dss_signature,
    encode_dss_signature,
)

from .errors import AHTMLError
from .format_json import to_json
from .snapshot import Snapshot

__all__ = [
    "VerifyKey",
    "SignKey",
    "VerifyResult",
    "import_jwk",
    "sign_snapshot",
    "verify_snapshot",
    "verify_snapshot_strict",
]

SIGN_ALGS = ("ES256", "EdDSA", "RS256")

PublicKey = Union[
    ec.EllipticCurvePublicKey, ed25519.Ed25519PublicKey, rsa.RSAPublicKey
]
PrivateKey = Union[
    ec.EllipticCurvePrivateKey, ed25519.Ed25519PrivateKey, rsa.RSAPrivateKey
]


@dataclass
class VerifyKey:
    """Verifier-side key handle. Verifiers may pass several and try each."""

    alg: str
    key: PublicKey
    kid: Optional[str] = None


@dataclass
class SignKey:
    """Producer-side key handle. ``alg`` MUST match how ``key`` was generated."""

    alg: str
    key: PrivateKey
    kid: Optional[str] = None


@dataclass
class VerifyResult:
    ok: bool
    reason: Optional[str] = None
    signer: dict = field(default_factory=dict)

    def __bool__(self) -> bool:  # pragma: no cover — convenience
        return self.ok


# --------------------------------------------------------------------------
# base64url helpers
# --------------------------------------------------------------------------


def b64url_encode(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).decode("ascii").rstrip("=")


def b64url_decode(s: str) -> bytes:
    pad = (4 - len(s) % 4) % 4
    return base64.urlsafe_b64decode(s + "=" * pad)


# --------------------------------------------------------------------------
# JWK import
# --------------------------------------------------------------------------


def _jwk_alg(jwk: dict) -> Optional[str]:
    """Map a JWK to a supported SignAlg. Prefers explicit ``alg``; falls
    back to common kty/crv pairs. Returns None for unsupported keys."""
    alg = jwk.get("alg")
    if alg in SIGN_ALGS:
        return alg
    if jwk.get("kty") == "EC" and jwk.get("crv") == "P-256":
        return "ES256"
    if jwk.get("kty") == "OKP" and jwk.get("crv") == "Ed25519":
        return "EdDSA"
    if jwk.get("kty") == "RSA":
        return "RS256"
    return None


def import_jwk(jwk: dict, *, kid: Optional[str] = None) -> Optional[VerifyKey]:
    """Import a public JWK into a :class:`VerifyKey`.

    Returns None when the key type/curve is unsupported (mirroring the TS
    did:web resolver, which skips such entries rather than throwing).
    """
    alg = _jwk_alg(jwk)
    if alg is None:
        return None
    try:
        if alg == "ES256":
            x = int.from_bytes(b64url_decode(jwk["x"]), "big")
            y = int.from_bytes(b64url_decode(jwk["y"]), "big")
            key: PublicKey = ec.EllipticCurvePublicNumbers(
                x, y, ec.SECP256R1()
            ).public_key()
        elif alg == "EdDSA":
            key = ed25519.Ed25519PublicKey.from_public_bytes(b64url_decode(jwk["x"]))
        else:  # RS256
            n = int.from_bytes(b64url_decode(jwk["n"]), "big")
            e = int.from_bytes(b64url_decode(jwk["e"]), "big")
            key = rsa.RSAPublicNumbers(e, n).public_key()
    except Exception:
        return None
    resolved_kid = kid or jwk.get("kid")
    return VerifyKey(alg=alg, key=key, kid=resolved_kid)


# --------------------------------------------------------------------------
# Sign
# --------------------------------------------------------------------------


def _raw_sign(alg: str, key: PrivateKey, data: bytes) -> bytes:
    if alg == "ES256":
        der = key.sign(data, ec.ECDSA(hashes.SHA256()))
        r, s = decode_dss_signature(der)
        return r.to_bytes(32, "big") + s.to_bytes(32, "big")
    if alg == "EdDSA":
        return key.sign(data)
    if alg == "RS256":
        return key.sign(data, padding.PKCS1v15(), hashes.SHA256())
    raise AHTMLError("SIGNATURE_INVALID", f"unsupported algorithm: {alg}")


def sign_snapshot(
    snap: Snapshot | dict,
    key: SignKey,
    *,
    kid: Optional[str] = None,
    algorithm: Optional[str] = None,
) -> str:
    """Produce a detached JWS over ``to_json(snap)``:
    ``<base64url(header)>..<base64url(signature)>``."""
    alg = algorithm or key.alg
    effective_kid = kid if kid is not None else key.kid

    header: dict[str, Any] = {"alg": alg}
    if effective_kid is not None:
        header["kid"] = effective_kid
    header_b64 = b64url_encode(json.dumps(header, separators=(",", ":")).encode())

    payload_b64 = b64url_encode(to_json(snap).encode("utf-8"))
    signing_input = f"{header_b64}.{payload_b64}".encode("ascii")

    sig = _raw_sign(alg, key.key, signing_input)
    return f"{header_b64}..{b64url_encode(sig)}"


# --------------------------------------------------------------------------
# Verify
# --------------------------------------------------------------------------


def _parse_detached_jws(jws: Any) -> tuple[Optional[dict], Optional[str]]:
    """Returns (parsed, error_reason). ``parsed`` is
    ``{"header_b64", "sig_b64", "header"}``."""
    if not isinstance(jws, str):
        return None, "JWS is not a string"
    parts = jws.split(".")
    if len(parts) != 3:
        return None, "JWS must have three segments"
    header_b64, payload_b64, sig_b64 = parts
    if payload_b64 != "":
        return None, "JWS is not in detached form (payload segment is non-empty)"
    if not header_b64 or not sig_b64:
        return None, "JWS header or signature segment is empty"
    try:
        header = json.loads(b64url_decode(header_b64).decode("utf-8"))
    except Exception as err:
        return None, f"JWS header is not valid base64url JSON: {err}"
    if not isinstance(header, dict):
        return None, "JWS header is not an object"
    return {"header_b64": header_b64, "sig_b64": sig_b64, "header": header}, None


def _raw_verify(alg: str, key: PublicKey, signature: bytes, data: bytes) -> bool:
    try:
        if alg == "ES256":
            if len(signature) != 64:
                return False
            r = int.from_bytes(signature[:32], "big")
            s = int.from_bytes(signature[32:], "big")
            key.verify(encode_dss_signature(r, s), data, ec.ECDSA(hashes.SHA256()))
        elif alg == "EdDSA":
            key.verify(signature, data)
        elif alg == "RS256":
            key.verify(signature, data, padding.PKCS1v15(), hashes.SHA256())
        else:
            return False
        return True
    except InvalidSignature:
        return False


def verify_snapshot(
    snap: Snapshot | dict,
    jws: str,
    *,
    trusted_keys: list[VerifyKey],
) -> VerifyResult:
    """Verify a detached JWS produced by ``sign_snapshot`` /
    ``signSnapshot``. Tries each trusted key in order; first success wins.
    Never raises on a signature mismatch — only on programmer errors
    (no trusted keys supplied)."""
    if not trusted_keys:
        raise ValueError("verify_snapshot requires at least one trusted key")

    parsed, error = _parse_detached_jws(jws)
    if parsed is None:
        return VerifyResult(ok=False, reason=error)

    header = parsed["header"]
    if not isinstance(header.get("alg"), str):
        return VerifyResult(ok=False, reason="JWS header missing alg")

    payload_b64 = b64url_encode(to_json(snap).encode("utf-8"))
    signing_input = f"{parsed['header_b64']}.{payload_b64}".encode("ascii")
    try:
        signature = b64url_decode(parsed["sig_b64"])
    except Exception as err:
        return VerifyResult(ok=False, reason=f"signature is not valid base64url: {err}")

    last_reason = "no trusted key matched"
    for candidate in trusted_keys:
        if candidate.alg != header["alg"]:
            last_reason = f"no trusted key matched alg={header['alg']}"
            continue
        # If both sides declare a kid, require equality. A candidate with
        # no kid is a wildcard for any kid.
        if (
            candidate.kid is not None
            and header.get("kid") is not None
            and candidate.kid != header["kid"]
        ):
            last_reason = f"kid mismatch (header={header['kid']})"
            continue
        try:
            ok = _raw_verify(candidate.alg, candidate.key, signature, signing_input)
        except Exception as err:  # wrong-curve key etc. — try the next key
            last_reason = f"verify threw: {err}"
            continue
        if ok:
            signer: dict[str, Any] = {"alg": candidate.alg}
            if header.get("kid") is not None:
                signer["kid"] = header["kid"]
            elif candidate.kid is not None:
                signer["kid"] = candidate.kid
            return VerifyResult(ok=True, signer=signer)
        last_reason = "signature did not verify"

    return VerifyResult(ok=False, reason=last_reason)


def verify_snapshot_strict(
    snap: Snapshot | dict,
    jws: str,
    *,
    trusted_keys: list[VerifyKey],
) -> Snapshot | dict:
    """Strict variant: raises ``AHTMLError(SIGNATURE_INVALID)`` on failure
    and returns the snapshot unchanged on success."""
    result = verify_snapshot(snap, jws, trusted_keys=trusted_keys)
    if result.ok:
        return snap
    raise AHTMLError(
        "SIGNATURE_INVALID",
        f"snapshot signature verification failed: {result.reason}",
        hint="The snapshot bytes do not match the signature. Re-fetch the "
        "snapshot, and confirm the issuer's did:web document is current.",
    )
