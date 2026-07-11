"""Compact text serializer/parser — port of
``packages/schema/src/format-compact.ts`` (normative grammar: SPEC.md §9).

Line-oriented, token-optimal, and lossless against the canonical JSON form.
Inline compressions: Money → ``1999 USD``; Stock → ``in_stock (42)``;
Rating → ``4.7 (1284)``; Cost → ``1999 USD purchase``;
Reversibility → ``P30D full_refund`` / ``no``.

The port matches the TS implementation semantically field-for-field,
including its JS-truthiness field-presence checks (``if (p.brand)`` skips
empty strings) and embedded ``JSON.stringify`` for structured list items.
"""

from __future__ import annotations

import json
import re
from typing import Any, Optional

from ._json import dumps as _js_json, format_number as _num
from .errors import AHTMLError
from .snapshot import Snapshot

__all__ = ["to_compact", "from_compact"]


def _t(v: Any) -> bool:
    """JS truthiness: '' / 0 / None / False are falsy; [] and {} are truthy."""
    if v is None or v is False:
        return False
    if isinstance(v, str):
        return v != ""
    if isinstance(v, bool):
        return v
    if isinstance(v, (int, float)):
        return v != 0
    return True


# =====================================================================
# Serializer
# =====================================================================


def to_compact(s: Snapshot | dict) -> str:
    L: list[str] = []

    L.append(f"@ahtml {s.get('ahtml')}")
    L.append(f"@url {s.get('url')}")
    L.append(f"@fetched {s.get('fetched_at')}")
    if s.get("ttl") is not None:
        L.append(f"@ttl {_scalar(s['ttl'])}")
    if _t(s.get("etag")):
        L.append(f"@etag {s['etag']}")
    L.append(f"@page_type {s.get('page_type')}")

    if _t(s.get("policy")):
        L.append("")
        L.append("@policy")
        _write_policy(s["policy"], L)
    if _t(s.get("provenance")):
        L.append("")
        L.append("@provenance")
        _write_provenance(s["provenance"], L)

    for e in s.get("entities", []):
        L.append("")
        L.append(f"[{e.get('id')}]")
        _write_entity(e, L)

    for a in s.get("actions", []):
        L.append("")
        L.append(f"(action) {a.get('id')}")
        _write_action(a, L)

    links = s.get("links")
    if links and len(links) > 0:
        L.append("")
        L.append("@links")
        _write_links(links, L)

    schemas = s.get("schemas")
    if schemas and len(schemas) > 0:
        L.append("")
        L.append("@schemas")
        for name, definition in schemas.items():
            L.append(f"  {name}: {_js_json(definition)}")

    meta = s.get("meta")
    if meta and len(meta) > 0:
        L.append("")
        L.append("@meta")
        _write_kv(meta, L)

    return "\n".join(L) + "\n"


def _write_policy(p: dict, L: list[str]) -> None:
    L.append(f"  agents_welcome: {'yes' if p.get('agents_welcome') else 'no'}")
    if _t(p.get("license")):
        L.append(f"  license: {p['license']}")
    if _t(p.get("rate_limit")):
        L.append(f"  rate_limit: {p['rate_limit']}")
    if _t(p.get("actions_require")):
        L.append(f"  actions_require: {p['actions_require']}")
    if _t(p.get("contact")):
        L.append(f"  contact: {p['contact']}")
    if _t(p.get("terms_url")):
        L.append(f"  terms_url: {p['terms_url']}")
    if _t(p.get("attribution_required")):
        L.append("  attribution_required: yes")
    if _t(p.get("republish")):
        L.append(f"  republish: {p['republish']}")
    if _t(p.get("caching")):
        c = p["caching"]
        parts: list[str] = []
        if "allowed" in c and c["allowed"] is not None:
            parts.append("allowed" if c["allowed"] else "denied")
        if "ttl" in c and c["ttl"] is not None:
            parts.append(f"ttl={_scalar(c['ttl'])}")
        L.append(f"  caching: {' '.join(parts)}")


def _write_provenance(p: dict, L: list[str]) -> None:
    if _t(p.get("issuer")):
        L.append(f"  issuer: {p['issuer']}")
    if p.get("signed") is not None:
        L.append(f"  signed: {'yes' if p['signed'] else 'no'}")
    if _t(p.get("signature")):
        L.append(f"  signature: {p['signature']}")
    if _t(p.get("signature_alg")):
        L.append(f"  signature_alg: {p['signature_alg']}")
    if _t(p.get("fetched_via")):
        L.append(f"  fetched_via: {p['fetched_via']}")


