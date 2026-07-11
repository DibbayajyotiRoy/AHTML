"""JavaScript-compatible JSON serialization.

The AHTML canonical JSON form (SPEC.md §1.1) is defined as "what
``JSON.stringify`` produces": no insignificant whitespace, RFC 8259 string
escaping exactly as V8 emits it, and ECMAScript ``Number::toString``
formatting for numbers. Python's ``json.dumps`` differs in three ways that
break byte-identity:

1. Default separators include spaces.
2. ``ensure_ascii=True`` escapes non-ASCII (JS emits it literally).
3. Float formatting: ``json.dumps(1999.0)`` → ``"1999.0"`` while
   ``JSON.stringify(1999.0)`` → ``"1999"``; exponent switch-over points
   also differ (Python switches at 1e16, JS at 1e21).

This module implements a small recursive serializer that matches
``JSON.stringify`` byte-for-byte for every value reachable from parsed
JSON (dict/list/str/int/float/bool/None).
"""

from __future__ import annotations

import math
from decimal import Decimal
from typing import Any

__all__ = ["dumps", "format_number"]

# Control-character short escapes used by JSON.stringify.
_SHORT_ESCAPES = {
    0x08: "\\b",
    0x09: "\\t",
    0x0A: "\\n",
    0x0C: "\\f",
    0x0D: "\\r",
    0x22: '\\"',
    0x5C: "\\\\",
}


def _quote_string(s: str) -> str:
    """Quote a string exactly like JSON.stringify (well-formed, ES2019)."""
    out = ['"']
    for ch in s:
        c = ord(ch)
        esc = _SHORT_ESCAPES.get(c)
        if esc is not None:
            out.append(esc)
        elif c < 0x20 or 0xD800 <= c <= 0xDFFF:
            # Control chars and lone surrogates → \uXXXX (lowercase hex,
            # matching V8's well-formed JSON.stringify).
            out.append("\\u%04x" % c)
        else:
            out.append(ch)
    out.append('"')
    return "".join(out)


def format_number(v: float | int) -> str:
    """Format a number exactly like ECMAScript ``Number::toString(10)``.

    Integers are emitted without a decimal point; floats use the shortest
    round-trip digits (which Python's ``repr`` also produces) reformatted
    per the ECMAScript layout rules (decimal notation for exponents in
    (-7, 21], exponential otherwise).
    """
    if isinstance(v, bool):  # pragma: no cover — callers filter bools first
        return "true" if v else "false"
    if isinstance(v, int):
        return str(v)
    if math.isnan(v) or math.isinf(v):
        # JSON.stringify(NaN/Infinity) → "null"
        return "null"
    if v == 0:
        return "0"  # covers -0.0 too: JSON.parse never yields -0 from "0"

    # repr() gives the shortest string that round-trips — the same digit
    # sequence ECMAScript uses. Re-layout it per the ES2020 rules.
    d = Decimal(repr(v))
    sign_neg, digits_tuple, exp = d.as_tuple()
    digits = "".join(map(str, digits_tuple))
    stripped = digits.rstrip("0") or "0"
    exp += len(digits) - len(stripped)
    digits = stripped

    k = len(digits)  # number of significant digits
    n = k + exp      # position of the decimal point

    if k <= n <= 21:
        body = digits + "0" * (n - k)
    elif 0 < n <= 21:
        body = digits[:n] + "." + digits[n:]
    elif -6 < n <= 0:
        body = "0." + "0" * (-n) + digits
    else:
        e = n - 1
        mant = digits if k == 1 else digits[0] + "." + digits[1:]
        body = f"{mant}e{'+' if e >= 0 else '-'}{abs(e)}"

    return ("-" + body) if sign_neg else body


def dumps(value: Any) -> str:
    """Serialize ``value`` byte-identically to ``JSON.stringify(value)``.

    Dict insertion order is preserved (matching JS object key order).
    No whitespace is emitted. Values that JSON.stringify would drop
    (functions, undefined) have no Python analogue here; every reachable
    value from ``json.loads`` is supported.
    """
    out: list[str] = []
    _write(value, out)
    return "".join(out)


def _write(v: Any, out: list[str]) -> None:
    if v is None:
        out.append("null")
    elif v is True:
        out.append("true")
    elif v is False:
        out.append("false")
    elif isinstance(v, str):
        out.append(_quote_string(v))
    elif isinstance(v, (int, float)):
        out.append(format_number(v))
    elif isinstance(v, dict):
        out.append("{")
        first = True
        for k, item in v.items():
            if not first:
                out.append(",")
            first = False
            out.append(_quote_string(str(k)))
            out.append(":")
            _write(item, out)
        out.append("}")
    elif isinstance(v, (list, tuple)):
        out.append("[")
        for i, item in enumerate(v):
            if i:
                out.append(",")
            _write(item, out)
        out.append("]")
    else:
        raise TypeError(f"cannot canonically serialize {type(v).__name__}")
