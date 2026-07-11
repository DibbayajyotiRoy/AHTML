"""ahtml — Python consumer SDK for the AHTML protocol.

Semantically mirrors the TypeScript consumer surface (``@ahtmljs/schema`` +
``@ahtmljs/agent``): canonical JSON and compact-text parsing (SPEC.md §1.1,
§9), an ETag/TTL-aware fetch client, detached-JWS verification with
``did:web`` resolution, and the ``run_action`` safety gate.
"""

from .client import AHTMLClient, CachedSnapshot
from .did_web import did_web_to_url, resolve_did_web, verify_snapshot_with_did_web
from .errors import ActionRefused, AHTMLError
from .format_compact import from_compact, to_compact
from .format_json import KEY_ORDER, from_json, to_json
from .policy_presets import (
    POLICY_PRESETS,
    auth_required,
    paid_action,
    public_read_only,
    rate_limited,
    train_deny,
)
from .sign import (
    SignKey,
    VerifyKey,
    VerifyResult,
    import_jwk,
    sign_snapshot,
    verify_snapshot,
    verify_snapshot_strict,
)
from .snapshot import Snapshot
from .snapshot_ops import (
    apply_diff,
    compute_etag,
    diff,
    is_valid,
    validate,
    validate_strict,
)
from .tokens import count_tokens, estimate_tokens_chars_div4, measure
from .workflow import ActionResult, DryRunResult, run_action

AHTML_VERSION = "0.1"
__version__ = "1.0.0"

__all__ = [
    "apply_diff",
    "compute_etag",
    "diff",
    "is_valid",
    "validate",
    "validate_strict",
    "AHTML_VERSION",
    "AHTMLClient",
    "AHTMLError",
    "ActionRefused",
    "ActionResult",
    "CachedSnapshot",
    "DryRunResult",
    "KEY_ORDER",
    "POLICY_PRESETS",
    "SignKey",
    "Snapshot",
    "VerifyKey",
    "VerifyResult",
    "auth_required",
    "count_tokens",
    "did_web_to_url",
    "estimate_tokens_chars_div4",
    "from_compact",
    "from_json",
    "import_jwk",
    "measure",
    "paid_action",
    "public_read_only",
    "rate_limited",
    "resolve_did_web",
    "run_action",
    "sign_snapshot",
    "to_compact",
    "to_json",
    "train_deny",
    "verify_snapshot",
    "verify_snapshot_strict",
    "verify_snapshot_with_did_web",
]
