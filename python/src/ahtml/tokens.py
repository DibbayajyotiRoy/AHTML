"""Token measurement (optional ``[tokens]`` extra).

Mirrors ``packages/agent/src/tokens.ts``: the real tokenizer (tiktoken,
installed via ``pip install ahtml[tokens]``) is the measurement of record.
A clearly-named chars/4 *estimate* is provided for environments without a
tokenizer — it is an estimate, never a substitute in benchmarks.
"""

from __future__ import annotations

from typing import Callable, Optional

__all__ = ["estimate_tokens_chars_div4", "count_tokens", "measure"]

# Model → tiktoken encoding, mirroring the TS mapping (o-series and 4o use
# o200k_base; earlier GPT models use cl100k_base).
_MODEL_ENCODINGS = {
    "gpt-3.5-turbo": "cl100k_base",
    "gpt-4": "cl100k_base",
    "gpt-4o": "o200k_base",
    "gpt-4o-mini": "o200k_base",
    "o1": "o200k_base",
    "o3-mini": "o200k_base",
}


def estimate_tokens_chars_div4(text: str) -> int:
    """ESTIMATE ONLY: ceil(len(text) / 4).

    The industry rule-of-thumb of ~4 characters per token. Use
    :func:`count_tokens` with a real tokenizer for any measurement that
    will be reported or compared.
    """
    return (len(text) + 3) // 4


def count_tokens(
    text: str,
    model: str = "gpt-4o",
    *,
    encoding: Optional[str] = None,
    tokenizer: Optional[Callable[[str], int]] = None,
) -> int:
    """Count tokens with a real tokenizer.

    - ``tokenizer``: any callable ``text -> int`` (the hook for custom /
      provider tokenizers).
    - Otherwise uses tiktoken (``pip install ahtml[tokens]``) with the
      encoding for ``model`` (or an explicit ``encoding``).

    Raises ImportError with install instructions when tiktoken is absent —
    it does NOT silently fall back to chars/4.
    """
    if tokenizer is not None:
        return tokenizer(text)
    try:
        import tiktoken
    except ImportError as err:
        raise ImportError(
            "tiktoken is not installed. Run: pip install ahtml[tokens] "
            "(or pass tokenizer=..., or use estimate_tokens_chars_div4 for "
            "a rough, clearly-labeled estimate)."
        ) from err
    enc_name = encoding or _MODEL_ENCODINGS.get(model)
    if enc_name is None:
        enc = tiktoken.encoding_for_model(model)
    else:
        enc = tiktoken.get_encoding(enc_name)
    return len(enc.encode(text))


def measure(text: str, *, gzip: bool = True) -> dict:
    """Snapshot of every metric we can compute; skips unavailable
    tokenizers gracefully (mirrors ``measure`` in the TS agent)."""
    out: dict = {"bytes": len(text.encode("utf-8"))}
    if gzip:
        try:
            import zlib

            out["bytes_gzip"] = len(zlib.compress(text.encode("utf-8"), 9))
        except Exception:
            pass
    for key, enc in (("tokens_openai_cl100k", "cl100k_base"), ("tokens_openai_o200k", "o200k_base")):
        try:
            out[key] = count_tokens(text, encoding=enc)
        except Exception:
            pass
    out["tokens_estimate_chars_div4"] = estimate_tokens_chars_div4(text)
    return out