def _write_links(l: dict, L: list[str]) -> None:
    if _t(l.get("self")):
        L.append(f"  self: {l['self']}")
    if _t(l.get("canonical")):
        L.append(f"  canonical: {l['canonical']}")
    if _t(l.get("parent")):
        L.append(f"  parent: {l['parent']}")
    if _t(l.get("next")):
        nxt = l["next"]
        parts: list[str] = []
        if _t(nxt.get("cursor")):
            parts.append(f"cursor={nxt['cursor']}")
        if _t(nxt.get("url")):
            parts.append(f"url={nxt['url']}")
        if nxt.get("expected") is not None:
            parts.append(f"expected={_scalar(nxt['expected'])}")
        if nxt.get("total") is not None:
            parts.append(f"total={_scalar(nxt['total'])}")
        L.append(f"  next: {' '.join(parts)}")
    if _t(l.get("prev")):
        prev = l["prev"]
        parts = []
        if _t(prev.get("cursor")):
            parts.append(f"cursor={prev['cursor']}")
        if _t(prev.get("url")):
            parts.append(f"url={prev['url']}")
        L.append(f"  prev: {' '.join(parts)}")
    related = l.get("related")
    if related and len(related):
        L.append(f"  related: {', '.join(related)}")


def _write_entity(e: dict, L: list[str]) -> None:
    t = e.get("type")
    if t == "product":
        _write_product(e, L)
    elif t == "document":
        _write_document(e, L)
    elif t == "task":
        _write_task(e, L)
    elif t == "profile":
        _write_profile(e, L)
    elif t == "dataset":
        _write_dataset(e, L)
    elif t == "conversation":
        _write_conversation(e, L)


def _write_product(p: dict, L: list[str]) -> None:
    L.append(f"  name: {_quote_if_needed(p.get('name', ''))}")
    if _t(p.get("brand")):
        L.append(f"  brand: {_quote_if_needed(p['brand'])}")
    if _t(p.get("description")):
        L.append(f"  description: {_quote_if_needed(p['description'])}")
    if _t(p.get("price")):
        L.append(f"  price: {_money(p['price'])}")
    if _t(p.get("list_price")):
        L.append(f"  list_price: {_money(p['list_price'])}")
    if _t(p.get("stock")):
        L.append(f"  stock: {_stock(p['stock'])}")
    if _t(p.get("sku")):
        L.append(f"  sku: {p['sku']}")
    if _t(p.get("rating")):
        r = p["rating"]
        L.append(f"  rating: {_scalar(r.get('average'))} ({_scalar(r.get('count'))})")
    if _t(p.get("category")):
        L.append(f"  category: {p['category']}")
    images = p.get("images")
    if images and len(images):
        _write_images(images, L)
    if _t(p.get("attributes")):
        L.append("  attributes:")
        for k, v in p["attributes"].items():
            L.append(f"    {k}: {_format_typed_scalar(v)}")
    variants = p.get("variants")
    if variants and len(variants):
        L.append("  variants:")
        for v in variants:
            L.append(f"    - {_js_json(v)}")
    _write_base_trailers(p, L)


def _write_document(d: dict, L: list[str]) -> None:
    L.append(f"  title: {_quote_if_needed(d.get('title', ''))}")
    if _t(d.get("author")):
        author = d["author"]
        L.append(f"  author: {', '.join(author) if isinstance(author, list) else author}")
    if _t(d.get("published_at")):
        L.append(f"  published: {d['published_at']}")
    if _t(d.get("modified_at")):
        L.append(f"  modified: {d['modified_at']}")
    if _t(d.get("summary")):
        L.append(f"  summary: {_quote_if_needed(d['summary'])}")
    if d.get("word_count") is not None:
        L.append(f"  word_count: {_scalar(d['word_count'])}")
    if d.get("reading_time") is not None:
        L.append(f"  reading_time: {_scalar(d['reading_time'])}s")
    if _t(d.get("language")):
        L.append(f"  language: {d['language']}")
    tags = d.get("tags")
    if tags and len(tags):
        L.append(f"  tags: {', '.join(tags)}")
    if _t(d.get("canonical_url")):
        L.append(f"  canonical_url: {d['canonical_url']}")
    if _t(d.get("content")):
        L.append("  content: |")
        L.append(_indent_block(d["content"], 4))
    chunks = d.get("chunks")
    if chunks and len(chunks):
        L.append("  chunks:")
        for c in chunks:
            L.append(f"    - {_js_json(c)}")
    _write_base_trailers(d, L)


def _write_task(t: dict, L: list[str]) -> None:
    L.append(f"  title: {_quote_if_needed(t.get('title', ''))}")
    L.append(f"  state: {t.get('state')}")
    if _t(t.get("priority")):
        L.append(f"  priority: {t['priority']}")
    if _t(t.get("assignee")):
        L.append(f"  assignee: {t['assignee']}")
    if _t(t.get("due_at")):
        L.append(f"  due: {t['due_at']}")
    if _t(t.get("parent")):
        L.append(f"  parent: {t['parent']}")
    labels = t.get("labels")
    if labels and len(labels):
        L.append(f"  labels: {', '.join(labels)}")
    if _t(t.get("description")):
        L.append(f"  description: {_quote_if_needed(t['description'])}")
    _write_base_trailers(t, L)


