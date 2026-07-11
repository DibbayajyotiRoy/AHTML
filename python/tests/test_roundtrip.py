"""TASKS.md T2.2 — cross-implementation round-trip fidelity.

Every fixture in tests/fixtures/ was emitted by the TypeScript reference
implementation (@ahtmljs/schema) via _gen_fixtures.mjs. The Python SDK must:

- re-emit the canonical JSON BYTE-IDENTICALLY (SPEC.md §1.1), and
- round-trip the compact text losslessly (SPEC.md §9).

Byte-identity against a second implementation is the strongest conformance
signal we have — it is what makes signatures and ETags portable.
"""
import json
from pathlib import Path

import pytest

import ahtml

FIXTURES = Path(__file__).parent / "fixtures"
NAMES = json.loads((FIXTURES / "manifest.json").read_text())


@pytest.mark.parametrize("name", NAMES)
def test_canonical_json_byte_identical(name: str) -> None:
    ref = (FIXTURES / f"{name}.json").read_text()
    snap = ahtml.from_json(ref)
    assert ahtml.to_json(snap) == ref, f"{name}: Python canonical JSON differs from TS reference"


@pytest.mark.parametrize("name", NAMES)
def test_compact_round_trips_losslessly(name: str) -> None:
    ref_compact = (FIXTURES / f"{name}.txt").read_text()
    snap = ahtml.from_compact(ref_compact)
    assert ahtml.to_compact(snap) == ref_compact, f"{name}: compact re-emit differs"


@pytest.mark.parametrize("name", NAMES)
def test_compact_parse_matches_ts_parse_bytes(name: str) -> None:
    """Parsing compact must yield byte-identical canonical JSON to the TS
    parser's output for the same input. (Nested key order differs between the
    builder and the compact parser — SPEC §1.1 rule 2 producer order — so the
    reference is TS fromCompact→toJson, not the builder's JSON.)"""
    ts_parse = (FIXTURES / f"{name}.fromcompact.json").read_text()
    from_c = ahtml.from_compact((FIXTURES / f"{name}.txt").read_text())
    assert ahtml.to_json(from_c) == ts_parse, f"{name}: compact parse differs from TS"


@pytest.mark.parametrize("name", NAMES)
def test_json_and_compact_carry_same_data(name: str) -> None:
    """Order-insensitive: both serializations decode to the same data."""
    from_j = json.loads(ahtml.to_json(ahtml.from_json((FIXTURES / f"{name}.json").read_text())))
    from_c = json.loads(ahtml.to_json(ahtml.from_compact((FIXTURES / f"{name}.txt").read_text())))
    assert from_c == from_j, f"{name}: serializations carry different data"


def test_key_order_is_the_spec_order() -> None:
    """SPEC.md §1.1 rule 1: fixed top-level key order."""
    assert ahtml.KEY_ORDER == [
        "ahtml", "url", "fetched_at", "ttl", "etag", "page_type", "policy",
        "provenance", "entities", "actions", "links", "schemas", "meta",
    ]


def test_unknown_top_level_keys_are_not_emitted() -> None:
    """SPEC.md §1.1 rule 1: top-level keys not in the list MUST NOT be emitted."""
    ref = (FIXTURES / "empty.json").read_text()
    snap = ahtml.from_json(ref)
    snap["_totally_unknown"] = True
    assert "_totally_unknown" not in ahtml.to_json(snap)
