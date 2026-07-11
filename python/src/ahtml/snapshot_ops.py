"""Snapshot operations: ETag, structural diff, and validation.

Faithful ports of the TypeScript reference (packages/schema/src/snapshot.ts,
diff.ts, validate.ts) — byte-compatible where output bytes matter:

- ``compute_etag`` reproduces the djb2-over-JSON.stringify weak ETag,
  including JavaScript's UTF-16 code-unit semantics for ``charCodeAt``.
- ``diff`` emits the same change list (replace-style entity updates,
  remove+add for changed actions) and the same field order, so its
  serialization matches the TS ``diff`` byte-for-byte.
- ``validate`` mirrors the reference's error/WARNING split exactly — a
  malformed entity id is a warning, a missing one is an error.
"""
from __future__ import annotations

import re
from datetime import datetime, timezone
from typing import Any, Optional

from ._json import dumps
from .errors import AHTMLError

Snapshot = dict

ENTITY_TYPES = {"product", "document", "task", "profile", "dataset", "conversation"}
PAGE_TYPES = {
    "home", "product_detail", "product_list", "article", "document", "profile",
    "task_list", "task_detail", "dataset", "conversation", "checkout",
    "search_results", "category", "other",
}
_ID_RE = re.compile(r"^[a-z_]+:[A-Za-z0-9_\-.]+$")
_ISO_RE = re.compile(r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$")


def _djb2_utf16(s: str) -> str:
    """djb2 over UTF-16 code units — matches JS ``charCodeAt`` exactly."""
    h = 5381
    data = s.encode("utf-16-le")
    for i in range(0, len(data), 2):
        unit = data[i] | (data[i + 1] << 8)
        h = (h * 33 + unit) & 0xFFFFFFFF
    return format(h, "x")


def compute_etag(snap: Snapshot) -> str:
    """Weak ETag over the content-bearing subset (TS ``computeEtag``)."""
    stable: dict = {}
    for key in ("url", "page_type", "entities", "actions", "links", "policy"):
        if key in snap and snap[key] is not None:
            stable[key] = snap[key]
    return f'W/"{_djb2_utf16(dumps(stable))}"'


# --- diff ---------------------------------------------------------------------


def diff(prev: Snapshot, nxt: Snapshot) -> dict:
    """Structural diff by entity/action id (TS ``diff``)."""
    changes: list[dict] = []
    prev_entities = {e["id"]: e for e in prev.get("entities", [])}
    next_entities = {e["id"]: e for e in nxt.get("entities", [])}

    for eid, e in next_entities.items():
        old = prev_entities.get(eid)
        if old is None:
            changes.append({"op": "add", "entity": e})
        elif dumps(old) != dumps(e):
            changes.append({"op": "update", "id": eid, "patch": e})
    for eid in prev_entities:
        if eid not in next_entities:
            changes.append({"op": "remove", "id": eid})

    prev_actions = {a["id"]: a for a in prev.get("actions", [])}
    next_actions = {a["id"]: a for a in nxt.get("actions", [])}
    for aid, a in next_actions.items():
        old = prev_actions.get(aid)
        if old is None:
            changes.append({"op": "add_action", "action": a})
        elif dumps(old) != dumps(a):
            changes.append({"op": "remove_action", "id": aid})
            changes.append({"op": "add_action", "action": a})
    for aid in prev_actions:
        if aid not in next_actions:
            changes.append({"op": "remove_action", "id": aid})

    return {
        "ahtml": "0.1",
        "url": nxt.get("url"),
        "from_etag": prev.get("etag") or compute_etag(prev),
        "to_etag": nxt.get("etag") or compute_etag(nxt),
        "changes": changes,
    }


class InvalidDiffError(AHTMLError):
    def __init__(self, op: str, reasons: list[str]) -> None:
        super().__init__("DIFF_INVALID", f"invalid diff change ({op}): {'; '.join(reasons)}")
        self.op = op
        self.reasons = reasons


def _errors_only(issues: list[dict]) -> list[str]:
    return [f"{i['path']}: {i['message']}" for i in issues if i["severity"] == "error"]


def apply_diff(prev: Snapshot, d: dict) -> Snapshot:
    """Apply a SnapshotDiff (replace-style updates; TS ``applyDiff``)."""
    entities = {e["id"]: e for e in prev.get("entities", [])}
    actions = {a["id"]: a for a in prev.get("actions", [])}
    for c in d.get("changes", []):
        op = c.get("op")
        if op == "add":
            errs = _errors_only(validate_entity(c.get("entity"), "entity"))
            if errs:
                raise InvalidDiffError(op, errs)
            entities[c["entity"]["id"]] = c["entity"]
        elif op == "remove":
            entities.pop(c.get("id"), None)
        elif op == "update":
            errs = _errors_only(validate_entity(c.get("patch"), "patch"))
            if errs:
                raise InvalidDiffError(op, errs)
            entities[c["id"]] = c["patch"]
        elif op == "add_action":
            errs = _errors_only(validate_action(c.get("action"), "action"))
            if errs:
                raise InvalidDiffError(op, errs)
            actions[c["action"]["id"]] = c["action"]
        elif op == "remove_action":
            actions.pop(c.get("id"), None)
    out = dict(prev)
    out["fetched_at"] = datetime.now(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")
    out["etag"] = d.get("to_etag")
    out["entities"] = list(entities.values())
    out["actions"] = list(actions.values())
    return out


# --- validate -----------------------------------------------------------------


def validate(snap: Any) -> list[dict]:
    """Structural validation. Empty list = valid (TS ``validate``)."""
    issues: list[dict] = []
    if not isinstance(snap, dict):
        return [{"path": "", "message": "snapshot must be an object", "severity": "error"}]

    if snap.get("ahtml") != "0.1":
        issues.append({"path": "ahtml", "message": f'unsupported version "{snap.get("ahtml")}" (expected "0.1")', "severity": "error"})
    url = snap.get("url")
    if not isinstance(url, str) or not url:
        issues.append({"path": "url", "message": "url is required", "severity": "error"})
    fetched = snap.get("fetched_at")
    if not isinstance(fetched, str) or not _ISO_RE.match(fetched):
        issues.append({"path": "fetched_at", "message": "fetched_at must be an ISO 8601 timestamp", "severity": "error"})
    if snap.get("page_type") not in PAGE_TYPES:
        issues.append({"path": "page_type", "message": f'unknown page_type "{snap.get("page_type")}"', "severity": "error"})

    entities = snap.get("entities")
    if not isinstance(entities, list):
        issues.append({"path": "entities", "message": "entities must be an array", "severity": "error"})
    else:
        seen: set = set()
        for i, e in enumerate(entities):
            p = f"entities[{i}]"
            issues.extend(validate_entity(e, p))
            eid = e.get("id") if isinstance(e, dict) else None
            if eid:
                if eid in seen:
                    issues.append({"path": p + ".id", "message": f'duplicate entity id "{eid}"', "severity": "error"})
                seen.add(eid)

    actions = snap.get("actions")
    if not isinstance(actions, list):
        issues.append({"path": "actions", "message": "actions must be an array", "severity": "error"})
    else:
        seen_a: set = set()
        for i, a in enumerate(actions):
            p = f"actions[{i}]"
            issues.extend(validate_action(a, p))
            aid = a.get("id") if isinstance(a, dict) else None
            if aid:
                if aid in seen_a:
                    issues.append({"path": p + ".id", "message": f'duplicate action id "{aid}"', "severity": "error"})
                seen_a.add(aid)

    ttl = snap.get("ttl")
    if ttl is not None and (not isinstance(ttl, (int, float)) or isinstance(ttl, bool) or ttl < 0):
        issues.append({"path": "ttl", "message": "ttl must be a non-negative number", "severity": "error"})
    return issues


def validate_entity(e: Any, path: str = "") -> list[dict]:
    issues: list[dict] = []
    if not isinstance(e, dict):
        return [{"path": path, "message": "entity must be an object", "severity": "error"}]
    eid = e.get("id")
    if not eid or not isinstance(eid, str):
        issues.append({"path": path + ".id", "message": "entity.id is required", "severity": "error"})
    elif not _ID_RE.match(eid):
        issues.append({"path": path + ".id", "message": f'entity id "{eid}" should match "type:slug" (e.g. "product:mbp-14")', "severity": "warning"})
    etype = e.get("type")
    if not etype or etype not in ENTITY_TYPES:
        issues.append({"path": path + ".type", "message": f'unknown entity type "{etype}"', "severity": "error"})
    elif isinstance(eid, str) and eid and not eid.startswith(etype + ":"):
        issues.append({"path": path + ".id", "message": f'id prefix should match type ("{etype}:..."), got "{eid}"', "severity": "warning"})

    if etype == "product":
        if not e.get("name"):
            issues.append({"path": path + ".name", "message": "product.name is required", "severity": "error"})
        price = e.get("price")
        if price:
            amount = price.get("amount") if isinstance(price, dict) else None
            if not isinstance(amount, (int, float)) or isinstance(amount, bool):
                issues.append({"path": path + ".price.amount", "message": "price.amount must be a number", "severity": "error"})
            if not isinstance(price.get("currency") if isinstance(price, dict) else None, str):
                issues.append({"path": path + ".price.currency", "message": "price.currency must be a string (ISO 4217)", "severity": "error"})
    return issues


def validate_action(a: Any, path: str = "") -> list[dict]:
    issues: list[dict] = []
    if not isinstance(a, dict):
        return [{"path": path, "message": "action must be an object", "severity": "error"}]
    if not a.get("id") or not isinstance(a.get("id"), str):
        issues.append({"path": path + ".id", "message": "action.id is required", "severity": "error"})
    cost = a.get("cost")
    if cost and cost.get("category") not in {"free", "purchase", "subscription", "rate_limited", "compute"}:
        issues.append({"path": path + ".cost.category", "message": f'unknown cost category "{cost.get("category")}"', "severity": "error"})
    confirmation = a.get("confirmation")
    if confirmation and confirmation not in {"none", "recommended", "required"}:
        issues.append({"path": path + ".confirmation", "message": "confirmation must be none|recommended|required", "severity": "error"})
    return issues


def is_valid(snap: Any) -> bool:
    return all(i["severity"] != "error" for i in validate(snap))


def validate_strict(snap: Any) -> Snapshot:
    """Throwing variant: returns the snapshot or raises SCHEMA_INVALID."""
    issues = validate(snap)
    errors = [i for i in issues if i["severity"] == "error"]
    if errors:
        first = errors[0]
        more = f" (and {len(errors) - 1} more)" if len(errors) > 1 else ""
        raise AHTMLError(
            "SCHEMA_INVALID",
            f"snapshot failed validation: {first['path']}: {first['message']}{more}",
        )
    return snap