def _write_profile(p: dict, L: list[str]) -> None:
    L.append(f"  name: {_quote_if_needed(p.get('name', ''))}")
    L.append(f"  kind: {p.get('kind')}")
    if _t(p.get("handle")):
        L.append(f"  handle: {p['handle']}")
    if _t(p.get("email")):
        L.append(f"  email: {p['email']}")
    if _t(p.get("homepage")):
        L.append(f"  homepage: {p['homepage']}")
    if _t(p.get("bio")):
        L.append(f"  bio: {_quote_if_needed(p['bio'])}")
    if _t(p.get("verified")):
        L.append("  verified: yes")
    if _t(p.get("avatar")):
        L.append(f"  avatar: {_asset(p['avatar'])}")
    if _t(p.get("attributes")):
        L.append("  attributes:")
        for k, v in p["attributes"].items():
            L.append(f"    {k}: {_quote_if_needed(v)}")
    _write_base_trailers(p, L)


def _write_dataset(d: dict, L: list[str]) -> None:
    L.append(f"  name: {_quote_if_needed(d.get('name', ''))}")
    if _t(d.get("description")):
        L.append(f"  description: {_quote_if_needed(d['description'])}")
    if d.get("row_count_total") is not None:
        L.append(f"  row_count_total: {_scalar(d['row_count_total'])}")
    cols = ", ".join(
        f"{c.get('key')}:{c.get('label')}:{c.get('type')}"
        + (f":{c['format']}" if _t(c.get("format")) else "")
        for c in d.get("columns", [])
    )
    L.append(f"  columns: {cols}")
    L.append("  rows:")
    for row in d.get("rows", []):
        L.append(f"    - {_js_json(row)}")
    _write_base_trailers(d, L)


def _write_conversation(c: dict, L: list[str]) -> None:
    if _t(c.get("title")):
        L.append(f"  title: {_quote_if_needed(c['title'])}")
    L.append(f"  participants: {', '.join(c.get('participants', []))}")
    if c.get("message_count_total") is not None:
        L.append(f"  message_count_total: {_scalar(c['message_count_total'])}")
    L.append("  messages:")
    for m in c.get("messages", []):
        L.append(f"    - {_js_json(m)}")
    _write_base_trailers(c, L)


def _write_base_trailers(e: dict, L: list[str]) -> None:
    if _t(e.get("freshness")):
        L.append(f"  freshness: {e['freshness']}")
    if _t(e.get("updated_at")):
        L.append(f"  updated: {e['updated_at']}")


def _write_images(images: list[dict], L: list[str]) -> None:
    simple = all(
        not _t(i.get("alt")) and i.get("width") is None and i.get("height") is None
        for i in images
    )
    if simple:
        L.append(f"  images: {', '.join(i.get('url', '') for i in images)}")
    else:
        L.append("  images:")
        for img in images:
            L.append(f"    - {_js_json(img)}")


def _write_action(a: dict, L: list[str]) -> None:
    if _t(a.get("label")):
        L.append(f"  label: {_quote_if_needed(a['label'])}")
    if _t(a.get("category")):
        L.append(f"  category: {a['category']}")
    if _t(a.get("target")):
        target = a["target"]
        L.append(f"  target: {', '.join(target) if isinstance(target, list) else target}")
    if _t(a.get("method")):
        L.append(f"  method: {a['method']}")
    if _t(a.get("execute_url")):
        L.append(f"  execute: {a['execute_url']}")
    if _t(a.get("preview_url")):
        L.append(f"  preview: {a['preview_url']}")
    if a.get("auth") is not None:
        auth = a["auth"]
        if isinstance(auth, str):
            L.append(f"  auth: {auth}")
        else:
            scopes = auth.get("scopes")
            scopes_str = f" {','.join(scopes)}" if scopes and len(scopes) else ""
            L.append(f"  auth: scheme={auth.get('scheme')}{scopes_str}")
    if _t(a.get("cost")):
        c = a["cost"]
        parts: list[str] = []
        if c.get("amount") is not None and _t(c.get("currency")):
            parts.append(f"{_scalar(c['amount'])} {c['currency']}")
        elif c.get("amount") is not None:
            parts.append(_scalar(c["amount"]))
        if _t(c.get("unit")):
            parts.append(f"/{c['unit']}")
        parts.append(str(c.get("category")))
        if _t(c.get("notes")):
            parts.append(f"({c['notes']})")
        L.append(f"  cost: {' '.join(parts)}")
    if _t(a.get("reversible")):
        rev = a["reversible"]
        if not _t(rev.get("reversible")):
            L.append("  reversible: no")
        else:
            parts = [x for x in (rev.get("window"), rev.get("policy")) if _t(x)]
            L.append(f"  reversible: {' '.join(parts) or 'yes'}")
    side_effects = a.get("side_effects")
    if side_effects and len(side_effects):
        L.append(f"  side_effects: {', '.join(side_effects)}")
    if _t(a.get("confirmation")):
        L.append(f"  confirmation: {a['confirmation']}")
    if _t(a.get("rate_limit")):
        L.append(f"  rate_limit: {a['rate_limit']}")
    if _t(a.get("input")):
        L.append(f"  input: {_js_json(a['input'])}")
    if _t(a.get("output")):
        L.append(f"  output: {_js_json(a['output'])}")


