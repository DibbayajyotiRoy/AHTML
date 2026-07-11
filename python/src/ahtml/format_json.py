"""Canonical JSON serializer — port of ``packages/schema/src/format-json.ts``.

Normative rules: SPEC.md §1.1. The canonical form is the ETag / signing
input; ``to_json`` here is byte-identical to ``toJson`` in
``@ahtmljs/schema`` for the same snapshot.
"""

from __future__ import annotations

import json

from ._json import dumps as _js_dumps
from .errors import AHTMLError
from .snapshot import Snapshot

__all__ = ["KEY_ORDER", "from_json", "to_json"]

# SPEC.md §1.1 rule 1: fixed top-level key order; absent keys omitted;
# keys not in this list MUST NOT be emitted.
KEY_ORDER = [
    "ahtml",
    "url",
    "fetched_at",
    "ttl",
    "etag",
    "page_type",
    "policy",
    "provenance",
    "entities",
    "actions",
    "links",
    "schemas",
    "meta",
]


def to_json(s: Snapshot | dict, *, pretty: bool = False) -> str:
    """Serialize a snapshot to canonical JSON (SPEC.md §1.1).

    ``pretty=True`` returns the human-readable 2-space-indent variant
    (NOT the signing/ETag input).
    """
    ordered = {k: s[k] for k in KEY_ORDER if k in s}
    if pretty:
        return json.dumps(ordered, indent=2, ensure_ascii=False) + "\n"
    return _js_dumps(ordered)


def from_json(text: str) -> Snapshot:
    """Parse ``application/ahtml+json`` into a :class:`Snapshot`."""
    try:
        parsed = json.loads(text)
    except Exception as err:
        raise AHTMLError(
            "JSON_PARSE",
            f"failed to parse ahtml+json: {err}",
            hint="The body is not valid JSON. Check the server returned "
            "application/ahtml+json and not an error page.",
            cause=err,
        ) from err
    if not isinstance(parsed, dict):
        raise AHTMLError(
            "JSON_PARSE",
            "failed to parse ahtml+json: top-level value is not an object",
        )
    return Snapshot(parsed)
