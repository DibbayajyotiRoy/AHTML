"""Snapshot — a thin dict wrapper prioritizing round-trip fidelity.

A snapshot is fundamentally the parsed JSON object; wrapping it in a dict
subclass keeps every producer key (and key order) intact while allowing
``snap.url`` style attribute access for the documented envelope fields.
"""

from __future__ import annotations

from typing import Any

__all__ = ["Snapshot"]


class Snapshot(dict):
    """A parsed AHTML snapshot. Behaves as a dict; envelope fields are also
    readable/writable as attributes (``snap.url``, ``snap.entities``...).

    Key insertion order is preserved and is significant: canonical JSON
    serialization (SPEC.md §1.1) fixes the top-level order but nested
    objects serialize in producer order.
    """

    def __getattr__(self, name: str) -> Any:
        try:
            return self[name]
        except KeyError:
            raise AttributeError(name) from None

    def __setattr__(self, name: str, value: Any) -> None:
        self[name] = value

    def __delattr__(self, name: str) -> None:
        try:
            del self[name]
        except KeyError:
            raise AttributeError(name) from None