def _write_kv(obj: dict, L: list[str]) -> None:
    for k, v in obj.items():
        L.append(f"  {k}: {_format_typed_scalar(v)}")


# --- scalar helpers ---


def _scalar(v: Any) -> str:
    """Interpolate a value the way JS template literals stringify numbers."""
    if isinstance(v, bool):
        return "true" if v else "false"
    if isinstance(v, (int, float)):
        return _num(v)
    return str(v)


def _money(m: dict) -> str:
    return f"{_scalar(m.get('amount'))} {m.get('currency')}"


def _stock(s: dict) -> str:
    if s.get("quantity") is not None:
        return f"{s.get('status')} ({_scalar(s['quantity'])})"
    return str(s.get("status"))


def _asset(a: dict) -> str:
    if not _t(a.get("alt")) and a.get("width") is None and a.get("height") is None:
        return a.get("url", "")
    return _js_json(a)


def _format_typed_scalar(v: Any) -> str:
    if v is None:
        return "null"
    if isinstance(v, bool):
        return "true" if v else "false"
    if isinstance(v, (int, float)):
        return _num(v)
    if isinstance(v, str):
        return _quote_if_needed(v)
    return _js_json(v)


_WS_EDGE = re.compile(r"^\s|\s$")


def _quote_if_needed(s: str) -> str:
    if "\n" in s:
        return _js_json(s)
    if _WS_EDGE.search(s):
        return _js_json(s)
    return s


def _indent_block(s: str, spaces: int) -> str:
    pad = " " * spaces
    return "\n".join(pad + line for line in s.split("\n"))


# =====================================================================
# Parser — lossless against the serializer above.
# =====================================================================


class _Body:
    __slots__ = ("scalars", "lists", "blocks", "subs")

    def __init__(self) -> None:
        self.scalars: dict[str, str] = {}
        # lists: key -> list of (head, cont_lines)
        self.lists: dict[str, list[tuple[str, list[str]]]] = {}
        self.blocks: dict[str, str] = {}
        self.subs: dict[str, dict[str, str]] = {}


def from_compact(text: str) -> Snapshot:
    if not isinstance(text, str):
        raise AHTMLError(
            "COMPACT_PARSE",
            "from_compact() expects a string",
            cause=text,
        )
    try:
        return _from_compact_inner(text)
    except AHTMLError:
        raise
    except Exception as err:
        raise AHTMLError(
            "COMPACT_PARSE",
            f"failed to parse ahtml+text: {err}",
            cause=err,
        ) from err


_ENVELOPE_RE = re.compile(r"^@(\w+)\s+(.*)$")
_KV_RE = re.compile(r"^([^:]+):\s*(.*)$")


def _from_compact_inner(text: str) -> Snapshot:
    lines = text.split("\n")
    snap = Snapshot(
        ahtml="0.1",
        url="",
        fetched_at="",
        page_type="other",
        entities=[],
        actions=[],
    )

    i = 0
    # Envelope (top-level @directives until blank line / first block).
    while i < len(lines):
        line = lines[i]
        if line.strip() == "":
            break
        if not line.startswith("@"):
            break
        m = _ENVELOPE_RE.match(line)
        if m:
            _apply_envelope(snap, m.group(1), m.group(2).strip())
        i += 1

    while i < len(lines):
        line = lines[i]
        if line.strip() == "":
            i += 1
            continue

        if line.startswith("@"):
            name = line[1:].strip()
            body, i = _read_body(lines, i + 1)
            _apply_named_block(snap, name, body)
            continue
        if line.startswith("[") and line.endswith("]"):
            entity_id = line[1:-1]
            body, i = _read_body(lines, i + 1)
            e = _parse_entity(entity_id, body)
            if e is not None:
                snap["entities"].append(e)
            continue
        if line.startswith("(action) "):
            action_id = line[9:].strip()
            body, i = _read_body(lines, i + 1)
            snap["actions"].append(_parse_action(action_id, body))
            continue
        i += 1
    return snap


def _read_body(lines: list[str], start: int) -> tuple[_Body, int]:
    body = _Body()
    i = start

    while i < len(lines):
        raw = lines[i]
        if raw.strip() == "":
            break
        if not raw.startswith("  "):
            break
        if raw.startswith("   ") and not raw.startswith("    "):
            # a stray 3-space line — treat as end of body
            break
        if raw.startswith("    "):
            # Stray indented line with no opener — skip.
            i += 1
            continue

        inner = raw[2:]
        m = _KV_RE.match(inner)
        if not m:
            i += 1
            continue
        key = m.group(1).strip()
        val = m.group(2)

        if val == "|":
            # block scalar — read 4+ space indented lines, strip 4 spaces
            i += 1
            buf: list[str] = []
            while i < len(lines) and lines[i].startswith("    "):
                buf.append(lines[i][4:])
                i += 1
            body.blocks[key] = "\n".join(buf)
            continue

        if val == "":
            # nested list OR sub-body. Peek following lines to distinguish.
            i += 1
            items: list[tuple[str, list[str]]] = []
            sub: dict[str, str] = {}
            is_list = False
            is_sub = False
            while i < len(lines):
                peek = lines[i]
                if peek.strip() == "":
                    break
                if not peek.startswith("    "):
                    break
                if peek.startswith("      ") and items:
                    items[-1][1].append(peek[6:])
                    i += 1
                    continue
                child = peek[4:]
                if child.startswith("- "):
                    is_list = True
                    items.append((child[2:], []))
                    i += 1
                    continue
                sm = _KV_RE.match(child)
                if sm:
                    is_sub = True
                    sub[sm.group(1).strip()] = _unquote(sm.group(2))
                    i += 1
                    continue
                break
            if is_list:
                body.lists[key] = items
            elif is_sub:
                body.subs[key] = sub
            else:
                body.scalars[key] = ""
            continue

        body.scalars[key] = _unquote(val)
        i += 1

    return body, i


def _unquote(s: str) -> str:
    if len(s) >= 2 and s.startswith('"') and s.endswith('"'):
        try:
            parsed = json.loads(s)
            if isinstance(parsed, str):
                return parsed
            return s
        except Exception:
            return s
    return s


def _apply_envelope(snap: Snapshot, key: str, val: str) -> None:
    if key == "ahtml":
        snap["ahtml"] = val
    elif key == "url":
        snap["url"] = val
    elif key == "fetched":
        snap["fetched_at"] = val
    elif key == "ttl":
        snap["ttl"] = _parse_int(val)
    elif key == "etag":
        snap["etag"] = val
    elif key == "page_type":
        snap["page_type"] = val


def _apply_named_block(snap: Snapshot, name: str, body: _Body) -> None:
    if name == "policy":
        snap["policy"] = _parse_policy(body.scalars)
    elif name == "provenance":
        snap["provenance"] = _parse_provenance(body.scalars)
    elif name == "meta":
        snap["meta"] = {k: _coerce_typed_scalar(v) for k, v in body.scalars.items()}
    elif name == "links":
        snap["links"] = _parse_links(body.scalars)
    elif name == "schemas":
        out: dict[str, Any] = {}
        for k, v in body.scalars.items():
            try:
                out[k] = json.loads(v)
            except Exception:
                pass  # skip malformed
        snap["schemas"] = out


def _parse_policy(s: dict[str, str]) -> dict:
    p: dict[str, Any] = {"agents_welcome": s.get("agents_welcome") == "yes"}
    if s.get("license"):
        p["license"] = s["license"]
    if s.get("rate_limit"):
        p["rate_limit"] = s["rate_limit"]
    if s.get("actions_require"):
        p["actions_require"] = s["actions_require"]
    if s.get("contact"):
        p["contact"] = s["contact"]
    if s.get("terms_url"):
        p["terms_url"] = s["terms_url"]
    if s.get("attribution_required") == "yes":
        p["attribution_required"] = True
    if s.get("republish"):
        p["republish"] = s["republish"]
    if s.get("caching"):
        caching: dict[str, Any] = {}
        for tok in re.split(r"\s+", s["caching"]):
            if tok == "allowed":
                caching["allowed"] = True
            elif tok == "denied":
                caching["allowed"] = False
            elif tok.startswith("ttl="):
                caching["ttl"] = _parse_int(tok[4:])
        p["caching"] = caching
    return p


def _parse_provenance(s: dict[str, str]) -> dict:
    p: dict[str, Any] = {}
    if s.get("issuer"):
        p["issuer"] = s["issuer"]
    if s.get("signed") in ("yes", "true"):
        p["signed"] = True
    elif s.get("signed") in ("no", "false"):
        p["signed"] = False
    if s.get("signature"):
        p["signature"] = s["signature"]
    if s.get("signature_alg"):
        p["signature_alg"] = s["signature_alg"]
    if s.get("fetched_via"):
        p["fetched_via"] = s["fetched_via"]
    return p


def _parse_links(s: dict[str, str]) -> dict:
    l: dict[str, Any] = {}
    if s.get("self"):
        l["self"] = s["self"]
    if s.get("canonical"):
        l["canonical"] = s["canonical"]
    if s.get("parent"):
        l["parent"] = s["parent"]
    if s.get("next"):
        l["next"] = _parse_pagination_link(s["next"])
    if s.get("prev"):
        l["prev"] = _parse_pagination_link(s["prev"])
    if s.get("related"):
        l["related"] = [x.strip() for x in s["related"].split(",") if x.strip()]
    return l


def _parse_pagination_link(s: str) -> dict:
    out: dict[str, Any] = {}
    for tok in (t for t in re.split(r"\s+", s) if t):
        eq = tok.find("=")
        if eq < 0:
            continue
        k, v = tok[:eq], tok[eq + 1 :]
        if k == "cursor":
            out["cursor"] = v
        elif k == "url":
            out["url"] = v
        elif k == "expected":
            out["expected"] = _parse_int(v)
        elif k == "total":
            out["total"] = _parse_int(v)
    return out


_NUMERIC_RE = re.compile(r"^-?\d+(\.\d+)?$")


def _coerce_typed_scalar(v: str) -> Any:
    if v == "null":
        return None
    if v == "true":
        return True
    if v == "false":
        return False
    if _NUMERIC_RE.match(v):
        return _js_number(v)
    if v.startswith("{") or v.startswith("["):
        try:
            return json.loads(v)
        except Exception:
            pass
    return v


def _js_number(s: str) -> int | float:
    """Parse like JS ``Number(...)`` but keep JSON int/float distinction:
    digits-only stays int (JSON.stringify of a whole float prints the same
    bytes anyway, so this preserves byte-level round-trips)."""
    if "." in s or "e" in s or "E" in s:
        return float(s)
    return int(s)


def _parse_int(s: str, default: int = 0) -> int:
    """``parseInt(s, 10)`` semantics: leading integer prefix."""
    m = re.match(r"^\s*[+-]?\d+", s)
    return int(m.group(0)) if m else default


def _parse_float(s: str) -> float:
    m = re.match(r"^\s*[+-]?(\d+(\.\d*)?|\.\d+)([eE][+-]?\d+)?", s)
    return float(m.group(0)) if m else 0.0


def _parse_number(s: str) -> int | float:
    """parseFloat, but int-typed when the text is a plain integer (so the
    canonical JSON round-trip stays byte-identical: "1999" not "1999.0")."""
    if _NUMERIC_RE.match(s):
        return _js_number(s)
    return _parse_float(s)


def _base_of(entity_id: str, body: _Body) -> dict:
    s = body.scalars
    base: dict[str, Any] = {"id": entity_id}
    if s.get("updated"):
        base["updated_at"] = s["updated"]
    if s.get("freshness"):
        base["freshness"] = s["freshness"]
    return base


def _parse_entity(entity_id: str, body: _Body) -> Optional[dict]:
    entity_type = entity_id.split(":")[0]
    base = _base_of(entity_id, body)
    if entity_type == "product":
        return _parse_product(base, body)
    if entity_type == "document":
        return _parse_document(base, body)
    if entity_type == "task":
        return _parse_task(base, body)
    if entity_type == "profile":
        return _parse_profile(base, body)
    if entity_type == "dataset":
        return _parse_dataset(base, body)
    if entity_type == "conversation":
        return _parse_conversation(base, body)
    return None


_RATING_RE = re.compile(r"^([\d.]+)\s*\((\d+)\)$")


def _parse_product(base: dict, body: _Body) -> dict:
    s = body.scalars
    p: dict[str, Any] = {**base, "type": "product", "name": s.get("name", "")}
    if s.get("brand"):
        p["brand"] = s["brand"]
    if s.get("description"):
        p["description"] = s["description"]
    if s.get("price"):
        p["price"] = _parse_money(s["price"])
    if s.get("list_price"):
        p["list_price"] = _parse_money(s["list_price"])
    if s.get("stock"):
        p["stock"] = _parse_stock(s["stock"])
    if s.get("sku"):
        p["sku"] = s["sku"]
    if s.get("rating"):
        m = _RATING_RE.match(s["rating"])
        if m:
            p["rating"] = {"average": _parse_number(m.group(1)), "count": _parse_int(m.group(2))}
    if s.get("category"):
        p["category"] = s["category"]
    if s.get("images"):
        imgs = [{"url": u.strip()} for u in s["images"].split(",")]
        p["images"] = [a for a in imgs if a["url"]]
    elif "images" in body.lists:
        imgs2 = [_safe_parse_json(head) for head, _ in body.lists["images"]]
        p["images"] = [x for x in imgs2 if x is not None]
    if "attributes" in body.subs:
        p["attributes"] = {
            k: _coerce_attribute(v) for k, v in body.subs["attributes"].items()
        }
    if "variants" in body.lists:
        variants = [
            v
            for v in (_safe_parse_json(head) for head, _ in body.lists["variants"])
            if v is not None
        ]
        if variants:
            p["variants"] = variants
    return p


def _parse_document(base: dict, body: _Body) -> dict:
    s = body.scalars
    d: dict[str, Any] = {**base, "type": "document", "title": s.get("title", "")}
    if s.get("author"):
        author = s["author"]
        if "," in author:
            d["author"] = [a.strip() for a in author.split(",") if a.strip()]
        else:
            d["author"] = author
    if s.get("published"):
        d["published_at"] = s["published"]
    if s.get("modified"):
        d["modified_at"] = s["modified"]
    if s.get("summary"):
        d["summary"] = s["summary"]
    if s.get("word_count"):
        d["word_count"] = _parse_int(s["word_count"])
    if s.get("reading_time"):
        num = re.sub(r"s$", "", s["reading_time"])
        d["reading_time"] = _parse_int(num)
    if s.get("language"):
        d["language"] = s["language"]
    if s.get("tags"):
        d["tags"] = [t.strip() for t in s["tags"].split(",") if t.strip()]
    if s.get("canonical_url"):
        d["canonical_url"] = s["canonical_url"]
    if body.blocks.get("content"):
        d["content"] = body.blocks["content"]
    if "chunks" in body.lists:
        chunks = [
            c
            for c in (_safe_parse_json(head) for head, _ in body.lists["chunks"])
            if c is not None
        ]
        if chunks:
            d["chunks"] = chunks
    return d


def _parse_task(base: dict, body: _Body) -> dict:
    s = body.scalars
    t: dict[str, Any] = {
        **base,
        "type": "task",
        "title": s.get("title", ""),
        "state": s.get("state", "open"),
    }
    if s.get("priority"):
        t["priority"] = s["priority"]
    if s.get("assignee"):
        t["assignee"] = s["assignee"]
    if s.get("due"):
        t["due_at"] = s["due"]
    if s.get("parent"):
        t["parent"] = s["parent"]
    if s.get("labels"):
        t["labels"] = [x.strip() for x in s["labels"].split(",") if x.strip()]
    if s.get("description"):
        t["description"] = s["description"]
    return t


def _parse_profile(base: dict, body: _Body) -> dict:
    s = body.scalars
    p: dict[str, Any] = {
        **base,
        "type": "profile",
        "name": s.get("name", ""),
        "kind": s.get("kind", "person"),
    }
    if s.get("handle"):
        p["handle"] = s["handle"]
    if s.get("email"):
        p["email"] = s["email"]
    if s.get("homepage"):
        p["homepage"] = s["homepage"]
    if s.get("bio"):
        p["bio"] = s["bio"]
    if s.get("verified") in ("yes", "true"):
        p["verified"] = True
    if s.get("avatar"):
        if s["avatar"].startswith("{"):
            a = _safe_parse_json(s["avatar"])
            if a is not None:
                p["avatar"] = a
        else:
            p["avatar"] = {"url": s["avatar"]}
    if "attributes" in body.subs:
        p["attributes"] = dict(body.subs["attributes"])
    return p


def _parse_dataset(base: dict, body: _Body) -> dict:
    s = body.scalars
    cols = []
    for spec in (c.strip() for c in s.get("columns", "").split(",")):
        if not spec:
            continue
        parts = spec.split(":")
        col: dict[str, Any] = {
            "key": parts[0] if len(parts) > 0 else "",
            "label": parts[1] if len(parts) > 1 else (parts[0] if parts else ""),
            "type": parts[2] if len(parts) > 2 else "string",
        }
        if len(parts) > 3 and parts[3]:
            col["format"] = parts[3]
        cols.append(col)
    rows = [
        r
        for r in (_safe_parse_json(head) for head, _ in body.lists.get("rows", []))
        if isinstance(r, list)
    ]
    d: dict[str, Any] = {
        **base,
        "type": "dataset",
        "name": s.get("name", ""),
        "columns": cols,
        "rows": rows,
    }
    if s.get("description"):
        d["description"] = s["description"]
    if s.get("row_count_total"):
        d["row_count_total"] = _parse_int(s["row_count_total"])
    return d


def _parse_conversation(base: dict, body: _Body) -> dict:
    s = body.scalars
    messages = [
        m
        for m in (_safe_parse_json(head) for head, _ in body.lists.get("messages", []))
        if m is not None
    ]
    c: dict[str, Any] = {
        **base,
        "type": "conversation",
        "participants": (
            [p.strip() for p in s["participants"].split(",") if p.strip()]
            if s.get("participants")
            else []
        ),
        "messages": messages,
    }
    if s.get("title"):
        c["title"] = s["title"]
    if s.get("message_count_total"):
        c["message_count_total"] = _parse_int(s["message_count_total"])
    return c


_HTTP_VERBS = {"GET", "POST", "PUT", "PATCH", "DELETE"}


def _parse_action(action_id: str, body: _Body) -> dict:
    s = body.scalars
    a: dict[str, Any] = {"id": action_id}
    if s.get("label"):
        a["label"] = s["label"]
    if s.get("category"):
        a["category"] = s["category"]
    if s.get("target"):
        target = s["target"]
        if "," in target:
            a["target"] = [t.strip() for t in target.split(",") if t.strip()]
        else:
            a["target"] = target
    if s.get("method"):
        a["method"] = s["method"]
    if s.get("execute"):
        execute = s["execute"]
        ix = execute.find(" ")
        if ix > 0 and execute[:ix] in _HTTP_VERBS:
            # v0.4 back-compat: "METHOD url"
            a["execute_url"] = execute[ix + 1 :].strip()
            if "method" not in a:
                a["method"] = execute[:ix]
        else:
            a["execute_url"] = execute
    if s.get("preview"):
        a["preview_url"] = s["preview"]
    if s.get("auth"):
        a["auth"] = _parse_auth(s["auth"])
    if s.get("cost"):
        a["cost"] = _parse_cost(s["cost"])
    if s.get("reversible"):
        rev = s["reversible"]
        if rev == "no":
            a["reversible"] = {"reversible": False}
        elif rev == "yes":
            a["reversible"] = {"reversible": True}
        else:
            toks = re.split(r"\s+", rev)
            r: dict[str, Any] = {"reversible": True}
            if toks and toks[0]:
                r["window"] = toks[0]
            if len(toks) > 1:
                r["policy"] = " ".join(toks[1:])
            a["reversible"] = r
    if s.get("side_effects"):
        a["side_effects"] = [x.strip() for x in s["side_effects"].split(",") if x.strip()]
    if s.get("confirmation"):
        a["confirmation"] = s["confirmation"]
    if s.get("rate_limit"):
        a["rate_limit"] = s["rate_limit"]
    if s.get("input"):
        v = _safe_parse_json(s["input"])
        if v is not None:
            a["input"] = v
    if s.get("output"):
        v = _safe_parse_json(s["output"])
        if v is not None:
            a["output"] = v
    return a


def _parse_auth(s: str) -> Any:
    if s in ("none", "optional", "required"):
        return s
    if s.startswith("scheme="):
        parts = re.split(r"\s+", s)
        out: dict[str, Any] = {"scheme": parts[0][7:]}
        if len(parts) > 1 and parts[1]:
            out["scopes"] = [x.strip() for x in parts[1].split(",") if x.strip()]
        return out
    return s


_CURRENCY_RE = re.compile(r"^[A-Z]{2,4}$")


def _parse_cost(s: str) -> dict:
    tokens = re.split(r"\s+", s)
    cost: dict[str, Any] = {"category": "free"}

    i = 0
    # optional amount + currency
    if i < len(tokens) and tokens[i] and tokens[i][0].isdigit():
        cost["amount"] = _parse_number(tokens[i])
        i += 1
        if i < len(tokens) and _CURRENCY_RE.match(tokens[i]):
            cost["currency"] = tokens[i]
            i += 1
    # optional /unit
    if i < len(tokens) and tokens[i].startswith("/"):
        cost["unit"] = tokens[i][1:]
        i += 1
    # category
    if i < len(tokens) and tokens[i]:
        cost["category"] = tokens[i]
        i += 1
    # optional "(notes)"
    if i < len(tokens):
        rest = " ".join(tokens[i:])
        m = re.match(r"^\((.*)\)$", rest, re.DOTALL)
        if m:
            cost["notes"] = m.group(1)
    return cost


_MONEY_RE = re.compile(r"^([\d.]+)\s+(\w+)$")
_STOCK_RE = re.compile(r"^(\w+)\s*(?:\((\d+)\))?$")


def _parse_money(s: str) -> dict:
    m = _MONEY_RE.match(s)
    if m:
        return {"amount": _parse_number(m.group(1)), "currency": m.group(2)}
    return {"amount": 0, "currency": "USD"}


def _parse_stock(s: str) -> dict:
    m = _STOCK_RE.match(s)
    if not m:
        return {"status": "in_stock"}
    if m.group(2):
        return {"status": m.group(1), "quantity": _parse_int(m.group(2))}
    return {"status": m.group(1)}


def _coerce_attribute(v: str) -> Any:
    if v == "true":
        return True
    if v == "false":
        return False
    if _NUMERIC_RE.match(v):
        return _js_number(v)
    return v


def _safe_parse_json(s: str) -> Any:
    try:
        return json.loads(s)
    except Exception:
        return None
